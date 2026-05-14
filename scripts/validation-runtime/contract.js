/**
 * Contrato replay-safe de resultados (Fase 4.2).
 */

const { VALIDATION_RESULTS_SCHEMA_VERSION } = require("./constants");

/**
 * @param {object} parts
 */
function createEmptyValidationResults(parts) {
  const {
    validation_run_id,
    plan_id,
    generated_at,
    validation_mode,
    policy_profile,
  } = parts;

  return {
    schema_version: VALIDATION_RESULTS_SCHEMA_VERSION,
    validation_run_id: String(validation_run_id || ""),
    plan_id: plan_id != null ? String(plan_id) : "",
    generated_at: generated_at || new Date().toISOString(),
    validation_mode: validation_mode != null ? String(validation_mode) : "off",
    policy_profile: policy_profile != null ? String(policy_profile) : "balanced",
    summary: {
      status: "passed",
      total_validators: 0,
      executed_validators: 0,
      failed_validators: 0,
      skipped_validators: 0,
      warnings: 0,
    },
    stages: [],
    validators: [],
    artifacts: [],
    telemetry: [],
    metadata: {},
    extensions: {},
  };
}

/**
 * @param {object} row
 */
function normalizeValidatorResultRow(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    validator_id: r.validator_id != null ? String(r.validator_id) : "",
    validator_type: r.validator_type != null ? String(r.validator_type) : "",
    stage: r.stage != null ? String(r.stage) : "",
    target_ids: Array.isArray(r.target_ids) ? r.target_ids.map((x) => String(x)) : [],
    paths: Array.isArray(r.paths) ? r.paths.map((x) => String(x)) : [],
    scope: r.scope === "module" || r.scope === "project" ? r.scope : "file",
    status: ["passed", "failed", "skipped", "error"].includes(r.status) ? r.status : "error",
    duration_ms: Number.isFinite(Number(r.duration_ms)) ? Number(r.duration_ms) : 0,
    started_at: r.started_at != null ? String(r.started_at) : "",
    finished_at: r.finished_at != null ? String(r.finished_at) : "",
    cache_hit: Boolean(r.cache_hit),
    replay_fingerprint_sha256:
      r.replay_fingerprint_sha256 != null ? String(r.replay_fingerprint_sha256) : null,
    output:
      r.output && typeof r.output === "object" && !Array.isArray(r.output) ? r.output : {},
    warnings: Array.isArray(r.warnings) ? r.warnings.map((x) => String(x)) : [],
    errors: Array.isArray(r.errors) ? r.errors.map((x) => String(x)) : [],
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? r.metadata
        : {},
    extensions:
      r.extensions && typeof r.extensions === "object" && !Array.isArray(r.extensions)
        ? r.extensions
        : {},
  };
}

/**
 * @param {object[]} validators
 * @returns {'passed'|'failed'|'partial'}
 */
function deriveSummaryStatus(validators) {
  const rows = Array.isArray(validators) ? validators : [];
  const executed = rows.filter((v) => v && v.status !== "skipped");
  if (!executed.length) return "passed";
  const failed = executed.filter((v) => v.status === "failed" || v.status === "error");
  if (failed.length === 0) return "passed";
  if (failed.length === executed.length) return "failed";
  return "partial";
}

/**
 * @param {object} results
 * @param {object[]} validators
 */
function finalizeValidationSummary(results, validators) {
  const v = Array.isArray(validators) ? validators.map(normalizeValidatorResultRow) : [];
  let warnings = 0;
  for (const row of v) {
    warnings += Array.isArray(row.warnings) ? row.warnings.length : 0;
  }
  const executed = v.filter((x) => x.status !== "skipped");
  const failed = v.filter((x) => x.status === "failed" || x.status === "error");
  const skipped = v.filter((x) => x.status === "skipped");
  results.validators = v;
  results.summary = {
    status: deriveSummaryStatus(v),
    total_validators: v.length,
    executed_validators: executed.length,
    failed_validators: failed.length,
    skipped_validators: skipped.length,
    warnings,
  };
  return results;
}

module.exports = {
  createEmptyValidationResults,
  normalizeValidatorResultRow,
  finalizeValidationSummary,
  deriveSummaryStatus,
};
