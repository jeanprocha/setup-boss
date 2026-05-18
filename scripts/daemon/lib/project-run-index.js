"use strict";

const path = require("path");
const { discoverRuns } = require("../../cli/lib/runs-discovery");
const { canonicalProjectRoot, deriveProjectId } = require("./project-registry");

/**
 * @param {string} runId
 * @returns {string}
 */
function phraseFromRunId(runId) {
  const rid = String(runId || "").trim();
  const m = /^(\d{8}-\d{6})-(.+)$/.exec(rid);
  if (!m || !m[2]) return rid;
  return m[2].replace(/-/g, " ").replace(/\s+/g, " ").trim() || rid;
}

/**
 * Jobs sintéticos a partir de `.setup-boss/runs/*.json` para projectos sem job na fila.
 * @param {{
 *   repoRoot: string,
 *   projectId: string,
 *   projectRootCanonical?: string|null,
 *   existingRunIds?: Set<string>,
 * }} opts
 * @returns {object[]}
 */
function listSyntheticJobsFromRunIndex(opts) {
  const repoRoot = path.resolve(String(opts.repoRoot || ""));
  const projectId = String(opts.projectId || "").trim();
  const projectRootCanonical =
    opts.projectRootCanonical != null && String(opts.projectRootCanonical).trim()
      ? canonicalProjectRoot(String(opts.projectRootCanonical))
      : null;
  if (!projectId && !projectRootCanonical) return [];

  const seen = new Set(opts.existingRunIds || []);
  /** @type {object[]} */
  const out = [];

  for (const entry of discoverRuns({ includeLegacy: false, repoRoot })) {
    const proot = entry.project_root ? canonicalProjectRoot(String(entry.project_root)) : "";
    if (!proot) continue;
    const pid = deriveProjectId(proot);
    if (projectId && pid !== projectId) continue;
    if (projectRootCanonical && proot !== projectRootCanonical) continue;

    const runId = String(entry.run_id || "").trim();
    if (!runId || seen.has(runId)) continue;
    seen.add(runId);

    const title = phraseFromRunId(runId);
    out.push({
      id: `run-index:${runId}`,
      status: "completed",
      projectRoot: proot,
      projectId: pid,
      taskArg: runId,
      projectArg: path.basename(proot),
      createdAt: entry.created_at || new Date(0).toISOString(),
      startedAt: entry.created_at || null,
      finishedAt: entry.created_at || null,
      runId,
      attempts: 0,
      retryable: false,
      metadata: {
        displayTitle: title || runId,
        uiState: "success",
        uiPhase: "done",
        source: "run-index",
      },
    });
  }

  return out;
}

module.exports = {
  listSyntheticJobsFromRunIndex,
  phraseFromRunId,
};
