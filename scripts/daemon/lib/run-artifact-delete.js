"use strict";

const fs = require("fs");
const path = require("path");
const { getCliPaths } = require("../../cli/lib/paths");

const RUN_INDEX_PREFIX = "run-index:";

/**
 * @param {string} key
 * @returns {{ runId: string|null, jobId: string|null }}
 */
function parseRunDeleteKey(key) {
  const k = String(key || "").trim();
  if (!k) return { runId: null, jobId: null };

  if (k.startsWith(RUN_INDEX_PREFIX)) {
    const runId = k.slice(RUN_INDEX_PREFIX.length).trim();
    return {
      runId: runId || null,
      jobId: runId ? k : null,
    };
  }

  if (/^\d{8}-\d{6}-/.test(k)) {
    return { runId: k, jobId: null };
  }

  return { runId: null, jobId: k };
}

/**
 * Remove `.setup-boss/runs/{runId}.json`.
 * @param {string} runId
 * @param {string} [repoRoot]
 * @returns {{ ok: true, runId: string } | { ok: false, code: string, message: string }}
 */
function deleteRunIndexArtifact(runId, repoRoot) {
  const rid = String(runId || "").trim();
  if (!rid) {
    return {
      ok: false,
      code: "invalid_run_id",
      message: "runId vazio.",
    };
  }

  const { RUNS_DIR } = getCliPaths(repoRoot);
  const indexPath = path.join(RUNS_DIR, `${rid}.json`);

  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      code: "not_found",
      message: "Índice da corrida não encontrado em disco.",
    };
  }

  try {
    fs.unlinkSync(indexPath);
    return { ok: true, runId: rid };
  } catch (err) {
    return {
      ok: false,
      code: "delete_failed",
      message: String((err && err.message) || err),
    };
  }
}

module.exports = {
  RUN_INDEX_PREFIX,
  parseRunDeleteKey,
  deleteRunIndexArtifact,
};
