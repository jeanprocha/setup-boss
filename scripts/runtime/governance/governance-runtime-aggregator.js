/**
 * Agregador v1: normaliza decisões de vários runtimes para um contrato único.
 * Só leitura de artefactos; sem acoplamento forte (paths como strings estáveis).
 */

const fs = require("fs");
const path = require("path");
const { loadExecutionReconciliation } = require("../../execution-plan/reconciliation/reconciliation-engine");
const { VALIDATION_RUNTIME_MANIFEST_FILENAME } = require("../../validation-runtime/constants");
const { RISK_RUNTIME_MANIFEST_FILENAME } = require("../../risk-runtime/constants");
const { REVIEW_RUNTIME_MANIFEST_FILENAME } = require("../../review-runtime/constants");

const DECISIONS_FILE = "governance-decisions.json";

/**
 * @typedef {{
 *   phase: string,
 *   source_runtime: string,
 *   severity: string,
 *   code: string,
 *   message: string,
 *   replay_safe: boolean,
 *   evidence_refs: string[],
 * }} GovernanceNormalizedEvaluation
 */

/**
 * @param {Partial<GovernanceNormalizedEvaluation>} partial
 * @returns {GovernanceNormalizedEvaluation}
 */
function normalizeEvaluation(partial) {
  const sev = String(partial.severity || "INFO").toUpperCase();
  const allowed = new Set(["INFO", "WARN", "BLOCK"]);
  const severity = allowed.has(sev) ? sev : "INFO";
  return {
    phase: String(partial.phase || ""),
    source_runtime: String(partial.source_runtime || ""),
    severity,
    code: String(partial.code || ""),
    message: String(partial.message || ""),
    replay_safe: partial.replay_safe !== false,
    evidence_refs: Array.isArray(partial.evidence_refs)
      ? partial.evidence_refs.map((x) => String(x))
      : [],
  };
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return fallback;
  }
}

