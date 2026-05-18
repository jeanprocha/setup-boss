const { countsByStatus } = require("./queue-store");

/**
 * Resolve runId operacional a partir do job na fila.
 * @param {string|null} jobId
 * @param {{ jobs?: object[] }} queue
 */
function resolveRunIdForJobId(jobId, queue) {
  if (!jobId) return null;
  const jobs = Array.isArray(queue?.jobs) ? queue.jobs : [];
  const j = jobs.find((x) => x && String(x.id) === String(jobId));
  if (!j) return null;
  const meta =
    j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
      ? j.metadata
      : {};
  const rid =
    meta.executionRunId || meta.runId || j.runId || null;
  return rid != null && String(rid).trim() ? String(rid).trim() : null;
}

function pickLatestIso(...candidates) {
  let best = null;
  let bestMs = -1;
  for (const c of candidates) {
    if (!c || typeof c !== "string") continue;
    const ms = Date.parse(c);
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = c;
    }
  }
  return best;
}

/**
 * Heartbeat operacional mínimo (sem métricas complexas).
 * @param {{ snap: object, diskStatus: object|null, queue: object }} input
 */
function buildRuntimeHeartbeat({ snap, diskStatus, queue }) {
  const qc = countsByStatus(queue);
  const queueSize =
    (typeof qc.pending === "number" ? qc.pending : 0) +
    (typeof qc.running === "number" ? qc.running : 0);

  const daemonAlive = snap && snap.running !== false;

  const diskWorker =
    diskStatus && diskStatus.worker && typeof diskStatus.worker === "object"
      ? diskStatus.worker
      : null;

  const runningJobsCount =
    diskStatus &&
    typeof diskStatus.runningJobsCount === "number" &&
    Number.isFinite(diskStatus.runningJobsCount)
      ? diskStatus.runningJobsCount
      : Array.isArray(snap?.runningJobs)
        ? snap.runningJobs.length
        : typeof qc.running === "number"
          ? qc.running
          : 0;

  const currentJobId =
    snap && snap.busy && snap.currentJobId
      ? String(snap.currentJobId)
      : diskWorker && diskWorker.currentJobId
        ? String(diskWorker.currentJobId)
        : null;

  const currentRunId = resolveRunIdForJobId(currentJobId, queue);

  const workerBusy =
    Boolean(snap && snap.busy) ||
    Boolean(diskWorker && diskWorker.busy) ||
    runningJobsCount > 0;

  const workerState = workerBusy ? "busy" : "idle";

  const runningJobs = Array.isArray(queue?.jobs)
    ? queue.jobs.filter((j) => String(j?.status || "") === "running")
    : [];

  const jobActivityIso = runningJobs
    .map((j) => pickLatestIso(j.lastProgressAt, j.heartbeatAt, j.startedAt))
    .filter(Boolean);

  const lastRuntimeActivityAt = pickLatestIso(
    diskStatus?.updatedAt,
    diskWorker?.lastPipelineEventAt,
    snap?.startedAt,
    ...jobActivityIso,
  );

  const daemonStartedAt =
    (snap && typeof snap.startedAt === "string" && snap.startedAt) ||
    (diskStatus && typeof diskStatus.startedAt === "string" && diskStatus.startedAt) ||
    null;

  return {
    daemonAlive,
    runningJobsCount,
    currentJobId,
    currentRunId,
    lastRuntimeActivityAt,
    workerState,
    queueSize,
    daemonStartedAt,
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildRuntimeHeartbeat,
  resolveRunIdForJobId,
};
