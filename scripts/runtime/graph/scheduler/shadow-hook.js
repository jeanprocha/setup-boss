"use strict";

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { isExecutionGraphSchedulerShadowEnabled } = require("./feature-flags");
const { runSerialAdvisoryScheduler } = require("./scheduler-engine");
const { buildSchedulerReport } = require("./scheduler-report");
const { writeSchedulerReportArtifact } = require("./artifact-writer");
const { SCHEDULER_ENV_MODE } = require("./constants");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowSchedulerReport(opts) {
  if (!isExecutionGraphSchedulerShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const structural = buildCanonicalExecutionGraph();
    const nowIso = new Date().toISOString();
    const doc = buildInitialRuntimeSnapshot(structural, {
      run_id: runId,
      now_iso: nowIso,
      pipeline_status: opts.pipelineStatus ?? null,
      correction_iterations:
        opts.correctionIterations != null ? Number(opts.correctionIterations) : null,
      source: opts.source || "run-runtime",
    });

    const engineResult = runSerialAdvisoryScheduler(structural, doc);
    const report = buildSchedulerReport(engineResult, {
      run_id: String(runId),
      graph_id: doc.graph_id,
      graph_fingerprint: doc.graph_fingerprint,
      scheduler_mode: SCHEDULER_ENV_MODE.SHADOW,
    });

    writeSchedulerReportArtifact(String(outputDir), report);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-scheduler] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowSchedulerReport,
};
