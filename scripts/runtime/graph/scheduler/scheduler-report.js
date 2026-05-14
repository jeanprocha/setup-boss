"use strict";

const { SCHEDULER_REPORT_SCHEMA_VERSION } = require("./constants");
const { buildLifecycleSummary } = require("../runtime-state/snapshot-builder");

/**
 * @param {ReturnType<typeof import("./scheduler-engine").runSerialAdvisoryScheduler>} engineResult
 * @param {{
 *   run_id: string,
 *   graph_id: string,
 *   graph_fingerprint: string,
 *   scheduler_mode: 'off'|'shadow',
 * }} meta
 */
function buildSchedulerReport(engineResult, meta) {
  const created_at = new Date().toISOString();
  const adv = engineResult.advisory_doc;

  const lifecycle_summary = adv
    ? buildLifecycleSummary(adv.nodes_runtime_state || [])
    : { total_nodes: 0, by_status: {}, pending_count: 0, terminal_count: 0 };

  return {
    schema_version: SCHEDULER_REPORT_SCHEMA_VERSION,
    run_id: meta.run_id,
    graph_id: meta.graph_id,
    graph_fingerprint: meta.graph_fingerprint,
    scheduler_mode: meta.scheduler_mode,
    deterministic_order: engineResult.deterministic_order,
    executed_nodes: engineResult.executed_nodes,
    ready_events: engineResult.ready_events,
    blocked_nodes: engineResult.blocked_nodes,
    skipped_repeat_edges: engineResult.skipped_repeat_edges,
    transition_count: engineResult.transition_count,
    lifecycle_summary,
    diagnostics: {
      ...(engineResult.diagnostics || {}),
      validation_errors: engineResult.errors && engineResult.errors.length ? engineResult.errors : undefined,
      ok: engineResult.ok,
    },
    created_at,
  };
}

module.exports = {
  buildSchedulerReport,
};