/**
 * @param {string} outputDir
 * @param {string} hookPhase
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectPreflightEvaluations(outputDir, hookPhase) {
  const dir = String(outputDir || "");
  if (!dir) return [];
  const doc = readJsonIfExists(path.join(dir, DECISIONS_FILE), null);
  if (!doc || !Array.isArray(doc.decisions)) return [];

  const out = [];
  for (const d of doc.decisions) {
    if (!d || typeof d !== "object") continue;
    const code = d.code != null ? String(d.code) : "UNKNOWN";
    const rawSev = d.severity != null ? String(d.severity) : "INFO";
    let severity = rawSev.toUpperCase();
    if (d.blocker === true) severity = "BLOCK";
    if (!["INFO", "WARN", "BLOCK"].includes(severity)) severity = "INFO";
    out.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "preflight",
        severity,
        code,
        message: d.message != null ? String(d.message) : "",
        replay_safe: true,
        evidence_refs: [DECISIONS_FILE, "policy-report.json"],
      }),
    );
  }

  if (Array.isArray(doc.blocker_codes) && doc.blocker_codes.length > 0) {
    out.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "preflight",
        severity: "INFO",
        code: "PREFLIGHT_BLOCKER_CODES_SUMMARY",
        message: `blocker_codes: ${doc.blocker_codes.join(", ")}`,
        replay_safe: true,
        evidence_refs: [DECISIONS_FILE],
      }),
    );
  }

  return out;
}

/**
 * @param {string} outputDir
 * @param {string} hookPhase
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectReconciliationEvaluations(outputDir, hookPhase) {
  const recon = loadExecutionReconciliation(outputDir);
  if (!recon || typeof recon !== "object") return [];

  const status = recon.status != null ? String(recon.status) : "";
  const unexpected =
    recon.coverage && recon.coverage.unexpected != null ? Number(recon.coverage.unexpected) : 0;
  const unmatched =
    recon.coverage && recon.coverage.unmatched != null ? Number(recon.coverage.unmatched) : 0;

  const evals = [];

  if (status === "divergent" || unexpected > 0) {
    evals.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "reconciliation",
        severity: "WARN",
        code: "RECONCILIATION_DIVERGENT",
        message: `execution-reconciliation status=${status} unexpected=${unexpected} unmatched=${unmatched}`,
        replay_safe: true,
        evidence_refs: ["execution-reconciliation.json"],
      }),
    );
  } else if (unmatched > 0) {
    evals.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "reconciliation",
        severity: "WARN",
        code: "RECONCILIATION_PARTIAL",
        message: `unmatched planned operations: ${unmatched}`,
        replay_safe: true,
        evidence_refs: ["execution-reconciliation.json"],
      }),
    );
  } else {
    evals.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "reconciliation",
        severity: "INFO",
        code: "RECONCILIATION_OK",
        message: `status=${status || "unknown"}`,
        replay_safe: true,
        evidence_refs: ["execution-reconciliation.json"],
      }),
    );
  }

  return evals;
}

/**
 * @param {string} outputDir
 * @param {string} hookPhase
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectValidationEvaluations(outputDir, hookPhase) {
  const dir = String(outputDir || "");
  if (!dir) return [];
  const manifest = readJsonIfExists(
    path.join(dir, VALIDATION_RUNTIME_MANIFEST_FILENAME),
    null,
  );
  if (!manifest || typeof manifest !== "object") {
    return [
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "validation",
        severity: "INFO",
        code: "VALIDATION_MANIFEST_ABSENT",
        message: "validation-runtime-manifest.json não presente ou ilegível",
        replay_safe: true,
        evidence_refs: [],
      }),
    ];
  }

  const mode = manifest.validation_mode != null ? String(manifest.validation_mode) : "";
  const summary = manifest.execution && manifest.execution.summary ? manifest.execution.summary : null;
  const failed =
    summary && summary.failed_validators != null ? Number(summary.failed_validators) : 0;
  const total =
    summary && summary.total_validators != null ? Number(summary.total_validators) : 0;

  const evals = [
    normalizeEvaluation({
      phase: hookPhase,
      source_runtime: "validation",
      severity: mode === "off" ? "INFO" : "INFO",
      code: "VALIDATION_RUNTIME_SUMMARY",
      message: `mode=${mode || "unknown"} failed_validators=${failed} total_validators=${total}`,
      replay_safe: true,
      evidence_refs: [VALIDATION_RUNTIME_MANIFEST_FILENAME, "validation-results.json"],
    }),
  ];

  if (failed > 0) {
    evals.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "validation",
        severity: "WARN",
        code: "VALIDATION_FAILURES",
        message: `${failed} validator(s) falharam (ver validation-results.json)`,
        replay_safe: true,
        evidence_refs: [VALIDATION_RUNTIME_MANIFEST_FILENAME, "validation-results.json"],
      }),
    );
  }

  return evals;
}

/**
 * @param {string} outputDir
 * @param {string} hookPhase
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectRiskEvaluations(outputDir, hookPhase) {
  const dir = String(outputDir || "");
  if (!dir) return [];
  const manifest = readJsonIfExists(path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME), null);
  if (!manifest || typeof manifest !== "object") {
    return [
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "risk",
        severity: "INFO",
        code: "RISK_MANIFEST_ABSENT",
        message: "risk-runtime-manifest.json não presente ou ilegível",
        replay_safe: true,
        evidence_refs: [],
      }),
    ];
  }

  const tier =
    manifest.scores && manifest.scores.risk_tier != null
      ? String(manifest.scores.risk_tier).toLowerCase()
      : "low";
  const score =
    manifest.scores && manifest.scores.risk_score != null
      ? Number(manifest.scores.risk_score)
      : 0;

  let severity = "INFO";
  if (tier === "high" || tier === "critical" || score >= 70) severity = "WARN";

  const evals = [
    normalizeEvaluation({
      phase: hookPhase,
      source_runtime: "risk",
      severity,
      code: "RISK_RUNTIME_SUMMARY",
      message: `risk_tier=${tier} risk_score=${score}`,
      replay_safe: true,
      evidence_refs: [RISK_RUNTIME_MANIFEST_FILENAME, "risk-analysis.json"],
    }),
  ];

  return evals;
}

/**
 * @param {string} outputDir
 * @param {string} hookPhase
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectReviewEvaluations(outputDir, hookPhase) {
  const dir = String(outputDir || "");
  if (!dir) return [];
  const manifest = readJsonIfExists(path.join(dir, REVIEW_RUNTIME_MANIFEST_FILENAME), null);
  if (!manifest || typeof manifest !== "object") return [];

  const failN =
    manifest.invariant_counts && manifest.invariant_counts.fail != null
      ? Number(manifest.invariant_counts.fail)
      : 0;
  const warnN =
    manifest.invariant_counts && manifest.invariant_counts.warn != null
      ? Number(manifest.invariant_counts.warn)
      : 0;

  const evals = [
    normalizeEvaluation({
      phase: hookPhase,
      source_runtime: "review",
      severity: failN > 0 ? "WARN" : "INFO",
      code: "REVIEW_RUNTIME_SUMMARY",
      message: `invariant fail=${failN} warn=${warnN}`,
      replay_safe: true,
      evidence_refs: [REVIEW_RUNTIME_MANIFEST_FILENAME, "review-results.json"],
    }),
  ];

  if (failN > 0) {
    evals.push(
      normalizeEvaluation({
        phase: hookPhase,
        source_runtime: "review",
        severity: "WARN",
        code: "REVIEW_INVARIANT_FAIL",
        message: `${failN} invariante(s) com outcome fail`,
        replay_safe: true,
        evidence_refs: [REVIEW_RUNTIME_MANIFEST_FILENAME],
      }),
    );
  }

  return evals;
}

/**
 * @param {string} hookPhase
 * @param {string} outputDir
 * @param {{ preflightAlreadyIngested?: boolean }} [opts]
 * @returns {GovernanceNormalizedEvaluation[]}
 */
function collectEvaluationsForHook(hookPhase, outputDir, opts = {}) {
  const preflightIngested = opts.preflightAlreadyIngested === true;
  const out = [];

  if (hookPhase === "post_reconciliation") {
    if (!preflightIngested) {
      out.push(...collectPreflightEvaluations(outputDir, hookPhase));
    }
    out.push(...collectReconciliationEvaluations(outputDir, hookPhase));
    return out;
  }

  if (hookPhase === "post_validation") {
    out.push(...collectValidationEvaluations(outputDir, hookPhase));
    return out;
  }

  if (hookPhase === "post_risk") {
    out.push(...collectRiskEvaluations(outputDir, hookPhase));
    out.push(...collectReviewEvaluations(outputDir, hookPhase));
    return out;
  }

  return out;
}

module.exports = {
  normalizeEvaluation,
  collectEvaluationsForHook,
  collectPreflightEvaluations,
  collectReconciliationEvaluations,
  collectValidationEvaluations,
  collectRiskEvaluations,
  collectReviewEvaluations,
};
