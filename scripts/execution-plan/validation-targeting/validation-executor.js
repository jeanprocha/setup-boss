/**
 * Fase 4.10.3 — Validation Executor (local, síncrono, serial).
 * Executa apenas comandos com status === "resolved"; não usa shell; não aborta o runtime em falhas de validator.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");
const { loadValidationPlan } = require("./validation-plan-builder");
const { resolveProjectRootFromOutputDir } = require("./validator-resolver");
const { VALIDATION_RESULTS_FILENAME, VALIDATION_PLAN_FILENAME } = require("./constants");
const {
  isValidationCacheEnabled,
  loadValidationCache,
  lookupCacheForValidationCommand,
  persistValidationCacheEntry,
  buildPassedCacheEntry,
} = require("./validation-cache");
const { saveValidationRuntimeSummary } = require("./validation-runtime-summary");

const VALIDATION_RESULTS_SCHEMA_CONTRACT = "validation-results/1";

/** Alinhado a scripts/validation-runtime/validators/base-validator.js */
const MAX_STREAM_CHARS = 524288;

function validationResultsPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_RESULTS_FILENAME);
}

function truncateStreamText(text) {
  const s = text != null ? String(text) : "";
  if (s.length <= MAX_STREAM_CHARS) return s;
  const orig = s.length;
  return `${s.slice(0, MAX_STREAM_CHARS)}\n[truncated: original_chars=${orig} max_chars=${MAX_STREAM_CHARS}]\n`;
}

/**
 * argv já tokenizado pelo resolver — executa file + args sem shell (sem interpolação).
 * @param {string[]} argv
 * @param {string} cwd
 */
function runArgvSync(argv, cwd) {
  const startedAt = new Date();
  const t0 = Date.now();
  const file = String(argv[0] || "");
  const args = argv.slice(1).map((a) => String(a));

  try {
    const r = spawnSync(file, args, {
      cwd,
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      maxBuffer: MAX_STREAM_CHARS * 2 + 65536,
    });

    const completedAt = new Date();
    const duration_ms = Date.now() - t0;

    if (r.error) {
      return {
        exit_code: null,
        duration_ms,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        stdout: truncateStreamText(r.stdout),
        stderr: truncateStreamText(
          `${r.stderr || ""}\n${String((r.error && r.error.message) || r.error || "")}`.trim(),
        ),
        spawn_error: String((r.error && r.error.message) || r.error || ""),
      };
    }

    let status = "failed";
    if (r.signal != null) {
      status = "error";
    } else if (r.status === 0) {
      status = "passed";
    } else if (r.status === null) {
      status = "error";
    }

    return {
      exit_code: r.status,
      duration_ms,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      stdout: truncateStreamText(r.stdout),
      stderr: truncateStreamText(r.stderr),
      spawn_error: null,
      status_override: status,
    };
  } catch (err) {
    const completedAt = new Date();
    return {
      exit_code: null,
      duration_ms: Date.now() - t0,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      stdout: "",
      stderr: truncateStreamText(String((err && err.message) || err || "")),
      spawn_error: String((err && err.message) || err || ""),
    };
  }
}

function normalizePlanFingerprint(planDoc) {
  if (!planDoc || typeof planDoc !== "object") {
    return sha256HexUtf8(stableStringify({ validation_plan_identity: "absent" }));
  }
  const fp =
    planDoc.fingerprints && planDoc.fingerprints.validation_plan_identity_sha256 != null
      ? String(planDoc.fingerprints.validation_plan_identity_sha256)
      : "";
  return fp || sha256HexUtf8(stableStringify({ validation_plan_identity: "absent_no_field" }));
}

function collectUnresolvedCount(commands) {
  let n = 0;
  for (const c of commands) {
    const st = c && c.status != null ? String(c.status) : "";
    if (st === "unresolved" || st === "unsupported") n += 1;
  }
  return n;
}

/**
 * Ordenação determinística antes da execução (replay-safe).
 * @param {object[]} commands
 */
