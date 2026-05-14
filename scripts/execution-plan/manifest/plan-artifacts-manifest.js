/**
 * Manifesto extensível de artefactos associados ao Execution Plan (Fase 4.1.1).
 */

const fs = require("fs");
const path = require("path");
const { EXECUTION_PLAN_FILENAME } = require("../persistence/plan-store");
const { RECON_FILE } = require("../reconciliation/reconciliation-engine");
const {
  VALIDATION_TARGETS_FILENAME,
  VALIDATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  VALIDATION_PLAN_FILENAME,
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_CACHE_FILENAME,
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
  DEPENDENCY_GRAPH_FILENAME,
} = require("../validation-targeting/constants");
const {
  RISK_ANALYSIS_FILENAME,
  RISK_RUNTIME_MANIFEST_FILENAME,
} = require("../../risk-runtime/constants");

const MANIFEST_FILENAME = "plan-artifacts.json";

function buildValidationExecutionPlanExtension(dir) {
  const out = {};
  const planP = path.join(dir, VALIDATION_PLAN_FILENAME);
  const resP = path.join(dir, VALIDATION_RESULTS_FILENAME);
  const cacheP = path.join(dir, VALIDATION_CACHE_FILENAME);
  const sumP = path.join(dir, VALIDATION_RUNTIME_SUMMARY_FILENAME);

  if (fs.existsSync(planP)) out.validation_plan_ref = VALIDATION_PLAN_FILENAME;
  if (fs.existsSync(resP)) out.validation_results_ref = VALIDATION_RESULTS_FILENAME;
  if (fs.existsSync(cacheP)) out.validation_cache_ref = VALIDATION_CACHE_FILENAME;
  const dgP = path.join(dir, DEPENDENCY_GRAPH_FILENAME);
  if (fs.existsSync(dgP)) out.dependency_graph_ref = DEPENDENCY_GRAPH_FILENAME;
  const vpmP = path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME);
  if (fs.existsSync(vpmP)) out.validation_propagation_manifest_ref = VALIDATION_PROPAGATION_MANIFEST_FILENAME;

  if (fs.existsSync(sumP)) {
    out.summary_ref = VALIDATION_RUNTIME_SUMMARY_FILENAME;
    try {
      const st = fs.statSync(sumP);
      if (st.size <= 262144) {
        const sumDoc = JSON.parse(fs.readFileSync(sumP, "utf8"));
        if (sumDoc && typeof sumDoc === "object") {
          out.summary_snapshot = {
            summary: sumDoc.summary && typeof sumDoc.summary === "object" ? sumDoc.summary : {},
            fingerprints:
              sumDoc.fingerprints && typeof sumDoc.fingerprints === "object" ? sumDoc.fingerprints : {},
            counts: sumDoc.counts && typeof sumDoc.counts === "object" ? sumDoc.counts : {},
          };
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  return out;
}

/**
 * @param {string} outputDir
 * @param {object} opts
 * @param {string} [opts.run_id]
 * @param {string} [opts.plan_id]
 * @param {object} [opts.plan] — plano carregado (opcional)
 */
function buildPlanArtifactsManifest(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const plan = opts.plan && typeof opts.plan === "object" ? opts.plan : null;
  const runId = opts.run_id != null ? String(opts.run_id) : plan && plan.run_id != null ? String(plan.run_id) : "";
  const planId = opts.plan_id != null ? String(opts.plan_id) : plan && plan.plan_id != null ? String(plan.plan_id) : "";

  const validation = [];
  if (plan && plan.validation && typeof plan.validation === "object" && plan.validation.last_structural) {
    validation.push({
      kind: "structural",
      ref: "embedded:plan.validation.last_structural",
      at: plan.validation.last_structural.validated_at || null,
    });
  }

  const telemetry = [];
  if (plan && plan.telemetry && Array.isArray(plan.telemetry.events)) {
    telemetry.push({
      kind: "plan_embedded_events",
      count: plan.telemetry.events.length,
    });
  }

  const runtime = [];
  const metaPath = path.join(dir, "metadata.json");
  if (dir && fs.existsSync(metaPath)) {
    runtime.push({ kind: "metadata", path: "metadata.json" });
  }
  const rcPath = path.join(dir, "run-context.json");
  if (dir && fs.existsSync(rcPath)) {
    runtime.push({ kind: "run_context", path: "run-context.json" });
  }

  const fingerprints = [];
  if (plan && plan.fingerprints && typeof plan.fingerprints === "object") {
    const fp = plan.fingerprints.plan_content_sha256;
    if (fp) fingerprints.push({ kind: "plan_content_sha256", value: String(fp) });
  }

  const lineage = [];
  if (plan && plan.revision_lineage && typeof plan.revision_lineage === "object") {
    lineage.push({
      lineage_id: plan.revision_lineage.lineage_id || null,
      revision_ids: Array.isArray(plan.revision_lineage.revision_ids)
        ? plan.revision_lineage.revision_ids.slice()
        : [],
    });
  }

  const generated = [];
  const candidates = [
    "patch-preview.md",
    "patch-manifest.json",
    "executor-result.json",
    "review-output.json",
    "review-results.json",
    "review-runtime-manifest.json",
    "review-correction-hints.json",
    VALIDATION_RESULTS_FILENAME,
    VALIDATION_CACHE_FILENAME,
    VALIDATION_RUNTIME_SUMMARY_FILENAME,
    VALIDATION_PROPAGATION_MANIFEST_FILENAME,
    DEPENDENCY_GRAPH_FILENAME,
    RISK_ANALYSIS_FILENAME,
    RISK_RUNTIME_MANIFEST_FILENAME,
    "correction-analysis.json",
    "correction-runtime-manifest.json",
    "correction-lineage.json",
    "correction-memory/correction-memory.json",
    "correction-runtime-telemetry.ndjson",
    "transaction-runtime.json",
    "transaction-runtime-manifest.json",
    "transaction-runtime-telemetry.ndjson",
    "execution-snapshot.json",
  ];
  for (const c of candidates) {
    if (dir && fs.existsSync(path.join(dir, c))) {
      generated.push({ path: c });
    }
  }

  const replay = [];
  const ck = path.join(dir, "runtime-checkpoints.json");
  if (dir && fs.existsSync(ck)) {
    replay.push({ kind: "checkpoints", path: "runtime-checkpoints.json" });
  }
  if (dir && fs.existsSync(path.join(dir, "transaction-runtime.json"))) {
    replay.push({ kind: "transaction_runtime", path: "transaction-runtime.json" });
  }

  const trxRuntimeExt = {};
  if (dir && fs.existsSync(path.join(dir, "transaction-runtime.json"))) {
    trxRuntimeExt.contract = "transaction-runtime.json";
  }
  if (dir && fs.existsSync(path.join(dir, "transaction-runtime-manifest.json"))) {
    trxRuntimeExt.manifest_ref = "transaction-runtime-manifest.json";
  }
  if (dir && fs.existsSync(path.join(dir, "transaction-runtime-telemetry.ndjson"))) {
    trxRuntimeExt.telemetry = "transaction-runtime-telemetry.ndjson";
  }
  if (dir && fs.existsSync(path.join(dir, "execution-snapshot.json"))) {
    trxRuntimeExt.latest_execution_snapshot = "execution-snapshot.json";
  }

  const extensions = {};
  if (Object.keys(trxRuntimeExt).length) {
    extensions.transaction_runtime = trxRuntimeExt;
  }

  const veExt = buildValidationExecutionPlanExtension(dir);
  if (Object.keys(veExt).length) {
    extensions.validation_execution_plan = veExt;
  }

  const artifacts = {
    execution_plan: fs.existsSync(path.join(dir, EXECUTION_PLAN_FILENAME))
      ? EXECUTION_PLAN_FILENAME
      : null,
    reconciliation: fs.existsSync(path.join(dir, RECON_FILE)) ? RECON_FILE : null,
    validation_targets: fs.existsSync(path.join(dir, VALIDATION_TARGETS_FILENAME))
      ? VALIDATION_TARGETS_FILENAME
      : null,
    validation_manifest: fs.existsSync(path.join(dir, VALIDATION_MANIFEST_FILENAME))
      ? VALIDATION_MANIFEST_FILENAME
      : null,
    validation_propagation_manifest: fs.existsSync(
      path.join(dir, VALIDATION_PROPAGATION_MANIFEST_FILENAME),
    )
      ? VALIDATION_PROPAGATION_MANIFEST_FILENAME
      : null,
    dependency_graph: fs.existsSync(path.join(dir, DEPENDENCY_GRAPH_FILENAME))
      ? DEPENDENCY_GRAPH_FILENAME
      : null,
    validation_plan: fs.existsSync(path.join(dir, VALIDATION_PLAN_FILENAME))
      ? VALIDATION_PLAN_FILENAME
      : null,
    validation_results: fs.existsSync(path.join(dir, VALIDATION_RESULTS_FILENAME))
      ? VALIDATION_RESULTS_FILENAME
      : null,
    validation_cache: fs.existsSync(path.join(dir, VALIDATION_CACHE_FILENAME))
      ? VALIDATION_CACHE_FILENAME
      : null,
    validation_runtime_summary: fs.existsSync(path.join(dir, VALIDATION_RUNTIME_SUMMARY_FILENAME))
      ? VALIDATION_RUNTIME_SUMMARY_FILENAME
      : null,
    risk_analysis: fs.existsSync(path.join(dir, RISK_ANALYSIS_FILENAME))
      ? RISK_ANALYSIS_FILENAME
      : null,
    risk_runtime_manifest: fs.existsSync(path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME))
      ? RISK_RUNTIME_MANIFEST_FILENAME
      : null,
    validation,
    telemetry,
    runtime,
    fingerprints,
    lineage,
    generated,
    replay,
    extensions,
  };

  return {
    schema_version: 1,
    plan_id: planId,
    run_id: runId,
    artifacts,
    generated_at: new Date().toISOString(),
    extensions: {},
  };
}

/**
 * @param {string} outputDir
 * @param {object} manifest
 * @param {object|null} previous
 */
function mergePlanArtifactsManifest(manifest, previous) {
  if (!previous || typeof previous !== "object") return manifest;
  const merged = { ...manifest, artifacts: { ...manifest.artifacts } };
  const prevArt = previous.artifacts && typeof previous.artifacts === "object" ? previous.artifacts : {};
  const extPrev = prevArt.extensions && typeof prevArt.extensions === "object" ? prevArt.extensions : {};
  const extNextRaw =
    merged.artifacts.extensions && typeof merged.artifacts.extensions === "object"
      ? merged.artifacts.extensions
      : {};

  const txnMerged = {
    ...(typeof extPrev.transaction_runtime === "object" && extPrev.transaction_runtime
      ? extPrev.transaction_runtime
      : {}),
    ...(typeof extNextRaw.transaction_runtime === "object" && extNextRaw.transaction_runtime
      ? extNextRaw.transaction_runtime
      : {}),
  };

  const veMerged = {
    ...(typeof extPrev.validation_execution_plan === "object" && extPrev.validation_execution_plan
      ? extPrev.validation_execution_plan
      : {}),
    ...(typeof extNextRaw.validation_execution_plan === "object" && extNextRaw.validation_execution_plan
      ? extNextRaw.validation_execution_plan
      : {}),
  };

  const extNextSansTxnVe = { ...extNextRaw };
  delete extNextSansTxnVe.transaction_runtime;
  delete extNextSansTxnVe.validation_execution_plan;

  merged.artifacts.extensions = {
    ...extPrev,
    ...extNextSansTxnVe,
    ...(Object.keys(txnMerged).length ? { transaction_runtime: txnMerged } : {}),
    ...(Object.keys(veMerged).length ? { validation_execution_plan: veMerged } : {}),
  };
  merged.extensions = {
    ...(previous.extensions && typeof previous.extensions === "object" ? previous.extensions : {}),
    ...(manifest.extensions && typeof manifest.extensions === "object" ? manifest.extensions : {}),
  };
  return merged;
}

/**
 * @param {string} outputDir
 * @param {object} opts
 */
function savePlanArtifactsManifest(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  if (!dir) return;
  const next = buildPlanArtifactsManifest(dir, opts);
  const p = path.join(dir, MANIFEST_FILENAME);
  let prev = null;
  try {
    if (fs.existsSync(p)) {
      prev = JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch (_) {
    prev = null;
  }
  const merged = mergePlanArtifactsManifest(next, prev);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadPlanArtifactsManifest(outputDir) {
  const p = path.join(String(outputDir || ""), MANIFEST_FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  MANIFEST_FILENAME,
  buildPlanArtifactsManifest,
  savePlanArtifactsManifest,
  loadPlanArtifactsManifest,
};
