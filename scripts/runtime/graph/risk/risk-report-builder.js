"use strict";

const { RISK_REPORT_SCHEMA_VERSION, RISK_PHASE_TAG, RISK_MODE } = require("./constants");

/**
 * @param {ReturnType<typeof import('./risk-analyzer')['runRiskAnalysis']>} analysis
 * @param {{ risk_mode: string }} annotation
 */
function buildRiskReport(analysis, annotation) {
  const risk_mode = String(annotation.risk_mode || RISK_MODE.SHADOW);
  return {
    schema_version: RISK_REPORT_SCHEMA_VERSION,
    run_id: analysis.run_id,
    graph_id: analysis.graph_id,
    graph_fingerprint: analysis.graph_fingerprint,
    risk_mode,
    overall_risk_level: analysis.overall_risk_level,
    detected_risks: analysis.detected_risks,
    deadlock_analysis: analysis.deadlock_analysis,
    cycle_analysis: analysis.cycle_analysis,
    replay_loop_analysis: analysis.replay_loop_analysis,
    orphan_analysis: analysis.orphan_analysis,
    blocked_chain_analysis: analysis.blocked_chain_analysis,
    integrity_summary: analysis.integrity_summary,
    runtime_safety_diagnostics: {
      transition_analysis: analysis.transition_analysis,
      retry_storm: analysis.retry_storm,
      scheduler_consistency: analysis.scheduler_consistency,
      overlay_risk: analysis.overlay_risk,
    },
    diagnostics: analysis.diagnostics,
    warnings: analysis.warnings,
    compat: {
      phase: RISK_PHASE_TAG,
      advisory_read_only: true,
      real_pipeline_handlers_invoked: false,
    },
    created_at: new Date().toISOString(),
  };
}

module.exports = {
  buildRiskReport,
};
