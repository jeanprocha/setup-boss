/**
 * Manifest writer — governance-runtime.json (v1 report-only).
 * Persistência incremental; digest determinístico sobre avaliações ordenadas.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  GOVERNANCE_RUNTIME_SCHEMA_VERSION,
  GOVERNANCE_RUNTIME_MANIFEST_FILENAME,
  GOVERNANCE_RUNTIME_MODE_REPORT,
  GOVERNANCE_RUNTIME_MODE_ENFORCE,
  GOVERNANCE_RUNTIME_LIFECYCLE,
  GOVERNANCE_HITL_EVALUATION_CODES,
} = require("./governance-runtime-constants");
const {
  buildGovernanceContinuityPack,
  persistRuntimeContinuityFields,
} = require("./governance-continuity-fingerprint");

function manifestPath(outputDir) {
  return path.join(String(outputDir || ""), GOVERNANCE_RUNTIME_MANIFEST_FILENAME);
}

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function defaultExtensionsV1() {
  return {
    preflight_ingested: false,
    hooks_completed: [],
  };
}

/**
 * @param {string} runId
 * @param {string} [mode]
 * @returns {object}
 */
function createGovernanceRuntimeManifest(runId, mode) {
  const t = nowIso();
  const m =
    mode === GOVERNANCE_RUNTIME_MODE_ENFORCE
      ? GOVERNANCE_RUNTIME_MODE_ENFORCE
      : GOVERNANCE_RUNTIME_MODE_REPORT;
  return {
    schema_version: GOVERNANCE_RUNTIME_SCHEMA_VERSION,
    run_id: String(runId || ""),
    lifecycle_state: GOVERNANCE_RUNTIME_LIFECYCLE.PENDING,
    mode: m,
    evaluations: [],
    blockers: [],
    warnings: [],
    telemetry_digest: "",
    governance_continuity_fingerprint: "",
    continuity_inputs: [],
    semantic_continuity_fingerprint: "",
    semantic_continuity_inputs: [],
    created_at: t,
    updated_at: t,
    extensions: { v1: defaultExtensionsV1() },
  };
}

function ensureExtensionsV1(manifest) {
  if (!manifest.extensions || typeof manifest.extensions !== "object") {
    manifest.extensions = {};
  }
  if (!manifest.extensions.v1 || typeof manifest.extensions.v1 !== "object") {
    manifest.extensions.v1 = defaultExtensionsV1();
  }
  const v1 = manifest.extensions.v1;
  if (!Array.isArray(v1.hooks_completed)) v1.hooks_completed = [];
  if (typeof v1.preflight_ingested !== "boolean") v1.preflight_ingested = false;
  return v1;
}

function evaluationSortKey(e) {
  return [
    e.phase || "",
    e.source_runtime || "",
    e.code || "",
    e.severity || "",
    e.message || "",
  ].join("\u0001");
}

/**
 * @param {object} manifest
 * @returns {string}
 */
function computeTelemetryDigest(manifest) {
  const list = Array.isArray(manifest.evaluations) ? manifest.evaluations : [];
  const sorted = [...list].sort((a, b) =>
    evaluationSortKey(a).localeCompare(evaluationSortKey(b)),
  );
  const payload = {
    evaluations: sorted,
    blockers: Array.isArray(manifest.blockers) ? manifest.blockers : [],
    warnings: Array.isArray(manifest.warnings) ? manifest.warnings : [],
    lifecycle_state: manifest.lifecycle_state,
    mode: manifest.mode,
  };
  const h = crypto.createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
  return `sha256:${h}`;
}

function summarizeListsFromEvaluations(evals) {
  /** @type {{ code: string, phase: string, source_runtime: string, message: string }[]} */
  const blockers = [];
  /** @type {{ code: string, phase: string, source_runtime: string, message: string }[]} */
  const warnings = [];

  for (const e of evals) {
    if (!e || typeof e !== "object") continue;
    const row = {
      code: String(e.code || ""),
      phase: String(e.phase || ""),
      source_runtime: String(e.source_runtime || ""),
      message: String(e.message || "").slice(0, 2000),
    };
    const sev = String(e.severity || "").toUpperCase();
    if (sev === "BLOCK") blockers.push(row);
    else if (sev === "WARN") warnings.push(row);
  }
  return { blockers, warnings };
}

