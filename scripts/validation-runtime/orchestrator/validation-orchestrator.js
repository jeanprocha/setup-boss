/**
 * Orquestração do grafo — estágios, batching implícito por nó, concorrência limitada (Fase 4.2).
 */

const crypto = require("crypto");
const {
  createEmptyValidationResults,
  finalizeValidationSummary,
  normalizeValidatorResultRow,
} = require("../contract");
const { getAdapter } = require("../validators/registry");
const {
  computeInputFingerprint,
  computeCacheKey,
  readCacheEntry,
  writeCacheEntry,
} = require("../cache/validation-cache");
const {
  emitValidationRuntimeEvent,
  appendTelemetryRecord,
} = require("../telemetry/validation-runtime-telemetry");
const { emitPlanTelemetryEvent } = require("../../execution-plan/telemetry/plan-telemetry");
const { defaultValidationTimeoutMs } = require("../validators/base-validator");

function validationConcurrency() {
  const n = Number(process.env.SETUP_BOSS_VALIDATION_MAX_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 16);
  return 2;
}

/**
 * @template T
 * @template R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, idx: number) => Promise<R>} fn
 */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const n = Math.max(1, Math.min(limit, items.length || 1));
  const workers = [];
  for (let i = 0; i < Math.min(n, items.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * @param {{
 *   ctx: object|null,
 *   outputDir: string,
 *   projectRoot: string,
 *   graph: object,
 *   plan_id: string,
 *   run_id: string,
 *   validation_run_id: string,
 *   validation_mode: string,
 *   policy_profile: string,
 *   signal?: AbortSignal|null,
 * }} opts
 */
async function runValidationOrchestration(opts) {
  const telemetryLocal = [];
  const graph = opts.graph && typeof opts.graph === "object" ? opts.graph : {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const stages = Array.isArray(graph.stages) ? graph.stages : [];
  const nodeById = new Map(nodes.map((n) => [n.validator_node_id, n]));

  const results = createEmptyValidationResults({
    validation_run_id: opts.validation_run_id,
    plan_id: opts.plan_id,
    generated_at: new Date().toISOString(),
    validation_mode: opts.validation_mode,
    policy_profile: opts.policy_profile,
  });

  results.metadata = {
    ...(results.metadata || {}),
    graph_fingerprint_sha256:
      graph.graph_fingerprint_sha256 != null ? String(graph.graph_fingerprint_sha256) : null,
    project_root: opts.projectRoot,
    concurrency: validationConcurrency(),
  };

  emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validation_graph_generated", {
    run_id: opts.run_id,
    plan_id: opts.plan_id,
    validation_run_id: opts.validation_run_id,
    nodes_total: nodes.length,
    graph_fingerprint_sha256: results.metadata.graph_fingerprint_sha256,
  });
  emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validation_graph_generated", {
    run_id: opts.run_id,
    plan_id: opts.plan_id,
    validation_run_id: opts.validation_run_id,
    nodes_total: nodes.length,
    graph_fingerprint_sha256: results.metadata.graph_fingerprint_sha256,
  });
  appendTelemetryRecord(telemetryLocal, "validation_graph_generated", {
    nodes_total: nodes.length,
    graph_fingerprint_sha256: results.metadata.graph_fingerprint_sha256,
  });

  /** @type {object[]} */
  const validatorsAcc = [];

  const concurrency = validationConcurrency();
  const timeoutMs = defaultValidationTimeoutMs();
  const signal = opts.signal || null;

  for (const st of stages) {
    const stageId = st && st.stage_id != null ? String(st.stage_id) : "";
    const ids = Array.isArray(st.validator_node_ids) ? st.validator_node_ids : [];
    const stageNodes = ids.map((id) => nodeById.get(id)).filter(Boolean);

    /** @type {{ stage_id: string, status: string, validators_completed: number }} */
    const stageSummary = {
      stage_id: stageId,
      status: "passed",
      validators_completed: 0,
      timings_ms_total: 0,
      metadata: {},
    };

    await mapPool(stageNodes, concurrency, async (node) => {
      const adapter = getAdapter(node.validator_type);
      const validator_id = node.validator_node_id;
      const pathsSorted = [...(node.paths || [])].sort((a, b) => a.localeCompare(b));

      const started_at = new Date().toISOString();
      const t0 = Date.now();

      emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validator_started", {
        run_id: opts.run_id,
        validator_id,
        validator_type: node.validator_type,
        stage: stageId,
        paths_count: pathsSorted.length,
      });
      emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validator_started", {
        run_id: opts.run_id,
        validator_id,
        validator_type: node.validator_type,
        stage: stageId,
      });
      appendTelemetryRecord(telemetryLocal, "validator_started", {
        validator_id,
        validator_type: node.validator_type,
        stage: stageId,
      });

      if (!adapter || typeof adapter.execute !== "function") {
        const row = normalizeValidatorResultRow({
          validator_id,
          validator_type: String(node.validator_type || ""),
          stage: stageId,
          target_ids: node.target_ids || [],
          paths: pathsSorted,
          scope: node.scope || "file",
          status: "skipped",
          duration_ms: 0,
          started_at,
          finished_at: new Date().toISOString(),
          cache_hit: false,
          replay_fingerprint_sha256: null,
          output: { reason: "unsupported_adapter" },
          warnings: [],
          errors: [],
          metadata: {},
        });
        validatorsAcc.push(row);
        emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
          run_id: opts.run_id,
          validator_id,
          status: "skipped",
          reason: "unsupported_adapter",
        });
        emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
          run_id: opts.run_id,
          validator_id,
          status: "skipped",
        });
        stageSummary.validators_completed += 1;
        return;
      }

      let input_fp = "";
      try {
        input_fp = computeInputFingerprint(opts.projectRoot, pathsSorted);
      } catch (_) {
        input_fp = "";
      }

      const cacheKey = computeCacheKey({
        validator_type: node.validator_type,
        stage: stageId,
        paths: pathsSorted,
        input_fp,
      });

      const cached = readCacheEntry(opts.outputDir, cacheKey);
      if (cached && cached.validator_snapshot && cached.validator_snapshot.status) {
        const row = normalizeValidatorResultRow({
          ...cached.validator_snapshot,
          cache_hit: true,
          duration_ms: 0,
          started_at,
          finished_at: new Date().toISOString(),
        });
        validatorsAcc.push(row);
        emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validation_cache_hit", {
          run_id: opts.run_id,
          validator_id,
          validator_type: node.validator_type,
        });
        emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validation_cache_hit", {
          run_id: opts.run_id,
          validator_id,
          validator_type: node.validator_type,
        });
        appendTelemetryRecord(telemetryLocal, "validation_cache_hit", {
          validator_id,
          cache_key_sha256: cacheKey,
        });
        emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
          run_id: opts.run_id,
          validator_id,
          status: row.status,
          cache_hit: true,
        });
        emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
          run_id: opts.run_id,
          validator_id,
          status: row.status,
          cache_hit: true,
        });
        if (row.status === "failed" || row.status === "error") {
          stageSummary.status = "partial";
        }
        stageSummary.validators_completed += 1;
        return;
      }

      let exec;
      try {
        exec = await adapter.execute({
          projectRoot: opts.projectRoot,
          paths: pathsSorted,
          scope: node.scope || "file",
          timeoutMs,
          signal,
        });
      } catch (err) {
        exec = {
          status: "error",
          output: { crash: String((err && err.message) || err || "") },
          warnings: [],
          errors: [`validator_crash:${(err && err.message) || err}`],
        };
      }

      const finished_at = new Date().toISOString();
      const duration_ms = Date.now() - t0;

      const replay_fp = crypto.createHash("sha256").update(`${cacheKey}|${input_fp}`, "utf8").digest("hex");

      const mappedStatus =
        exec && exec.status === "passed"
          ? "passed"
          : exec && exec.status === "skipped"
            ? "skipped"
            : exec && exec.status === "failed"
              ? "failed"
              : "error";

      const row = normalizeValidatorResultRow({
        validator_id,
        validator_type: node.validator_type,
        stage: stageId,
        target_ids: node.target_ids || [],
        paths: pathsSorted,
        scope: node.scope || "file",
        status: mappedStatus,
        duration_ms,
        started_at,
        finished_at,
        cache_hit: false,
        replay_fingerprint_sha256: replay_fp,
        output: exec && exec.output && typeof exec.output === "object" ? exec.output : {},
        warnings: exec && Array.isArray(exec.warnings) ? exec.warnings : [],
        errors: exec && Array.isArray(exec.errors) ? exec.errors : [],
        metadata: {
          cache_key_sha256: cacheKey,
          input_fingerprint_sha256: input_fp,
        },
      });

      validatorsAcc.push(row);

      writeCacheEntry(opts.outputDir, cacheKey, {
        schema_version: 1,
        saved_at: finished_at,
        cache_key_sha256: cacheKey,
        replay_fingerprint_sha256: replay_fp,
        validator_snapshot: row,
      });

      if (mappedStatus === "failed" || mappedStatus === "error") {
        emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validator_failed", {
          run_id: opts.run_id,
          validator_id,
          validator_type: node.validator_type,
          status: mappedStatus,
        });
        emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validator_failed", {
          run_id: opts.run_id,
          validator_id,
          validator_type: node.validator_type,
          status: mappedStatus,
        });
        appendTelemetryRecord(telemetryLocal, "validator_failed", {
          validator_id,
          status: mappedStatus,
        });
      }

      emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
        run_id: opts.run_id,
        validator_id,
        status: mappedStatus,
        duration_ms,
      });
      emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validator_completed", {
        run_id: opts.run_id,
        validator_id,
        status: mappedStatus,
        duration_ms,
      });

      stageSummary.validators_completed += 1;
      stageSummary.timings_ms_total += duration_ms;
      if (mappedStatus === "failed" || mappedStatus === "error") {
        stageSummary.status = "partial";
      }
    });

    const stageHadFail = validatorsAcc.some(
      (v) =>
        v.stage === stageId &&
        (v.status === "failed" || v.status === "error"),
    );
    if (stageHadFail && stageSummary.status === "passed") {
      stageSummary.status = "partial";
    }

    results.stages.push(stageSummary);

    emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validation_stage_completed", {
      run_id: opts.run_id,
      stage: stageId,
      status: stageSummary.status,
      validators: stageSummary.validators_completed,
    });
    emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validation_stage_completed", {
      run_id: opts.run_id,
      stage: stageId,
      status: stageSummary.status,
      validators: stageSummary.validators_completed,
    });
    appendTelemetryRecord(telemetryLocal, "validation_stage_completed", {
      stage: stageId,
      status: stageSummary.status,
    });
  }

  finalizeValidationSummary(results, validatorsAcc);
  results.telemetry = telemetryLocal;

  results.artifacts.push({
    kind: "validation_results_json",
    path: "validation-results.json",
  });
  results.artifacts.push({
    kind: "validation_runtime_cache",
    path: "validation-runtime-cache/",
  });

  emitValidationRuntimeEvent(opts.ctx && opts.ctx.telemetry, "validation_runtime_completed", {
    run_id: opts.run_id,
    plan_id: opts.plan_id,
    validation_run_id: opts.validation_run_id,
    summary_status: results.summary && results.summary.status,
  });
  emitPlanTelemetryEvent(opts.ctx && opts.ctx.telemetry, "validation_runtime_completed", {
    run_id: opts.run_id,
    plan_id: opts.plan_id,
    validation_run_id: opts.validation_run_id,
    summary_status: results.summary && results.summary.status,
  });
  appendTelemetryRecord(telemetryLocal, "validation_runtime_completed", {
    summary_status: results.summary && results.summary.status,
  });

  return { results, telemetry: telemetryLocal };
}

module.exports = {
  runValidationOrchestration,
  mapPool,
  validationConcurrency,
};
