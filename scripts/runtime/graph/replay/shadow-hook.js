"use strict";

const fs = require("fs");
const path = require("path");

const { buildCanonicalExecutionGraph } = require("../graph-builder");
const { RUNTIME_ARTIFACT_FILENAME } = require("../runtime-state/constants");
const { buildInitialRuntimeSnapshot } = require("../runtime-state/snapshot-builder");
const { buildRegisteredAdapterRegistry } = require("../node-adapters/adapter-registry");
const { REPLAY_MODE } = require("./constants");
const { isExecutionGraphReplayShadowEnabled } = require("./feature-flags");
const { planGraphReplay, parseReplayTargetsFromEnv, parseReplayBoundaryStopsFromEnv } = require("./replay-planner");
const { buildReplayReport } = require("./replay-report-builder");
const { writeReplayReportArtifact } = require("./artifact-writer");

function tryLoadRuntimeSnapshotJson(outputDir) {
  const p = path.join(path.resolve(String(outputDir)), RUNTIME_ARTIFACT_FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Hook shadow pós-run: gera `execution-graph-replay-report.json` (best-effort).
 *
 * @param {{
 *   outputDir: string|null|undefined,
 *   runId: string|null|undefined,
 *   pipelineStatus?: string|null,
 *   correctionIterations?: number|null,
 *   source?: string,
 * }} opts
 */
function tryWriteShadowReplayReport(opts) {
  if (!isExecutionGraphReplayShadowEnabled()) return;
  const outputDir = opts && opts.outputDir;
  const runId = opts && opts.runId;
  if (!outputDir || !runId) return;

  try {
    const structural = buildCanonicalExecutionGraph();
    const nowIso = new Date().toISOString();
    const annotationRt = {
      run_id: String(runId),
      now_iso: nowIso,
      pipeline_status: opts.pipelineStatus ?? null,
      correction_iterations:
        opts.correction_iterations != null ? Number(opts.correction_iterations) : null,
      source: opts.source || "run-runtime",
    };
    const runtimeSnapshot =
      tryLoadRuntimeSnapshotJson(outputDir) ||
      buildInitialRuntimeSnapshot(structural, annotationRt);

    const { adapters } = buildRegisteredAdapterRegistry(structural);
    const targets = parseReplayTargetsFromEnv();
    const boundaryStops = parseReplayBoundaryStopsFromEnv();

    const planResult = planGraphReplay({
      structuralGraph: structural,
      runtimeSnapshot,
      adapters,
      target_node_ids: targets,
      boundary_stop_node_ids: boundaryStops,
    });

    const report = buildReplayReport(planResult, {
      run_id: String(runId),
      replay_mode: REPLAY_MODE.SHADOW,
    });
    writeReplayReportArtifact(String(outputDir), report);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err || "");
    if (process.env.SETUP_BOSS_EXECUTION_GRAPH_DEBUG === "1") {
      console.warn("[execution-graph-replay] shadow write skipped:", msg.slice(0, 400));
    }
  }
}

module.exports = {
  tryWriteShadowReplayReport,
  tryLoadRuntimeSnapshotJson,
};
