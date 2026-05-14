"use strict";

const { ARTIFACT_FILENAME } = require("../constants");
const { RUNTIME_ARTIFACT_FILENAME } = require("../runtime-state/constants");
const { SCHEDULER_ARTIFACT_FILENAME } = require("../scheduler/constants");
const { OVERLAY_ARTIFACT_FILENAME } = require("../overlay/constants");
const { NODE_ADAPTERS_ARTIFACT_FILENAME } = require("../node-adapters/constants");
const { REPLAY_ARTIFACT_FILENAME } = require("../replay/constants");
const { tryReadJsonFile } = require("./safe-json");
const { analyzeCycles } = require("./cycle-validator");
const { analyzeIntegrity } = require("./integrity-validator");
const { analyzeDeadlock } = require("./deadlock-detector");
const { analyzeReplayLoops } = require("./replay-loop-detector");
const {
  validateRuntimeStructuralAlignment,
  validateTransitionsLogMonotonic,
  validateNodeTransitionHistoryOrder,
  validateNodeStateConsistency,
} = require("../runtime-state/validators");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { RISK_LEVEL, RISK_CATEGORY } = require("./constants");

/**
 * @param {object} structuralGraph
 * @param {string} outputDir
 * @param {string} runId
 */
function runRiskAnalysis(structuralGraph, outputDir, runId) {
  const artifacts_loaded = {};
  const load = (key, file) => {
    const r = tryReadJsonFile(outputDir, file);
    artifacts_loaded[key] = r.ok ? "ok" : `skip:${r.error || "unknown"}`;
    return r.ok ? r.data : null;
  };

  const executionGraph = load("execution_graph", ARTIFACT_FILENAME);
  const runtimeDoc = load("execution_graph_runtime", RUNTIME_ARTIFACT_FILENAME);
  const schedulerReport = load("scheduler_report", SCHEDULER_ARTIFACT_FILENAME);
  const overlayReport = load("overlay_report", OVERLAY_ARTIFACT_FILENAME);
  load("node_adapters", NODE_ADAPTERS_ARTIFACT_FILENAME);
  const replayReport = load("replay_report", REPLAY_ARTIFACT_FILENAME);

  const cycle_analysis = analyzeCycles(structuralGraph);
  const integrity_summary = analyzeIntegrity(structuralGraph, executionGraph, runtimeDoc);
  const deadlock_analysis = analyzeDeadlock(structuralGraph, schedulerReport, runtimeDoc);
  const replay_loop_analysis = analyzeReplayLoops(replayReport);

  const blocked_chain_analysis = {
    blocked_runtime_count: deadlock_analysis.blocked_runtime_nodes.length,
    blocked_runtime_nodes: deadlock_analysis.blocked_runtime_nodes,
    upstream_chains: deadlock_analysis.blocked_upstream_sample_chains,
    scheduler_blocked_nodes: deadlock_analysis.blocked_nodes_scheduler,
  };

  const transition_analysis = analyzeTransitionRisks(runtimeDoc);
  const scheduler_consistency = analyzeSchedulerConsistency(schedulerReport);
  const retry_storm = analyzeRetryStorm(runtimeDoc);
  const overlay_risk = analyzeOverlayRisk(overlayReport);

  /** @type {object[]} */
  const detected_risks = [];
  let maxRank = 0;
  const rank = { low: 1, medium: 2, high: 3, critical: 4 };

  function pushRisk(level, category, code, detail, node_ids) {
    detected_risks.push({
      id: `risk_${detected_risks.length + 1}`,
      category,
      level,
      code,
      detail,
      node_ids: node_ids && node_ids.length ? [...node_ids].sort() : undefined,
    });
    maxRank = Math.max(maxRank, rank[level] || 0);
  }

  if (cycle_analysis.hard_edge_cycle) {
    pushRisk(RISK_LEVEL.CRITICAL, RISK_CATEGORY.GRAPH_INTEGRITY, "hard_edge_cycle", "Ciclo em arestas hard.", []);
  }
  if (cycle_analysis.scheduling_edge_cycle) {
    pushRisk(RISK_LEVEL.CRITICAL, RISK_CATEGORY.DEPENDENCY_RESOLUTION, "scheduling_edge_cycle", "Ciclo nas arestas de scheduling.", []);
  }
  if (!integrity_summary.edge_reference_ok) {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.GRAPH_INTEGRITY, "edge_reference_invalid", integrity_summary.edge_reference_errors.join("; "));
  }
  if (integrity_summary.unexpected_source_orphans.length) {
    pushRisk(RISK_LEVEL.MEDIUM, RISK_CATEGORY.GRAPH_INTEGRITY, "unexpected_source_orphans", "Múltiplas fontes ou órfãos inesperados.", integrity_summary.unexpected_source_orphans);
  }
  if (integrity_summary.unreachable_from_scan_scheduling.length) {
    pushRisk(
      RISK_LEVEL.MEDIUM,
      RISK_CATEGORY.GRAPH_INTEGRITY,
      "unreachable_from_scan",
      "Nós não alcançáveis desde scan (scheduling).",
      integrity_summary.unreachable_from_scan_scheduling,
    );
  }
  if (integrity_summary.fingerprint_alignment === "mismatch" || integrity_summary.fingerprint_alignment === "mismatch_execution_graph") {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.RUNTIME_CONSISTENCY, "fingerprint_mismatch", `Alinhamento fingerprint: ${integrity_summary.fingerprint_alignment}.`, []);
  }
  if (integrity_summary.execution_graph_doc_ok === false) {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.GRAPH_INTEGRITY, "execution_graph_doc_invalid", integrity_summary.execution_graph_doc_errors.join("; "));
  }

  const alignRt = runtimeDoc
    ? validateRuntimeStructuralAlignment(runtimeDoc, structuralGraph, computeExecutionGraphFingerprint(structuralGraph))
    : { ok: true, errors: [] };
  if (!alignRt.ok) {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.RUNTIME_CONSISTENCY, "runtime_structural_mismatch", alignRt.errors.join("; "));
  }

  if (deadlock_analysis.scheduling_stuck_signal) {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.SCHEDULER_CONSISTENCY, "scheduler_stuck", deadlock_analysis.notes, deadlock_analysis.blocked_nodes_scheduler);
  }

  if (replay_loop_analysis.traversal_cycle_flag || replay_loop_analysis.duplicate_generation_nodes.length) {
    pushRisk(
      replay_loop_analysis.traversal_cycle_flag ? RISK_LEVEL.HIGH : RISK_LEVEL.MEDIUM,
      RISK_CATEGORY.REPLAY_CONSISTENCY,
      "replay_loop_or_inconsistent_generations",
      replay_loop_analysis.notes.join(" | ") || "Inconsistência replay.",
      replay_loop_analysis.duplicate_generation_nodes,
    );
  }

  if (!transition_analysis.transitions_log_ok) {
    pushRisk(RISK_LEVEL.HIGH, RISK_CATEGORY.TRANSITION_CONSISTENCY, "transition_log_invalid", transition_analysis.transition_errors.join("; "));
  }
  if (transition_analysis.history_errors.length) {
    pushRisk(RISK_LEVEL.MEDIUM, RISK_CATEGORY.TRANSITION_CONSISTENCY, "node_history_invalid", transition_analysis.history_errors.slice(0, 5).join("; "));
  }
  if (transition_analysis.state_errors.length) {
    pushRisk(RISK_LEVEL.MEDIUM, RISK_CATEGORY.RUNTIME_CONSISTENCY, "node_state_inconsistent", transition_analysis.state_errors.slice(0, 5).join("; "));
  }

  if (!scheduler_consistency.ok) {
    pushRisk(RISK_LEVEL.MEDIUM, RISK_CATEGORY.SCHEDULER_CONSISTENCY, "scheduler_order_mismatch", scheduler_consistency.detail || "scheduler vs deterministic order");
  }

  if (retry_storm.flagged) {
    pushRisk(RISK_LEVEL.MEDIUM, RISK_CATEGORY.RUNTIME_CONSISTENCY, "retry_storm_signal", retry_storm.detail, []);
  }

  if (overlay_risk.level !== RISK_LEVEL.LOW) {
    pushRisk(overlay_risk.level, RISK_CATEGORY.RUNTIME_CONSISTENCY, overlay_risk.code, overlay_risk.detail, []);
  }

  detected_risks.sort(
    (a, b) => String(a.level).localeCompare(String(b.level)) || String(a.code).localeCompare(String(b.code)),
  );

  const overall_risk_level =
    maxRank >= 4 ? RISK_LEVEL.CRITICAL : maxRank >= 3 ? RISK_LEVEL.HIGH : maxRank >= 2 ? RISK_LEVEL.MEDIUM : RISK_LEVEL.LOW;

  /** @type {string[]} */
  const warnings = [];
  if (String(artifacts_loaded.execution_graph || "").startsWith("skip")) {
    warnings.push(`Artefacto opcional em falta ou inválido: execution-graph (${artifacts_loaded.execution_graph})`);
  }
  if (replay_loop_analysis.replay_report_present === false) {
    warnings.push("Replay report ausente — replay_loop_analysis parcial.");
  }

  const diagnostics = {
    artifacts_loaded,
    advisory_read_only: true,
    real_pipeline_handlers_invoked: false,
  };

  return {
    run_id: String(runId),
    graph_id: `graph_${computeExecutionGraphFingerprint(structuralGraph).slice(0, 32)}`,
    graph_fingerprint: computeExecutionGraphFingerprint(structuralGraph),
    overall_risk_level,
    detected_risks,
    deadlock_analysis,
    cycle_analysis,
    replay_loop_analysis,
    orphan_analysis: {
      source_orphans: integrity_summary.source_orphans,
      unexpected_source_orphans: integrity_summary.unexpected_source_orphans,
    },
    blocked_chain_analysis,
    integrity_summary,
    transition_analysis,
    scheduler_consistency,
    retry_storm,
    overlay_risk,
    diagnostics,
    warnings,
  };
}

