"use strict";

const {
  RELEASE_READINESS_SCHEMA_VERSION,
  RELEASE_READINESS_PHASE_TAG,
} = require("./constants");
const { validateExecutionGraphReleaseReadiness } = require("./readiness-validator");

/**
 * @param {{
 *   outputDir: string,
 *   runId: string,
 *   env?: NodeJS.ProcessEnv,
 *   source?: string,
 * }} opts
 */
function buildExecutionGraphReleaseReadinessDocument(opts) {
  const runId = String(opts.runId || "");
  const outputDir = String(opts.outputDir || "");
  const env = opts.env || process.env;
  const source = opts.source != null ? String(opts.source) : "run-runtime";

  const v = validateExecutionGraphReleaseReadiness({ outputDir, runId, env });
  const created_at = new Date().toISOString();

  return {
    schema_version: RELEASE_READINESS_SCHEMA_VERSION,
    run_id: runId,
    graph_id: v.graph_id,
    graph_fingerprint: v.graph_fingerprint,
    release_status: v.release_status,
    readiness_summary: v.readiness_summary,
    validated_components: v.validated_components,
    artifact_audit: v.artifact_audit,
    feature_flag_audit: v.feature_flag_audit,
    integration_audit: v.integration_audit,
    consistency_audit: v.consistency_audit,
    compatibility_audit: v.compatibility_audit,
    diagnostics: v.diagnostics,
    warnings: v.warnings,
    blockers: v.blockers,
    created_at,
    compat: {
      phase: RELEASE_READINESS_PHASE_TAG,
      advisory_only: true,
      source,
    },
  };
}

module.exports = {
  buildExecutionGraphReleaseReadinessDocument,
};
