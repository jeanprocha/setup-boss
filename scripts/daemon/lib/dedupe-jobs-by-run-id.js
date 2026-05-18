"use strict";

/**
 * Mantém um job por runId (o mais recente por `createdAt`).
 * Jobs sem runId permanecem todos (chave = id do job).
 * @param {object[]} jobs
 * @returns {object[]}
 */
function dedupeJobsByRunId(jobs) {
  /** @type {Map<string, object>} */
  const byRunId = new Map();
  /** @type {object[]} */
  const withoutRunId = [];

  for (const job of jobs) {
    const runId = job.runId != null ? String(job.runId).trim() : "";
    if (!runId) {
      withoutRunId.push(job);
      continue;
    }
    const prev = byRunId.get(runId);
    if (!prev) {
      byRunId.set(runId, job);
      continue;
    }
    const t = Date.parse(String(job.createdAt || ""));
    const pt = Date.parse(String(prev.createdAt || ""));
    if (Number.isFinite(t) && (!Number.isFinite(pt) || t >= pt)) {
      byRunId.set(runId, job);
    }
  }

  return [...byRunId.values(), ...withoutRunId];
}

module.exports = { dedupeJobsByRunId };
