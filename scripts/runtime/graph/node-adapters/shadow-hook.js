"use strict";

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { isExecutionGraphNodeAdaptersShadowEnabled } = require("./feature-flags");
const { buildNodeAdaptersArtifact, writeNodeAdaptersArtifact } = require("./artifact-writer");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowNodeAdaptersArtifact(opts) {
  if (!isExecutionGraphNodeAdaptersShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const structural = buildCanonicalExecutionGraph();
    const doc = buildNodeAdaptersArtifact(structural, {
      run_id: String(runId),
      pipeline_status: opts.pipelineStatus ?? null,
      correction_iterations:
        opts.correctionIterations != null ? Number(opts.correctionIterations) : null,
      source: opts.source || "run-runtime",
    });
    writeNodeAdaptersArtifact(String(outputDir), doc);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-node-adapters] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowNodeAdaptersArtifact,
};