function analyzeTransitionRisks(runtimeDoc) {
  const transition_errors = [];
  const history_errors = [];
  const state_errors = [];
  if (!runtimeDoc) {
    return {
      transitions_log_ok: true,
      transition_errors: [],
      history_errors,
      state_errors,
    };
  }
  const tlog = validateTransitionsLogMonotonic(runtimeDoc.transitions || []);
  if (!tlog.ok) transition_errors.push(...tlog.errors);

  for (const row of runtimeDoc.nodes_runtime_state || []) {
    const h = validateNodeTransitionHistoryOrder(row.transition_history || []);
    if (!h.ok) history_errors.push(`${row.node_id}: ${h.errors.join(",")}`);
    const s = validateNodeStateConsistency(row);
    if (!s.ok) state_errors.push(`${row.node_id}: ${s.errors.join(",")}`);
  }

  return {
    transitions_log_ok: tlog.ok,
    transition_errors,
    history_errors,
    state_errors,
  };
}

function analyzeSchedulerConsistency(schedulerReport) {
  if (!schedulerReport || !Array.isArray(schedulerReport.executed_nodes) || !Array.isArray(schedulerReport.deterministic_order)) {
    return { ok: true, detail: "scheduler report ausente ou incompleto — skip." };
  }
  const a = schedulerReport.executed_nodes.join(",");
  const b = schedulerReport.deterministic_order.join(",");
  if (a !== b) {
    return { ok: false, detail: "executed_nodes ≠ deterministic_order no relatório scheduler." };
  }
  return { ok: true, detail: "scheduler order alinhada ao DAG determinístico." };
}