function sortedResolvedCommands(commands) {
  return [...commands]
    .filter((c) => c && typeof c === "object" && String(c.status || "") === "resolved")
    .sort((a, b) => String(a.command_id || "").localeCompare(String(b.command_id || "")));
}

function computeResultsIdentityFingerprint(resultsForFingerprint) {
  const rows = [...resultsForFingerprint].sort((a, b) =>
    String(a.command_id || "").localeCompare(String(b.command_id || "")),
  );
  const canonical = rows.map((r) => ({
    command_id: String(r.command_id || ""),
    validator_id: r.validator_id != null ? String(r.validator_id) : "",
    target_id: String(r.target_id || ""),
    status: String(r.status || ""),
    exit_code: r.exit_code === undefined || r.exit_code === null ? null : Number(r.exit_code),
  }));
  return sha256HexUtf8(
    stableStringify({
      schema_contract: VALIDATION_RESULTS_SCHEMA_CONTRACT,
      version: 1,
      rows: canonical,
    }),
  );
}

/**
 * @param {{
 *   outputDir: string,
 *   planDoc?: object|null,
 * }} input
 * @returns {{ doc: object, results: object[] }}
 */
function runValidationExecutorSync(input) {
  const outputDir = String((input && input.outputDir) || "");
  let planDoc = input && input.planDoc != null ? input.planDoc : null;
  if (!planDoc && outputDir) {
    planDoc = loadValidationPlan(outputDir);
  }

  if (!planDoc || typeof planDoc !== "object") {
    const empty = buildValidationResultsDocument({
      planDoc: null,
      results: [],
      commandsAll: [],
    });
    return { doc: empty, results: [] };
  }

  const commandsAll = Array.isArray(planDoc.commands) ? planDoc.commands : [];
  const toRun = sortedResolvedCommands(commandsAll);
  const projectRoot = resolveProjectRootFromOutputDir(outputDir);
  const cwd = projectRoot && fs.existsSync(projectRoot) ? projectRoot : outputDir;

  const cacheEnabled = isValidationCacheEnabled();
  const planIdentitySha256 = normalizePlanFingerprint(planDoc);
  let cacheDoc = cacheEnabled ? loadValidationCache(outputDir) : null;

  /** @type {object[]} */
  const results = [];

  for (const cmd of toRun) {
    const command_id = String(cmd.command_id || "");
    const target_id = String(cmd.target_id || "");
    const validator_id =
      cmd.validator_id != null && String(cmd.validator_id).trim() !== ""
        ? String(cmd.validator_id)
        : "";

    const argv = Array.isArray(cmd.argv) ? cmd.argv : null;
    const argvOk =
      argv &&
      argv.length > 0 &&
      argv.every((x) => x != null && typeof x === "string" && String(x).length > 0);

    if (!argvOk) {
      results.push({
        command_id,
        validator_id,
        target_id,
        status: "skipped",
        exit_code: null,
        duration_ms: 0,
        started_at: null,
        completed_at: null,
        stdout: "",
        stderr: "skipped: argv ausente ou inválido para comando resolved",
        cache_status: cacheEnabled ? "miss" : "disabled",
        reused_from_cache: false,
      });
      continue;
    }

    const hit =
      cacheEnabled && cacheDoc
        ? lookupCacheForValidationCommand(outputDir, {
            entries: cacheDoc.entries,
            validation_plan_identity_sha256: planIdentitySha256,
            command_id,
            validator_id,
            target_id,
          })
        : null;

    if (hit) {
      results.push({
        command_id,
        validator_id,
        target_id,
        status: "passed",
        exit_code: hit.exit_code === undefined || hit.exit_code === null ? null : Number(hit.exit_code),
        duration_ms: Number(hit.duration_ms) || 0,
        started_at: null,
        completed_at: null,
        stdout: hit.stdout != null ? String(hit.stdout) : "",
        stderr: hit.stderr != null ? String(hit.stderr) : "",
        cache_status: "hit",
        reused_from_cache: true,
      });
      continue;
    }

    const execResult = runArgvSync(argv, cwd);

    let status = "error";
    if (execResult.spawn_error) {
      status = "error";
    } else if (execResult.status_override) {
      status = execResult.status_override;
    } else if (execResult.exit_code === 0) {
      status = "passed";
    } else if (execResult.exit_code !== null && execResult.exit_code !== 0) {
      status = "failed";
    }

    let cache_status = cacheEnabled ? "miss" : "disabled";
    const reused_from_cache = false;

    if (status === "passed" && cacheEnabled) {
      const entry = buildPassedCacheEntry({
        validation_plan_identity_sha256: planIdentitySha256,
        command_id,
        validator_id,
        target_id,
        exit_code: execResult.exit_code,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        duration_ms: execResult.duration_ms,
      });
      cacheDoc = persistValidationCacheEntry(outputDir, entry);
      cache_status = "write";
    }

    results.push({
      command_id,
      validator_id,
      target_id,
      status,
      exit_code: execResult.exit_code,
      duration_ms: execResult.duration_ms,
      started_at: execResult.started_at,
      completed_at: execResult.completed_at,
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      cache_status,
      reused_from_cache,
    });
  }

  const doc = buildValidationResultsDocument({
    planDoc,
    results,
    commandsAll,
  });

  return { doc, results };
}

