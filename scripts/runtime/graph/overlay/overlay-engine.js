"use strict";

const fs = require("fs");
const path = require("path");
const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { computeDeterministicSchedulingOrder } = require("../scheduler/dependency-resolver");
const { runSerialAdvisoryScheduler } = require("../scheduler/scheduler-engine");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { resetGlobalTransitionSeqForTests } = require("../runtime-state/transition-engine");
const { collectLinearPipelineOrder, NODE_PRIMARY_ARTIFACT } = require("./linear-collector");
const {
  loadOptionalExecutionArtifacts,
  validateFingerprintConsistency,
  findOrphanLinearNodes,
  findDuplicateSchedulerNodes,
} = require("./comparison-validators");
const {
  buildTransitionAnalysis,
  buildNodeComparison,
  buildDependencyAnalysis,
  computeOverlayStatusAndMessages,
} = require("./consistency-analyzer");

function artifactPresenceSet(outputDir) {
  const set = new Set();
  for (const rel of Object.values(NODE_PRIMARY_ARTIFACT)) {
    try {
      if (fs.existsSync(path.join(outputDir, rel))) set.add(rel);
    } catch (_) {
      /* ignore */
    }
  }
  return set;
}

/**
 * @param {{ outputDir: string, runId: string }} opts
 * @returns {object}
 */
function buildPipelineOverlayModel(opts) {
  const outputDir = String(opts.outputDir || "");
  const runId = String(opts.runId || "");

  const structural = buildCanonicalExecutionGraph();
  const graphFp = computeExecutionGraphFingerprint(structural);
  const graphId = `graph_${graphFp.slice(0, 32)}`;

  const deterministicOrder = computeDeterministicSchedulingOrder(structural);

  const loaded = loadOptionalExecutionArtifacts(outputDir);
  let schedulerReport = loaded.scheduler_report;
  let schedulerOrder = (schedulerReport && schedulerReport.executed_nodes) || [];
  let schedulerFallback = false;

  if (!schedulerOrder.length) {
    resetGlobalTransitionSeqForTests(0);
    const snap = buildInitialRuntimeSnapshot(structural, {
      run_id: runId || "overlay",
      now_iso: new Date().toISOString(),
      source: "overlay-fallback-scheduler",
    });
    const eng = runSerialAdvisoryScheduler(structural, snap);
    schedulerOrder = eng.executed_nodes;
    schedulerReport = { executed_nodes: eng.executed_nodes, diagnostics: eng.diagnostics };
    schedulerFallback = true;
  }

  const linearOut = collectLinearPipelineOrder(outputDir);
  const linearOrder = linearOut.linear_pipeline_order;

  const artSet = artifactPresenceSet(outputDir);
  const nodeComp = buildNodeComparison(structural, linearOrder, artSet);
  const depAnalysis = buildDependencyAnalysis(structural);
  const transAnalysis = buildTransitionAnalysis(loaded.execution_graph_runtime, schedulerReport);

  const graphIds = new Set((structural.nodes || []).map((n) => n.node_id));
  const linearOrphans = findOrphanLinearNodes(linearOrder, graphIds);

  const fpRes = validateFingerprintConsistency(
    structural,
    loaded.execution_graph_runtime,
    loaded.execution_graph,
  );

  const schedDups = findDuplicateSchedulerNodes(schedulerOrder);

  const statusPack = computeOverlayStatusAndMessages({
    linearOrder,
    deterministicOrder,
    schedulerOrder,
    runtimeDoc: loaded.execution_graph_runtime,
    fingerprintResult: fpRes,
    schedulerDuplicateNodes: schedDups,
    linearOrphans,
  });

  return {
    structural_meta: {
      graph_id: graphId,
      graph_fingerprint: graphFp,
      pipeline_variant: structural.pipeline_variant,
    },
    graph_deterministic_order: deterministicOrder,
    scheduler_execution_order: schedulerOrder,
    linear_pipeline_order: linearOrder,
    linear_collector_diagnostics: linearOut.diagnostics,
    checkpoint_phases: linearOut.checkpoint_phases,
    loaded_artifacts: {
      has_execution_graph: !!loaded.execution_graph,
      has_runtime: !!loaded.execution_graph_runtime,
      has_scheduler_report: !!loaded.scheduler_report,
      scheduler_in_memory_fallback: schedulerFallback,
    },
    node_comparison: nodeComp,
    dependency_analysis: depAnalysis,
    transition_analysis: transAnalysis,
    fingerprint_validation: fpRes,
    overlay_status: statusPack.overlay_status,
    warnings: statusPack.warnings,
    divergence_summary: statusPack.divergence_summary,
    consistency_summary: statusPack.consistency_summary,
  };
}

module.exports = {
  buildPipelineOverlayModel,
  artifactPresenceSet,
};
