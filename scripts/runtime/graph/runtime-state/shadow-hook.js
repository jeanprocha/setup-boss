"use strict";

const { isExecutionGraphRuntimeShadowEnabled } = require("./feature-flags");
const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { buildInitialRuntimeSnapshot } = require("./snapshot-builder");
const { writeExecutionGraphRuntimeArtifact } = require("./artifact-writer");

/**
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowExecutionGraphRuntimeArtifact(opts) {
  if (!isExecutionGraphRuntimeShadowEnabled()) return;
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
    writeExecutionGraphRuntimeArtifact(String(outputDir), doc);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-runtime] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowExecutionGraphRuntimeArtifact,
};
