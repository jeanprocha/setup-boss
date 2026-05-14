/**
 * Observabilidade da execução validation-plan (Fase 4.10.5) — leituras limitadas (sem stdout/stderr).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
  VALIDATION_PLAN_FILENAME,
  VALIDATION_CACHE_FILENAME,
} = require("./constants");

function readJsonBounded(filePath, maxBytes) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const st = fs.statSync(filePath);
    if (st.size > maxBytes) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 */
function collectValidationExecutionInspect(outputDir) {
  const dir = String(outputDir || "");
  const summaryPath = path.join(dir, VALIDATION_RUNTIME_SUMMARY_FILENAME);
  const summary = readJsonBounded(summaryPath, 262144);

  const planPath = path.join(dir, VALIDATION_PLAN_FILENAME);
  const plan = readJsonBounded(planPath, 2_000_000);

  let commands_total = null;
  let unresolved_commands = null;
  if (plan && Array.isArray(plan.commands)) {
    commands_total = plan.commands.length;
    unresolved_commands = plan.commands.filter(
      (c) =>
        c &&
        typeof c === "object" &&
        (String(c.status || "") === "unresolved" || String(c.status || "") === "unsupported"),
    ).length;
  }

  const fpFull =
    summary &&
    summary.fingerprints &&
    summary.fingerprints.validation_results_identity_sha256 != null
      ? String(summary.fingerprints.validation_results_identity_sha256)
      : "";
  const fingerprint_short = fpFull && fpFull.length >= 12 ? fpFull.slice(0, 12) : fpFull || null;

  const schemaOk =
    summary &&
    String(summary.schema_contract || "") === "validation-runtime-summary/1" &&
    summary.summary &&
    typeof summary.summary === "object";

  /** @type {object|null} */
  let graph_aware_summary = null;
  if (plan && plan.graph_impact && typeof plan.graph_impact === "object") {
    const gi = plan.graph_impact;
    const sm = gi.summary && typeof gi.summary === "object" ? gi.summary : {};
    const gap =
      plan.fingerprints && plan.fingerprints.graph_aware_payload_sha256 != null
        ? String(plan.fingerprints.graph_aware_payload_sha256)
        : "";
    graph_aware_summary = {
      graph_present: Boolean(gi.graph_present),
      graph_candidates_total: sm.graph_candidates_total != null ? Number(sm.graph_candidates_total) : null,
      reverse_imports_total: sm.reverse_imports_total != null ? Number(sm.reverse_imports_total) : null,
      linked_tests_total: sm.linked_tests_total != null ? Number(sm.linked_tests_total) : null,
      graph_fingerprint_sha256: gi.graph_fingerprint_sha256 != null ? String(gi.graph_fingerprint_sha256) : null,
      graph_aware_payload_sha256_short: gap.length >= 12 ? gap.slice(0, 12) : gap || null,
      plan_risk_hints_total:
        Array.isArray(plan.risk_hints) && plan.risk_hints.length ? plan.risk_hints.length : null,
    };
  }

  return {
    phase410_summary_present: Boolean(schemaOk),
    validation_plan_present: Boolean(plan),
    validation_cache_present: Boolean(dir && fs.existsSync(path.join(dir, VALIDATION_CACHE_FILENAME))),
    commands_total,
    unresolved_commands,
    summary: summary && summary.summary && typeof summary.summary === "object" ? summary.summary : null,
    counts: summary && summary.counts && typeof summary.counts === "object" ? summary.counts : null,
    fingerprint_short,
    fingerprint_full: fpFull || null,
    graph_aware_summary,
  };
}

module.exports = {
  collectValidationExecutionInspect,
};