function resolveLifecycleState(manifest, outputDir) {
  const dir = String(outputDir || "");
  if (dir) {
    try {
      const { loadGovernanceApprovalManifest } = require("./governance-approval-manifest");
      const ap = loadGovernanceApprovalManifest(dir);
      const ast = ap && String(ap.status || "").toUpperCase();
      if (ast === "STALE" || ast === "INVALIDATED") {
        return GOVERNANCE_RUNTIME_LIFECYCLE.BLOCKED;
      }
    } catch (_) {
      /* ignore */
    }
  }

  const v1 = manifest.extensions && manifest.extensions.v1;
  const hooks = v1 && Array.isArray(v1.hooks_completed) ? v1.hooks_completed : [];
  const required = new Set(["post_reconciliation", "post_validation", "post_risk"]);
  const done = new Set(hooks);

  if (v1 && v1.awaiting_approval === true) {
    return GOVERNANCE_RUNTIME_LIFECYCLE.AWAITING_APPROVAL;
  }
  if (v1 && String(v1.hitl_approval_status || "").toLowerCase() === "rejected") {
    return GOVERNANCE_RUNTIME_LIFECYCLE.BLOCKED;
  }

  const hitlCleared =
    v1 &&
    ["approved", "overridden"].includes(String(v1.hitl_approval_status || "").toLowerCase());

  const hitlCodes = new Set(GOVERNANCE_HITL_EVALUATION_CODES);

  const evals = Array.isArray(manifest.evaluations) ? manifest.evaluations : [];
  let hasBlock = false;
  let hasWarn = false;
  for (const e of evals) {
    if (!e || typeof e !== "object") continue;
    const code = e.code != null ? String(e.code) : "";
    const s = String(e.severity || "").toUpperCase();
    if (hitlCleared && hitlCodes.has(code)) continue;
    if (s === "BLOCK") hasBlock = true;
    if (s === "WARN") hasWarn = true;
  }

  if (hasBlock) return GOVERNANCE_RUNTIME_LIFECYCLE.BLOCKED;
  if (hasWarn) return GOVERNANCE_RUNTIME_LIFECYCLE.WARNING;
  if (required.size === done.size && [...required].every((h) => done.has(h))) {
    return GOVERNANCE_RUNTIME_LIFECYCLE.PASSED;
  }
  return GOVERNANCE_RUNTIME_LIFECYCLE.PENDING;
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadGovernanceRuntimeManifest(outputDir) {
  const p = manifestPath(outputDir);
  const doc = readJsonSafe(p);
  if (!doc || typeof doc !== "object") return null;
  return doc;
}

/**
 * @param {string} outputDir
 * @param {object} manifest
 */
function saveGovernanceRuntimeManifest(outputDir, manifest) {
  const dir = String(outputDir || "");
  if (!dir || !manifest) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  manifest.updated_at = nowIso();
  const { blockers, warnings } = summarizeListsFromEvaluations(
    Array.isArray(manifest.evaluations) ? manifest.evaluations : [],
  );
  manifest.blockers = blockers;
  manifest.warnings = warnings;

  const evals = Array.isArray(manifest.evaluations) ? manifest.evaluations : [];
  const pack = buildGovernanceContinuityPack(dir, evals, manifest.blockers);
  persistRuntimeContinuityFields(manifest, pack);

  manifest.telemetry_digest = computeTelemetryDigest(manifest);
  manifest.lifecycle_state = resolveLifecycleState(manifest, dir);
  fs.writeFileSync(manifestPath(dir), JSON.stringify(manifest, null, 2), "utf8");
}

/**
 * @param {object} manifest
 * @param {import("./governance-runtime-aggregator").GovernanceNormalizedEvaluation[]} evaluations
 */
function appendEvaluations(manifest, evaluations) {
  if (!manifest.evaluations) manifest.evaluations = [];
  const incoming = Array.isArray(evaluations) ? evaluations : [];
  manifest.evaluations.push(...incoming);
}

/**
 * @param {object} manifest
 * @param {string} hookPhase
 */
function recordHookCompleted(manifest, hookPhase) {
  const v1 = ensureExtensionsV1(manifest);
  const h = String(hookPhase || "");
  if (!h) return;
  if (!v1.hooks_completed.includes(h)) v1.hooks_completed.push(h);
}

function setPreflightIngested(manifest, flag) {
  const v1 = ensureExtensionsV1(manifest);
  v1.preflight_ingested = flag === true;
}

function getPreflightIngested(manifest) {
  const v1 = ensureExtensionsV1(manifest);
  return v1.preflight_ingested === true;
}

function setAwaitingHumanApproval(manifest, approvalId) {
  const v1 = ensureExtensionsV1(manifest);
  v1.awaiting_approval = true;
  v1.awaiting_approval_id = approvalId != null ? String(approvalId) : "";
}

/**
 * @param {object} manifest
 * @param {"approved"|"rejected"|"overridden"|""} hitlStatus
 */
function applyHitlResolutionToManifest(manifest, hitlStatus) {
  const v1 = ensureExtensionsV1(manifest);
  v1.awaiting_approval = false;
  v1.awaiting_approval_id = "";
  v1.hitl_approval_status = hitlStatus != null ? String(hitlStatus) : "";
}

module.exports = {
  manifestPath,
  createGovernanceRuntimeManifest,
  loadGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
  appendEvaluations,
  recordHookCompleted,
  setPreflightIngested,
  getPreflightIngested,
  computeTelemetryDigest,
  setAwaitingHumanApproval,
  applyHitlResolutionToManifest,
};
