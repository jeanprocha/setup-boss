"use strict";

const { isExecutionGraphShadowEnabled } = require("./feature-flags");
const { buildCanonicalExecutionGraph } = require("./graph-builder");
const {
  buildExecutionGraphDocument,
  writeExecutionGraphArtifact,
} = require("./artifact-writer");
const {
  tryWriteShadowExecutionGraphRuntimeArtifact,
} = require("./runtime-state/shadow-hook");
const { tryWriteShadowSchedulerReport } = require("./scheduler/shadow-hook");
const { tryWriteShadowOverlayReport } = require("./overlay/shadow-hook");
const { tryWriteShadowNodeAdaptersArtifact } = require("./node-adapters/shadow-hook");
const { tryWriteShadowReplayReport } = require("./replay/shadow-hook");
const { tryWriteShadowRiskReport } = require("./risk/shadow-hook");
const {
  tryWriteShadowExecutionGraphReleaseReadiness,
} = require("./release-readiness/shadow-hook");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowExecutionGraphArtifacts(opts) {
  tryWriteShadowExecutionGraphArtifact(opts);
  tryWriteShadowExecutionGraphRuntimeArtifact(opts);
  tryWriteShadowSchedulerReport(opts);
  tryWriteShadowOverlayReport(opts);
  tryWriteShadowNodeAdaptersArtifact(opts);
  tryWriteShadowReplayReport(opts);
  tryWriteShadowRiskReport(opts);
  tryWriteShadowExecutionGraphReleaseReadiness(opts);
}

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowExecutionGraphArtifact(opts) {
  if (!isExecutionGraphShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const structural = buildCanonicalExecutionGraph();
    const doc = buildExecutionGraphDocument(structural, {
      run_id: runId,
      pipeline_status: opts.pipelineStatus ?? null,
      correction_iterations:
        opts.correctionIterations != null ? Number(opts.correctionIterations) : null,
      source: opts.source || "run-runtime",
    });
    writeExecutionGraphArtifact(String(outputDir), doc);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowExecutionGraphArtifact,
  tryWriteShadowExecutionGraphArtifacts,
  tryWriteShadowExecutionGraphRuntimeArtifact,
  tryWriteShadowSchedulerReport,
  tryWriteShadowOverlayReport,
  tryWriteShadowNodeAdaptersArtifact,
  tryWriteShadowReplayReport,
  tryWriteShadowRiskReport,
  tryWriteShadowExecutionGraphReleaseReadiness,
};
