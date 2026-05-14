"use strict";

const { isExecutionGraphReleaseReadinessShadowEnabled } = require("./feature-flags");
const { buildExecutionGraphReleaseReadinessDocument } = require("./release-report-builder");
const { writeExecutionGraphReleaseReadinessArtifact } = require("./artifact-writer");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowExecutionGraphReleaseReadiness(opts) {
  if (!isExecutionGraphReleaseReadinessShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const doc = buildExecutionGraphReleaseReadinessDocument({
      outputDir: String(outputDir),
      runId: String(runId),
      source: opts.source || "run-runtime",
    });
    writeExecutionGraphReleaseReadinessArtifact(String(outputDir), doc);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-release-readiness] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowExecutionGraphReleaseReadiness,
};
