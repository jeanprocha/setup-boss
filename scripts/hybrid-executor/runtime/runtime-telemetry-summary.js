"use strict";

const { isHybridExecutionApplyActive, getStructuralExecutionMinConfidenceFraction } = require("../feature-flags");

const TELEMETRY_AGGREGATE_SCHEMA_VERSION = 1;
const TELEMETRY_AGGREGATE_PHASE = "4.9.7.1";

/**
 * Telemetria agregada normalizada pós-corrida híbrida (sem alterar per_patch bruto).
 * @param {object[]} rows — hybridTelemetryOut
 * @param {{
 *   startedAt?: string,
 *   finishedAt?: string,
 *   durationMs?: number,
 *   runDistinctFiles?: number,
 * }} ctx
 */
function buildAggregatedHybridTelemetry(rows, ctx) {
  const rws = Array.isArray(rows) ? rows : [];
  const structural = rws.filter((r) => r && r.execution_mode_used === "structural").length;
  const textual = rws.filter((r) => r && r.execution_mode_used === "textual").length;

  /** @type {Record<string, number>} */
  const fallback_codes = {};
  /** @type {Record<string, number>} */
  const fallback_triggers = {};

  let governance_preempt_rows = 0;
  let replay_rows = 0;

  for (const r of rws) {
    if (!r) continue;
    const codes = Array.isArray(r.fallback_reason_codes) ? r.fallback_reason_codes : [];
    for (const c of codes) {
      if (!c) continue;
      fallback_codes[c] = (fallback_codes[c] || 0) + 1;
    }
    const tr = String(r.fallback_trigger || "none").trim() || "none";
    fallback_triggers[tr] = (fallback_triggers[tr] || 0) + 1;
    if (r.governance_preempt && (r.governance_preempt.codes?.length || r.governance_preempt.reasons?.length)) {
      governance_preempt_rows += 1;
    }
    if (r.structural_replay || r.plan_entry) replay_rows += 1;
  }

  return {
    telemetry_schema_version: TELEMETRY_AGGREGATE_SCHEMA_VERSION,
    phase: TELEMETRY_AGGREGATE_PHASE,
    telemetry_kind: "hybrid_runtime_aggregate",
    generated_at: new Date().toISOString(),
    execution_context: {
      hybrid_execution_apply_active: isHybridExecutionApplyActive(),
      min_confidence_fraction: getStructuralExecutionMinConfidenceFraction(),
    },
    window: {
      started_at: ctx?.startedAt || null,
      finished_at: ctx?.finishedAt || null,
      duration_ms: typeof ctx?.durationMs === "number" ? ctx.durationMs : null,
      run_distinct_files: typeof ctx?.runDistinctFiles === "number" ? ctx.runDistinctFiles : null,
    },
    counts: {
      patch_steps: rws.length,
      execution_mode_structural: structural,
      execution_mode_textual: textual,
      mixed_execution_modes: structural > 0 && textual > 0,
      rows_with_governance_preempt: governance_preempt_rows,
      rows_with_replay_or_plan: replay_rows,
    },
    histograms: {
      fallback_reason_codes: fallback_codes,
      fallback_triggers,
    },
  };
}

module.exports = {
  TELEMETRY_AGGREGATE_SCHEMA_VERSION,
  TELEMETRY_AGGREGATE_PHASE,
  buildAggregatedHybridTelemetry,
};
