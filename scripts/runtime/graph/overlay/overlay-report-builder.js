"use strict";

const { OVERLAY_REPORT_SCHEMA_VERSION } = require("./constants");

/**
 * @param {ReturnType<typeof import("./overlay-engine").buildPipelineOverlayModel>} model
 * @param {{ run_id: string, overlay_mode: 'off'|'shadow' }} meta
 */
function buildOverlayReport(model, meta) {
  const nodeComp = model.node_comparison;
  return {
    schema_version: OVERLAY_REPORT_SCHEMA_VERSION,
    run_id: meta.run_id,
    graph_id: model.structural_meta.graph_id,
    graph_fingerprint: model.structural_meta.graph_fingerprint,
    overlay_mode: meta.overlay_mode,
    overlay_status: model.overlay_status,
    linear_pipeline_order: model.linear_pipeline_order,
    graph_deterministic_order: model.graph_deterministic_order,
    scheduler_execution_order: model.scheduler_execution_order,
    node_comparison: {
      rows: nodeComp.rows,
      missing_from_linear: nodeComp.missing_from_linear,
    },
    dependency_analysis: model.dependency_analysis,
    transition_analysis: model.transition_analysis,
    consistency_summary: model.consistency_summary,
    divergence_summary: model.divergence_summary,
    warnings: model.warnings,
    diagnostics: {
      linear_collector: model.linear_collector_diagnostics,
      checkpoint_phases: model.checkpoint_phases,
      loaded_artifacts: model.loaded_artifacts,
      fingerprint_validation: model.fingerprint_validation,
    },
    created_at: new Date().toISOString(),
  };
}

module.exports = {
  buildOverlayReport,
};
