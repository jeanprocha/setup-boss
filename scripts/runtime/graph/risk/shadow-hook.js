"use strict";

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { isExecutionGraphRiskShadowEnabled } = require("./feature-flags");
const { runRiskAnalysis } = require("./risk-analyzer");
const { buildRiskReport } = require("./risk-report-builder");
const { writeRiskReportArtifact } = require("./artifact-writer");
const { RISK_MODE } = require("./constants");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowRiskReport(opts) {
  if (!isExecutionGraphRiskShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const structural = buildCanonicalExecutionGraph();
    const analysis = runRiskAnalysis(structural, String(outputDir), String(runId));
    const report = buildRiskReport(analysis, { risk_mode: RISK_MODE.SHADOW });
    writeRiskReportArtifact(String(outputDir), report);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-risk] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowRiskReport,
};
