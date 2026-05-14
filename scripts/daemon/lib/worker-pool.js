"use strict";

const { deriveProjectId } = require("./project-registry");

/**
 * Pool de workers locais (Fase 3.8). Slots fixos em memória; sem processos dedicados por slot.
 */

/** @returns {{ maxWorkers: number, maxWorkersPerProject: number }} */
function parseWorkerPoolConfig() {
  const maxWorkers = Math.max(
    1,
    Math.floor(Number(process.env.SETUP_BOSS_MAX_WORKERS || 1)),
  );

  const maxWorkersPerProject = Math.max(
    1,
    Math.floor(Number(process.env.SETUP_BOSS_MAX_WORKERS_PER_PROJECT || 1)),
  );

  return { maxWorkers, maxWorkersPerProject };
}

/**
 * @param {Array<{ projectId?: string|null, projectRoot: string, createdAt: string }>} pendingJobs
 * @param {number} rrCursor
 */
function buildFairnessPendingOrder(pendingJobs, rrCursor) {
  /** @type {Map<string, typeof pendingJobs>} */
  const byProject = new Map();

  for (const j of pendingJobs) {
    const pid =
      j.projectId != null && String(j.projectId).trim()
        ? String(j.projectId).trim()
        : deriveProjectId(String(j.projectRoot || ""));

    if (!byProject.has(pid)) byProject.set(pid, []);

    byProject.get(pid).push(j);
  }

  for (const arr of byProject.values()) {
    arr.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  const heads = [...byProject.keys()]
    .map((pk) => (byProject.get(pk) || [])[0])
    .filter(Boolean)

    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  if (!heads.length) return [];

  const n = heads.length;

  const base = Math.max(0, Math.floor(Number(rrCursor) || 0));

  /** @type {typeof pendingJobs} */
  const out = [];

  for (let i = 0; i < n; i += 1) out.push(heads[(base + i) % n]);

  return out;
}

/**
 * @param {number} maxWorkers
 */
function createInitialSlots(maxWorkers) {
  const n = Math.max(1, Math.floor(maxWorkers));

  const slots = [];

  for (let i = 0; i < n; i += 1) {
    slots.push({
      workerId: `worker_${i + 1}`,

      status: /** @type {"idle"|"busy"|"stopping"} */ ("idle"),

      jobId: null,

      projectId: null,

      projectRoot: null,

      startedAt: null,

      lastHeartbeatAt: null,

      workerCtl: { child: /** @type {import("child_process").ChildProcess | null} */ (null) },
    });
  }

  return slots;
}

/**
 * @typedef {{
 *   workerId: string,
 *   status: "idle"|"busy"|"stopping",
 *   jobId: string|null,
 *   projectId: string|null,
 *   projectRoot: string|null,
 *   startedAt: string|null,
 *   lastHeartbeatAt: string|null,
 *   workerCtl: { child: import("child_process").ChildProcess | null },
 * }} WorkerSlot
 */

/**
 * @typedef {{
 *   maxWorkers: number,
 *   maxWorkersPerProject: number,
 *   slots: WorkerSlot[],
 *   rrCursor: number,
 *   projectBusyCounts: Map<string, number>,
 * }} WorkerPool
 */

/**
 * @param {{ maxWorkers: number, maxWorkersPerProject: number }} cfg
 */
function createWorkerPool(cfg) {
  /** @type {WorkerPool} */
  const pool = {
    maxWorkers: cfg.maxWorkers,

    maxWorkersPerProject: cfg.maxWorkersPerProject,

    slots: createInitialSlots(cfg.maxWorkers),

    rrCursor: 0,

    /** projectId -> workers ocupados neste processo */
    projectBusyCounts: new Map(),
  };

  return pool;
}

/**
 * @param {WorkerPool} pool
 * @param {string} projectId
 */
function projectBusyCount(pool, projectId) {
  const k = String(projectId || "");

  return pool.projectBusyCounts.get(k) || 0;
}

/**
 * @param {WorkerPool} pool
 * @param {string} projectId
 * @param {number} delta
 */
function bumpProjectBusy(pool, projectId, delta) {
  const k = String(projectId || "");

  const n = Math.max(0, (pool.projectBusyCounts.get(k) || 0) + delta);

  if (n <= 0) pool.projectBusyCounts.delete(k);

  else pool.projectBusyCounts.set(k, n);
}

/**
 * @param {WorkerPool} pool
 */
function firstIdleSlotIndex(pool) {
  for (let i = 0; i < pool.slots.length; i += 1) {
    const s = pool.slots[i];

    if (s && s.status === "idle") return i;
  }

  return -1;
}

/**
 * @param {WorkerPool} pool
 */
function busyCount(pool) {
  let n = 0;

  for (const s of pool.slots) {
    if (s && (s.status === "busy" || s.status === "stopping")) n += 1;
  }

  return n;
}

/**
 * @param {WorkerPool} pool
 * @param {string} jobId
 * @returns {{ slot: WorkerSlot, index: number } | null}
 */
function findSlotByJobId(pool, jobId) {
  const j = String(jobId || "");

  for (let i = 0; i < pool.slots.length; i += 1) {
    const s = pool.slots[i];

    if (s && s.jobId != null && String(s.jobId) === j) return { slot: s, index: i };
  }

  return null;
}

/**
 * @param {WorkerPool} pool
 * @param {number} slotIndex
 * @param {{ id: string, projectId?: string|null, projectRoot: string }} job
 */
function markSlotBusy(pool, slotIndex, job) {
  const s = pool.slots[slotIndex];

  if (!s) return;

  const now = new Date().toISOString();

  const pid =
    job.projectId != null && String(job.projectId).trim()
      ? String(job.projectId).trim()
      : deriveProjectId(String(job.projectRoot || ""));


  s.status = "busy";

  s.jobId = String(job.id);

  s.projectId = pid;

  s.projectRoot = String(job.projectRoot || "");

  s.startedAt = now;

  s.lastHeartbeatAt = now;

  bumpProjectBusy(pool, pid, 1);


}

/**
 * @param {WorkerPool} pool
 * @param {number} slotIndex
 */
function markSlotIdle(pool, slotIndex) {
  const s = pool.slots[slotIndex];

  if (!s) return;

  const pid = s.projectId;

  if (
    (s.status === "busy" || s.status === "stopping") &&
    pid
  )
    bumpProjectBusy(pool, String(pid), -1);


  s.status = "idle";

  s.jobId = null;

  s.projectId = null;

  s.projectRoot = null;

  s.startedAt = null;

  s.lastHeartbeatAt = null;

  s.workerCtl.child = null;

}

/**
 * @param {WorkerPool} pool
 * @param {number} slotIndex
 */
function touchSlotHeartbeat(pool, slotIndex) {
  const s = pool.slots[slotIndex];

  if (!s || s.status !== "busy") return;


  s.lastHeartbeatAt = new Date().toISOString();

}

/**
 * @param {WorkerPool} pool
 */
function markAllStopping(pool) {
  for (const s of pool.slots) {
    if (s.status === "busy") s.status = "stopping";
  }

}

/**
 * @param {WorkerPool} pool
 */
function getWorkersSummary(pool) {
  let busy = 0;

  let stopping = 0;

  for (const s of pool.slots) {
    if (s.status === "busy") busy += 1;

    if (s.status === "stopping") stopping += 1;

  }

  const idle = pool.slots.length - busy - stopping;

  return {
    total: pool.slots.length,

    busy,

    idle: Math.max(0, idle),

    stopping,

  };


}

/**
 * @param {WorkerPool} pool
 */
function listWorkersBrief(pool) {
  return pool.slots.map((s) => ({
    workerId: s.workerId,

    status: s.status,

    jobId: s.jobId,

    projectId: s.projectId,

    startedAt: s.startedAt,

    lastHeartbeatAt: s.lastHeartbeatAt,

  }));

}

/**
 * Primeiro job em execução no pool (para phased pipeline / status legacy).
 * @param {WorkerPool} pool
 */
function firstBusyJobId(pool) {
  for (const s of pool.slots) {
    if ((s.status === "busy" || s.status === "stopping") && s.jobId)
      return String(s.jobId);


  }

  return null;

}

module.exports = {
  parseWorkerPoolConfig,

  createWorkerPool,

  buildFairnessPendingOrder,

  projectBusyCount,

  bumpProjectBusy,

  firstIdleSlotIndex,

  busyCount,

  findSlotByJobId,

  markSlotBusy,

  markSlotIdle,

  touchSlotHeartbeat,

  markAllStopping,

  getWorkersSummary,

  listWorkersBrief,

  createInitialSlots,

  firstBusyJobId,

};
