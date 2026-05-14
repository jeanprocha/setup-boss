"use strict";

const { OVERLAY_STATUS } = require("./constants");
const { SCHEDULER_ADVISORY_SOURCE } = require("../scheduler/constants");
const {
  validateSchedulerVsDeterministic,
  validateLinearMonotoneIndices,
  detectLoopLikeRepeats,
} = require("./comparison-validators");

/**
 * @param {object|null} runtimeDoc
 * @param {{ executed_nodes?: string[] }|null} schedulerReport
 */
function buildTransitionAnalysis(runtimeDoc, schedulerReport) {
  const rt = runtimeDoc && Array.isArray(runtimeDoc.transitions) ? runtimeDoc.transitions : [];
  const summary = {
    runtime_transition_count: rt.length,
    runtime_has_entries: rt.length > 0,
    scheduler_executable_order_length:
      schedulerReport && schedulerReport.executed_nodes ? schedulerReport.executed_nodes.length : 0,
    advisory_meta_source: SCHEDULER_ADVISORY_SOURCE,
  };
  const issues = [];
  if (!summary.runtime_has_entries) {
    issues.push("runtime sem transitions persistidas (esperado em shadow 4.12.2 snapshot inicial)");
  }
  return { summary, issues };
}

/**
 * @param {object} structuralGraph
 * @param {string[]} linearOrder
 * @param {Set<string>} artifactPresent
 */
function buildNodeComparison(structuralGraph, linearOrder, artifactPresent) {
  const ids = new Set((structuralGraph.nodes || []).map((n) => n.node_id));
  const rows = [];
  for (const n of structuralGraph.nodes || []) {
    const nid = n.node_id;
    const inLinear = linearOrder.includes(nid);
    const art = (n.artifacts_expected && n.artifacts_expected[0]) || "";
    const hasArt = art ? artifactPresent.has(art) : false;
    rows.push({
      node_id: nid,
      kind: n.kind,
      observed_in_linear_sequence: inLinear,
      primary_artifact_present: hasArt,
      expected_artifact: art || null,
    });
  }
  const missingNodes = [...ids].filter((id) => !linearOrder.includes(id)).sort();
  return { rows, missing_from_linear: missingNodes };
}

/**
 * @param {object} structuralGraph
 */
function buildDependencyAnalysis(structuralGraph) {
  return {
    scheduling_edge_count: (structuralGraph.edges || []).length,
    repeat_edge_count: (structuralGraph.repeat_edges || []).length,
    repeat_edges: structuralGraph.repeat_edges || [],
    note: "repeat_edges não modeladas no scheduler 4.12.3; loops reais podem gerar avisos no overlay",
  };
}

/**
 * @param {*} opts
 */
function computeOverlayStatusAndMessages(opts) {
  const {
    linearOrder,
    deterministicOrder,
    schedulerOrder,
    runtimeDoc,
    fingerprintResult,
    schedulerDuplicateNodes,
    linearOrphans,
  } = opts;

  const warnings = [];
  const divergence_summary = [];
  let overlay_status = OVERLAY_STATUS.CONSISTENT;

  if (fingerprintResult && !fingerprintResult.ok) {
    overlay_status = OVERLAY_STATUS.DIVERGENT;
    divergence_summary.push({ code: "fingerprint_inconsistency", errors: fingerprintResult.errors });
  }

  const sch = validateSchedulerVsDeterministic(schedulerOrder || [], deterministicOrder || []);
  if (!sch.ok) {
    if (overlay_status !== OVERLAY_STATUS.DIVERGENT) overlay_status = OVERLAY_STATUS.WARNING;
    divergence_summary.push({ code: "scheduler_order_mismatch", errors: sch.errors });
  }

  if (schedulerDuplicateNodes && schedulerDuplicateNodes.length) {
    overlay_status = OVERLAY_STATUS.DIVERGENT;
    divergence_summary.push({
      code: "duplicate_advisory_scheduler_nodes",
      nodes: schedulerDuplicateNodes,
    });
  }

  if (linearOrphans && linearOrphans.length) {
    overlay_status = OVERLAY_STATUS.DIVERGENT;
    divergence_summary.push({ code: "orphan_linear_nodes", nodes: linearOrphans });
  }

  const lin = validateLinearMonotoneIndices(linearOrder || [], deterministicOrder || []);
  const loopHints = detectLoopLikeRepeats(linearOrder || []);

  if (!lin.ok) {
    if (loopHints.length > 0) {
      if (overlay_status === OVERLAY_STATUS.CONSISTENT) overlay_status = OVERLAY_STATUS.WARNING;
      warnings.push({
        code: "linear_order_non_monotone_due_to_pipeline_loop",
        detail: lin.errors,
        loop_hints: loopHints,
      });
    } else if (overlay_status === OVERLAY_STATUS.CONSISTENT) {
      overlay_status = OVERLAY_STATUS.DIVERGENT;
      divergence_summary.push({ code: "linear_dag_monotonicity", errors: lin.errors });
    } else {
      warnings.push({ code: "linear_monotonicity_under_prior_issues", errors: lin.errors });
    }
  }

  const rtLen = (runtimeDoc && runtimeDoc.transitions && runtimeDoc.transitions.length) || 0;
  if (rtLen === 0 && (schedulerOrder || []).length > 0) {
    if (overlay_status === OVERLAY_STATUS.CONSISTENT) overlay_status = OVERLAY_STATUS.WARNING;
    warnings.push({
      code: "runtime_transitions_empty_scheduler_advisory_present",
      message:
        "execution-graph-runtime.json típico só tem snapshot inicial; comparabilidade limitada",
    });
  }

  return {
    overlay_status,
    warnings,
    divergence_summary,
    consistency_summary: {
      fingerprints_ok: !!(fingerprintResult && fingerprintResult.ok),
      scheduler_matches_deterministic: sch.ok,
      linear_compatible_with_dag: lin.ok || loopHints.length > 0,
      scheduler_advisory_single_pass: !(schedulerDuplicateNodes && schedulerDuplicateNodes.length),
    },
  };
}

module.exports = {
  buildTransitionAnalysis,
  buildNodeComparison,
  buildDependencyAnalysis,
  computeOverlayStatusAndMessages,
};
