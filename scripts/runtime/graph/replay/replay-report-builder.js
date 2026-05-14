"use strict";

const {
  REPLAY_REPORT_SCHEMA_VERSION,
  REPLAY_PHASE_TAG,
} = require("./constants");

/**
 * @param {ReturnType<typeof import('./replay-planner')['planGraphReplay']>} planResult — objeto plano (campos largos)
 * @param {{ run_id: string, replay_mode: string }} annotation
 */
function buildReplayReport(planResult, annotation) {
  const run_id = String(annotation.run_id || "");
  const replay_mode = String(annotation.replay_mode || "shadow");

  return {
    schema_version: REPLAY_REPORT_SCHEMA_VERSION,
    run_id,
    graph_id: planResult.graph_id,
    graph_fingerprint: planResult.graph_fingerprint,
    replay_mode,
    target_nodes: planResult.target_nodes,
    replay_subtree: planResult.replay_subtree,
    invalidated_nodes: planResult.invalidated_nodes,
    replay_order: planResult.replay_order,
    replay_generations: planResult.replay_generations,
    replay_safe_nodes: planResult.replay_safe_nodes,
    replay_blocked_nodes: planResult.replay_blocked_nodes,
    replay_boundaries: planResult.replay_boundaries,
    replay_capability_matrix: planResult.replay_capability_matrix,
    dependency_invalidation: planResult.dependency_invalidation,
    diagnostics: planResult.diagnostics,
    replay_blockers: planResult.replay_blockers,
    warnings: planResult.warnings,
    compat: {
      phase: REPLAY_PHASE_TAG,
      advisory_only: true,
      real_pipeline_handlers_invoked: false,
      deterministic_order_ref: planResult.deterministic_order,
      skipped_repeat_edges: planResult.skipped_repeat_edges,
      repeat_edges_policy: planResult.repeat_edges_policy,
      planning_ok: planResult.ok,
    },
    created_at: new Date().toISOString(),
  };
}

module.exports = {
  buildReplayReport,
};