function analyzeRetryStorm(runtimeDoc) {
  const maxCorr = parseInt(process.env.MAX_CORRECTIONS || "3", 10) || 3;
  const g = runtimeDoc && runtimeDoc.attempts && runtimeDoc.attempts.global;
  const snap = g && g.correction_iterations_snapshot != null ? Number(g.correction_iterations_snapshot) : null;
  if (snap != null && snap >= maxCorr) {
    return {
      flagged: true,
      detail: `correction_iterations_snapshot (${snap}) >= MAX_CORRECTIONS (${maxCorr}) — sinal de retry storm.`,
    };
  }
  let maxNodeAttempts = 0;
  const by = (runtimeDoc && runtimeDoc.attempts && runtimeDoc.attempts.by_node_id) || {};
  for (const k of Object.keys(by)) {
    const n = Number(by[k]);
    if (Number.isFinite(n) && n > maxNodeAttempts) maxNodeAttempts = n;
  }
  if (maxNodeAttempts >= 3) {
    return { flagged: true, detail: `by_node_id attempts elevados (max=${maxNodeAttempts}).` };
  }
  return { flagged: false, detail: "sem sinal forte de retry storm." };
}

function analyzeOverlayRisk(overlayReport) {
  if (!overlayReport || !overlayReport.overlay_status) {
    return { level: RISK_LEVEL.LOW, code: "overlay_absent", detail: "Overlay report ausente." };
  }
  if (overlayReport.overlay_status === "divergent") {
    return { level: RISK_LEVEL.HIGH, code: "overlay_divergent", detail: "overlay_status divergent." };
  }
  if (overlayReport.overlay_status === "warning") {
    return { level: RISK_LEVEL.MEDIUM, code: "overlay_warning", detail: "overlay_status warning." };
  }
  return { level: RISK_LEVEL.LOW, code: "overlay_ok", detail: "overlay consistent." };
}

module.exports = {
  runRiskAnalysis,
};
