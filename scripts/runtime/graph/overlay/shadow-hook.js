"use strict";

const { OVERLAY_MODE } = require("./constants");
const { isExecutionGraphOverlayShadowEnabled } = require("./feature-flags");
const { buildPipelineOverlayModel } = require("./overlay-engine");
const { buildOverlayReport } = require("./overlay-report-builder");
const { writeOverlayReportArtifact } = require("./artifact-writer");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowOverlayReport(opts) {
  if (!isExecutionGraphOverlayShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const model = buildPipelineOverlayModel({
      outputDir: String(outputDir),
      runId: String(runId),
    });
    const report = buildOverlayReport(model, {
      run_id: String(runId),
      overlay_mode: OVERLAY_MODE.SHADOW,
    });
    writeOverlayReportArtifact(String(outputDir), report);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-overlay] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowOverlayReport,
};