/**
 * @param {{
 *   planDoc: object|null,
 *   results: object[],
 *   commandsAll: object[],
 * }} args
 */
function buildValidationResultsDocument(args) {
  const planDoc = args.planDoc;
  const results = args.results || [];
  const commandsAll = args.commandsAll || [];

  const plan_id =
    planDoc && planDoc.metadata && planDoc.metadata.plan_id != null
      ? String(planDoc.metadata.plan_id)
      : "";
  const run_id =
    planDoc && planDoc.metadata && planDoc.metadata.run_id != null
      ? String(planDoc.metadata.run_id)
      : "";

  const total = commandsAll.length;
  const unresolved = collectUnresolvedCount(commandsAll);

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let total_duration_ms = 0;

  let cache_hits = 0;
  let cache_misses = 0;
  let cache_reused = 0;

  for (const r of results) {
    total_duration_ms += Number(r.duration_ms) || 0;
    const st = String(r.status || "");
    if (st === "passed") passed += 1;
    else if (st === "failed") failed += 1;
    else if (st === "error") failed += 1;
    else if (st === "skipped") skipped += 1;

    const cs = r.cache_status != null ? String(r.cache_status) : "";
    if (cs === "hit") {
      cache_hits += 1;
      cache_reused += 1;
    } else if ((cs === "miss" || cs === "write") && st !== "skipped") {
      cache_misses += 1;
    }
  }

  const validation_plan_identity_sha256 = normalizePlanFingerprint(planDoc);
  const validation_results_identity_sha256 = computeResultsIdentityFingerprint(
    results.map((r) => ({
      command_id: r.command_id,
      validator_id: r.validator_id,
      target_id: r.target_id,
      status: r.status,
      exit_code: r.exit_code,
    })),
  );

  return {
    version: 1,
    schema_contract: VALIDATION_RESULTS_SCHEMA_CONTRACT,
    results,
    summary: {
      total,
      passed,
      failed,
      skipped,
      unresolved,
      total_duration_ms,
      cache_hits,
      cache_misses,
      cache_reused,
    },
    fingerprints: {
      validation_results_identity_sha256,
      validation_plan_identity_sha256,
    },
    metadata: {
      plan_id,
      run_id,
      executor_schema_contract: VALIDATION_RESULTS_SCHEMA_CONTRACT,
      validation_plan_ref: VALIDATION_PLAN_FILENAME,
    },
  };
}

function saveValidationResults(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir || !doc || typeof doc !== "object") return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationResultsPath(dir), JSON.stringify(doc, null, 2), "utf8");
  saveValidationRuntimeSummary(dir, doc);
}

module.exports = {
  VALIDATION_RESULTS_SCHEMA_CONTRACT,
  MAX_STREAM_CHARS,
  validationResultsPath,
  runValidationExecutorSync,
  saveValidationResults,
  buildValidationResultsDocument,
};
