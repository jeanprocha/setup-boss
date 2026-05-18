const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getDaemonDirs } = require("./daemon-paths");
const { isPidAlive } = require("./pid-file");
const { emitRuntimeEvent } = require("./runtime-events");
const {
  canonicalProjectRoot,
  deriveProjectId,
  upsertProjectFromUsage,
} = require("./project-registry");

const SCHEMA_VERSION = 1;

/**
 * Mutex de fila (.setup-boss/daemon/queue.lock) + rename atómico ao gravar queue.json.
 */

const DEFAULT_QUEUE_LOCK_TIMEOUT_MS = Number(
  process.env.SETUP_BOSS_QUEUE_LOCK_TIMEOUT_MS || 12000,

);

const QUEUE_LOCK_STALE_MS = Number(process.env.SETUP_BOSS_QUEUE_LOCK_STALE_MS || 90000);

const QUEUE_LOCK_POLL_MS = Number(process.env.SETUP_BOSS_QUEUE_LOCK_POLL_MS || 30);

const DEFAULT_MAX_ATTEMPTS = Number.parseInt(
  String(process.env.SETUP_BOSS_DEFAULT_MAX_ATTEMPTS || "3"),
  10,

) || 3;

const STUCK_JOB_MS = Number(process.env.SETUP_BOSS_STUCK_JOB_MS || 900000);

const MIN_RECURRING_INTERVAL_MS = Math.max(
  1000,
  Number(process.env.SETUP_BOSS_MIN_RECURRING_INTERVAL_MS || 1000),
);


/** @typedef {{ type: string, timestamp: string, [key: string]: unknown }} QueueEvent */


/** @typedef {{ intervalMs: number, originJobId?: string|null }} RecurringSpec */


/** @typedef {{ id: string, status: string, projectRoot: string, projectId?: string|null, taskArg: string, projectArg: string, createdAt: string, startedAt: string|null, finishedAt: string|null, attempts: number, maxAttempts: number, runId: string|null, error: object|null, recovery_reason?: string|null, flowOptions?: object, metadata?: object, cancel_requested?: boolean, cancellationRequestedAt?: string|null, cancellation_reason?: string|null, events?: QueueEvent[], lastAttemptAt?: string|null, retryable?: boolean, heartbeatAt?: string|null, lastProgressAt?: string|null, workerChildPid?: number|null, stuckSuspected?: boolean, scheduledAt?: string|null, availableAt?: string|null, delayMs?: number|null, recurring?: RecurringSpec|null, availabilityNotifiedAt?: string|null, assignedWorkerId?: string|null }} Job */


/** @typedef {{ schemaVersion: number, jobs: Job[] }} QueuePayload */


function defaultQueuePayload() {
  return { schemaVersion: SCHEMA_VERSION, jobs: [] };

}

/** @param {string|null|undefined} iso */
function parseIsoMs(iso) {
  if (iso == null || typeof iso !== "string" || !iso.trim()) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * @param {number} nowMs
 * @param {{ delayMs?: number|null, scheduledAt?: string|null }} opts
 * @returns {{ scheduledAt: string|null, availableAt: string, delayMs: number|null }}
 */
function resolveScheduleTimes(nowMs, opts = {}) {
  const delayRaw =
    opts.delayMs != null && Number.isFinite(Number(opts.delayMs))
      ? Math.max(0, Math.floor(Number(opts.delayMs)))
      : null;

  const schedRaw =
    opts.scheduledAt != null && String(opts.scheduledAt).trim()
      ? String(opts.scheduledAt).trim()
      : null;

  const schedMs = schedRaw ? parseIsoMs(schedRaw) : NaN;

  if (delayRaw != null && delayRaw > 0 && schedRaw) {
    const err = new Error("Use apenas delayMs ou scheduledAt, não ambos.");
    /** @type {any} */ (err).code = "invalid_schedule_conflict";
    throw err;
  }

  if (delayRaw != null && delayRaw > 0) {
    const availableMs = nowMs + delayRaw;
    return {
      scheduledAt: new Date(nowMs).toISOString(),
      availableAt: new Date(availableMs).toISOString(),
      delayMs: delayRaw,
    };
  }

  if (schedRaw && Number.isFinite(schedMs)) {
    return {
      scheduledAt: schedRaw,
      availableAt: new Date(Math.max(nowMs, schedMs)).toISOString(),
      delayMs: null,
    };
  }

  if (schedRaw && !Number.isFinite(schedMs)) {
    const err = new Error("scheduledAt inválido (ISO-8601 esperado).");
    /** @type {any} */ (err).code = "invalid_scheduled_at";
    throw err;
  }

  return {
    scheduledAt: null,
    availableAt: new Date(nowMs).toISOString(),
    delayMs: null,
  };
}

/** @param {unknown} rec */
function normalizeRecurringSpec(rec) {
  if (rec == null) return null;
  if (typeof rec !== "object" || Array.isArray(rec)) {
    const err = new Error("recurring deve ser um objeto { intervalMs }.");
    /** @type {any} */ (err).code = "invalid_recurring";
    throw err;
  }

  /** @type {any} */
  const r = rec;

  const iv = Number(r.intervalMs);
  if (!Number.isFinite(iv) || iv < MIN_RECURRING_INTERVAL_MS) {
    const err = new Error(
      `recurring.intervalMs deve ser >= ${MIN_RECURRING_INTERVAL_MS} ms.`,
    );
    /** @type {any} */ (err).code = "invalid_recurring_interval";
    throw err;
  }

  return {
    intervalMs: Math.floor(iv),
    originJobId:
      r.originJobId != null && String(r.originJobId).trim()
        ? String(r.originJobId).trim()
        : null,
  };
}

/** @param {Job} j @param {number} [nowMs] */
function jobAvailableAtMs(j, nowMs = Date.now()) {
  void nowMs;
  if (j.availableAt == null || typeof j.availableAt !== "string" || !j.availableAt.trim())
    return 0;
  const t = parseIsoMs(j.availableAt);
  return Number.isFinite(t) ? t : 0;
}

/** @param {Job} j @param {number} [nowMs] */
function jobIsAvailable(j, nowMs = Date.now()) {
  return jobAvailableAtMs(j) <= nowMs;
}

/** @param {Job} j */
function jobIsDelayedPending(j) {
  return (
    String(j.status || "") === "pending" &&
    j.availableAt != null &&
    typeof j.availableAt === "string" &&
    parseIsoMs(j.availableAt) > Date.now()
  );
}

/** @param {Job} j */
function jobHasRecurring(j) {
  return Boolean(
    j.recurring &&
      typeof j.recurring === "object" &&
      Number.isFinite(/** @type {any} */ (j.recurring).intervalMs),
  );
}

function sleepSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);

    const ia = new Int32Array(sab);


    Atomics.wait(ia, 0, 0, Math.max(0, Math.floor(ms)));

  } catch (_) {
    /* SharedArrayBuffer indisponível em alguns ambientes — noop */

  }

}

function readQueueLockRaw(lockPath) {
  try {
    if (!fs.existsSync(lockPath)) return null;

    return JSON.parse(fs.readFileSync(lockPath, "utf-8"));

  } catch (_) {
    return null;

  }

}

function queueLockIsStale(payload) {
  if (!payload || typeof payload !== "object") return true;

  const pid = Number(payload.pid);

  const acquiredAt =
    typeof payload.acquiredAt === "string" ? payload.acquiredAt : null;

  if (Number.isFinite(pid) && isPidAlive(pid)) return false;

  if (
    acquiredAt != null &&
    Number.isFinite(Date.parse(acquiredAt)) &&
    Date.now() - Date.parse(acquiredAt) > QUEUE_LOCK_STALE_MS
  )


    return true;


  /** PID morto ⇒ lock recuperável mesmo antes do stale temporal */

  if (!Number.isFinite(pid) || !isPidAlive(pid)) return true;

  return false;

}

/** @returns {boolean} */


function tryCreateQueueLock(lockPath) {
  const body = `${JSON.stringify(
    {

      pid: process.pid,

      acquiredAt: new Date().toISOString(),


    },

    null,

    0,

  )}\n`;

  let fd;


  try {
    fd = fs.openSync(lockPath, "wx");

    try {
      fs.writeFileSync(fd, body, "utf-8");


    } finally {
      fs.closeSync(fd);


    }


    return true;

  } catch (e) {
    if (e && (e.code === "EEXIST" || e.code === "EBUSY")) return false;

    throw e;

  }

}

function releaseQueueLock(lockPath) {
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);

  } catch (_) {
    /* */

  }

}

/**
 * Execução exclusiva curta contra queue.json — não atravessa await.
 * @template T
 * @param {() => T} fn
 */


function withQueueExclusiveSync(fn) {


  const { queueLockPath } = getDaemonDirs();


  fs.mkdirSync(path.dirname(queueLockPath), { recursive: true });


  const deadline = Date.now() + DEFAULT_QUEUE_LOCK_TIMEOUT_MS;


  while (Date.now() < deadline) {


    const existingPayload = readQueueLockRaw(queueLockPath);


    if (
      fs.existsSync(queueLockPath) &&


      !queueLockIsStale(existingPayload)
    )


    {


      sleepSync(QUEUE_LOCK_POLL_MS);


      continue;


    }


    try {
      if (fs.existsSync(queueLockPath) && queueLockIsStale(existingPayload))
        fs.unlinkSync(queueLockPath);

    } catch (_) {
      /* */

    }


    if (tryCreateQueueLock(queueLockPath)) {
      try {
        return fn();

      } finally {
        releaseQueueLock(queueLockPath);

      }


    }



    sleepSync(QUEUE_LOCK_POLL_MS);


  }



  throw Object.assign(new Error("queue_lock_timeout"), { code: "queue_lock_timeout" });

}

/** @returns {Job} */


function normalizeJobShape(j) {


  if (!j || typeof j !== "object") return j;



  if (!Array.isArray(j.events)) j.events = [];



  if (typeof j.attempts !== "number" || !Number.isFinite(j.attempts) || j.attempts < 0)


    j.attempts = 0;



  if (


    typeof j.maxAttempts !== "number" ||


    !Number.isFinite(j.maxAttempts) ||


    j.maxAttempts < 1


  )


    j.maxAttempts = DEFAULT_MAX_ATTEMPTS;



  if (j.lastAttemptAt != null && typeof j.lastAttemptAt !== "string") j.lastAttemptAt = null;

  if (j.heartbeatAt != null && typeof j.heartbeatAt !== "string") j.heartbeatAt = null;

  if (j.lastProgressAt != null && typeof j.lastProgressAt !== "string") j.lastProgressAt = null;

  if (
    j.workerChildPid != null &&
    (typeof j.workerChildPid !== "number" || !Number.isFinite(j.workerChildPid))
  )


    j.workerChildPid = null;

  if (typeof j.stuckSuspected !== "boolean") j.stuckSuspected = false;

  if (j.assignedWorkerId != null && typeof j.assignedWorkerId !== "string")
    j.assignedWorkerId = null;

  if (j.scheduledAt != null && typeof j.scheduledAt !== "string") j.scheduledAt = null;

  if (j.availableAt != null && typeof j.availableAt !== "string") j.availableAt = null;

  if (j.delayMs != null && (typeof j.delayMs !== "number" || !Number.isFinite(j.delayMs)))
    j.delayMs = null;

  if (j.recurring != null) {
    if (typeof j.recurring !== "object" || Array.isArray(j.recurring)) {
      j.recurring = null;
    } else {
      const iv = Number(/** @type {any} */ (j.recurring).intervalMs);
      if (!Number.isFinite(iv) || iv < MIN_RECURRING_INTERVAL_MS) j.recurring = null;
    }
  }

  if (j.availabilityNotifiedAt != null && typeof j.availabilityNotifiedAt !== "string")
    j.availabilityNotifiedAt = null;

  if (typeof j.projectRoot === "string" && String(j.projectRoot).trim()) {
    j.projectRoot = canonicalProjectRoot(j.projectRoot);
  }


  if (typeof j.projectRoot === "string" && j.projectRoot) {
    if (
      j.projectId == null ||
      typeof j.projectId !== "string" ||
      !String(j.projectId).trim()
    )

      j.projectId = deriveProjectId(j.projectRoot);

    else j.projectId = String(j.projectId).trim();

  } else if (j.projectId != null && typeof j.projectId !== "string") {
    j.projectId = null;

  }



  if (typeof j.retryable !== "boolean") j.retryable = jobIsRetryable(j);

  return j;



}

/** @param {Job} j */


function jobIsRetryable(j) {


  const st = String(j.status || "");



  if (st === "running" || st === "cancelling" || st === "pending") return false;

  if (!["failed", "cancelled", "blocked"].includes(st)) return false;

  if (j.retryable === false) return false;

  const att = Number(j.attempts) || 0;

  const max = Number(j.maxAttempts) || DEFAULT_MAX_ATTEMPTS;

  return att < max;

}

/** @param {Job} job @param {string} type @param {object} [extra] */


function appendJobEvent(job, type, extra = {}) {


  const ev = {


    type,


    timestamp: new Date().toISOString(),


    ...(extra && typeof extra === "object" ? extra : {}),


  };

  /** @type {QueueEvent[]} */

  const evs = Array.isArray(job.events) ? [...job.events] : [];


  evs.push(ev);


  return evs;

}

/** @returns {void} */


function atomicWriteQueueJson(queue) {


  atomicWriteJson(getDaemonDirs().queuePath, queue);

}

/** @returns {QueuePayload} */


function loadQueueUnsafeInner() {


  const { queuePath } = getDaemonDirs();


  if (!fs.existsSync(queuePath)) return defaultQueuePayload();


  try {
    const raw = fs.readFileSync(queuePath, "utf-8");

    /** @type {QueuePayload} */

    const parsed = JSON.parse(raw);


    if (!parsed.jobs || !Array.isArray(parsed.jobs))
      throw new Error("queue.json inválido");


    parsed.schemaVersion = SCHEMA_VERSION;


    parsed.jobs = parsed.jobs.map((j) => normalizeJobShape({ ...j }));


    return parsed;

  } catch (_) {
    return defaultQueuePayload();


  }


}

/** @returns {void} */


function atomicWriteJson(absPath, data) {


  const dir = path.dirname(absPath);


  fs.mkdirSync(dir, { recursive: true });


  const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;


  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");


  fs.renameSync(tmp, absPath);

}

/** Reads outside the mutex remain valid (rename swaps file atomically). */


function loadQueueUnsafe() {
  return loadQueueUnsafeInner();


}

/** @param {QueuePayload} queue */


function saveQueue(queue) {


  atomicWriteQueueJson(queue);

}

/** @returns {object} */


function countsByStatus(queue) {
  /** @type {Record<string, number>} */

  const c = {};



  for (const j of queue.jobs) {
    const s = String(j.status || "");



    c[s] = (c[s] || 0) + 1;

  }



  return c;

}


function makeJobId() {


  const s = crypto.randomBytes(6).toString("hex");



  return `job_${Date.now().toString(36)}_${s}`;


}

/**
 *
 * Coloca novo job pendente na fila.
 *
 * @param {{
 *   projectRoot: string,
 *   taskArg: string,
 *   projectArg: string,
 *   metadata?: object,
 *   flowOptions?: object,
 *   delayMs?: number|null,
 *   scheduledAt?: string|null,
 *   recurring?: RecurringSpec|null,
 * }} opts
 * @returns {Job}
 */
function enqueueJob({
  projectRoot,
  taskArg,
  projectArg,
  metadata,
  flowOptions,
  delayMs,
  scheduledAt,
  recurring,
}) {


  return withQueueExclusiveSync(() => {


    const queue = loadQueueUnsafeInner();


    const nowMs = Date.now();


    /** @type {{ scheduledAt: string|null, availableAt: string, delayMs: number|null }} */

    let schedule;

    try {
      schedule = resolveScheduleTimes(nowMs, { delayMs, scheduledAt });


    } catch (e) {
      throw e;


    }

    /** @type {RecurringSpec|null} */

    let rec = null;


    try {
      rec = normalizeRecurringSpec(recurring);


    } catch (e) {
      throw e;


    }


    const canonRoot = canonicalProjectRoot(projectRoot);

    /** @type {Job} */

    const base = {


      id: makeJobId(),


      status: "pending",

      projectRoot: canonRoot,

      projectId: deriveProjectId(canonRoot),

      taskArg: String(taskArg),

      projectArg: String(projectArg),

      createdAt: new Date().toISOString(),

      startedAt: null,

      finishedAt: null,

      attempts: 0,

      maxAttempts: DEFAULT_MAX_ATTEMPTS,

      runId: null,

      error: null,

      lastAttemptAt: null,

      retryable: true,

      heartbeatAt: null,

      lastProgressAt: null,

      workerChildPid: null,

      stuckSuspected: false,

      scheduledAt: schedule.scheduledAt,

      availableAt: schedule.availableAt,

      delayMs: schedule.delayMs,

      recurring: rec,

      availabilityNotifiedAt: null,

      metadata:


        metadata && typeof metadata === "object" ? { ...metadata } : {},

      flowOptions:


        flowOptions && typeof flowOptions === "object" ? { ...flowOptions } : {},

      events: [],


    };

    base.events = appendJobEvent(base, "enqueued");


    const availMs = parseIsoMs(schedule.availableAt);


    const isFuture = Number.isFinite(availMs) && availMs > nowMs;


    if (isFuture) {
      base.events = appendJobEvent(
        { ...base, events: base.events },
        "scheduled",
        { availableAt: schedule.availableAt },
      );


    }

    if (base.recurring) {
      base.recurring = {
        ...base.recurring,
        originJobId: base.id,
      };


    }

    if (!isFuture)
      base.availabilityNotifiedAt = new Date().toISOString();


    queue.jobs.push(base);


    saveQueue(queue);


    try {

      upsertProjectFromUsage({
        projectId: String(base.projectId || ""),
        projectRoot: base.projectRoot,
        lastJobId: base.id,
        metadata: {},
      });

    } catch (_) {
      /* */

    }


    try {

      emitRuntimeEvent({
        type: "job_enqueued",

        jobId: base.id,

        runId: null,

        projectId: base.projectId ?? null,

        projectRoot: base.projectRoot,

        data: {
          taskArg: base.taskArg,

          projectArg: base.projectArg,

          availableAt: base.availableAt,

          recurring: base.recurring,

          projectId: base.projectId ?? null,

          projectRoot: base.projectRoot,

        },


      });


      if (base.recurring) {
        emitRuntimeEvent({
          type: "recurring_job_created",

          jobId: base.id,

          runId: null,

          projectId: base.projectId ?? null,

          projectRoot: base.projectRoot,

          data: {
            intervalMs: base.recurring.intervalMs,

            originJobId: base.recurring.originJobId,

            projectId: base.projectId ?? null,

            projectRoot: base.projectRoot,

          },

        });


      }


      if (isFuture) {
        emitRuntimeEvent({
          type: "job_scheduled",

          jobId: base.id,

          runId: null,

          projectId: base.projectId ?? null,

          projectRoot: base.projectRoot,

          data: {
            availableAt: schedule.availableAt,

            delayMs: schedule.delayMs,

            projectId: base.projectId ?? null,

            projectRoot: base.projectRoot,

          },

        });


        if (schedule.delayMs != null && schedule.delayMs > 0) {
          emitRuntimeEvent({
            type: "job_delayed",

            jobId: base.id,

            runId: null,

            projectId: base.projectId ?? null,

            projectRoot: base.projectRoot,

            data: {
              delayMs: schedule.delayMs,

              availableAt: schedule.availableAt,

              projectId: base.projectId ?? null,

              projectRoot: base.projectRoot,

            },

          });


        }

        try {
          if (base.recurring && base.recurring.intervalMs) {
            emitRuntimeEvent({
              type: "recurring_job_scheduled",

              jobId: base.id,

              runId: null,

              projectId: base.projectId ?? null,

              projectRoot: base.projectRoot,

              data: {
                intervalMs: base.recurring.intervalMs,

                availableAt: schedule.availableAt,

                projectId: base.projectId ?? null,

                projectRoot: base.projectRoot,

              },

            });


          }

        } catch (_) {
          /* */

        }

      }

    } catch (_) {
      /* */

    }



    return normalizeJobShape(base);


  });


}

/**


 * queue legado pode ser omitido — recarrega sempre dentro do mutex.


 */


function updateJob(queueIgnored, jobId, mutator) {


  return withQueueExclusiveSync(() => {


    const queue = loadQueueUnsafeInner();


    let found = null;



    for (let i = 0; i < queue.jobs.length; i += 1) {


      const j = queue.jobs[i];



      if (j.id === jobId) {
        normalizeJobShape(j);



        const next =


          typeof mutator === "function" ? mutator({ ...j }) : { ...j, ...mutator };



        normalizeJobShape(next);



        queue.jobs[i] = next;



        found = next;



        break;

      }


    }



    if (!found) return null;



    saveQueue(queue);



    return found;

  });


}

/**
 * Remove job da fila por id de job ou runId. Recusa job activo (running/cancelling).
 * @param {string} key
 * @returns {{ ok: true, job: Job } | { ok: false, code: string, message: string }}
 */
function removeJobFromQueueByKey(key) {
  const k = String(key || "").trim();
  if (!k) {
    return { ok: false, code: "invalid_key", message: "Identificador vazio." };
  }

  return withQueueExclusiveSync(() => {
    const queue = loadQueueUnsafeInner();

    let idx = queue.jobs.findIndex((j) => j && String(j.id) === k);

    if (idx < 0) {
      idx = queue.jobs.findIndex(
        (j) => j && j.runId != null && String(j.runId) === k,
      );
    }

    if (idx < 0) {
      return {
        ok: false,
        code: "not_found",
        message: "Job ou corrida não encontrados na fila.",
      };
    }

    const job = queue.jobs[idx];

    const st = String(job.status || "");

    if (st === "running" || st === "cancelling") {
      return {
        ok: false,
        code: "job_active",
        message:
          "Não é possível excluir enquanto o job está em execução ou a ser cancelado. Aguarde ou cancele primeiro.",
      };
    }

    const removed = job;

    queue.jobs.splice(idx, 1);

    saveQueue(queue);

    return { ok: true, job: removed };
  });
}

/**
 * Remove todos os jobs de um projectId. Recusa se existir running/cancelling.
 * @param {string} projectIdNorm
 * @returns {{ ok: true, removed: number } | { ok: false, code: string, message: string }}
 */
function purgeJobsForProjectId(projectIdNorm) {
  const pid =
    projectIdNorm != null ? String(projectIdNorm).trim() : "";
  if (!pid)
    return {
      ok: false,
      code: "invalid_request",
      message: "projectId vazio.",
    };

  return withQueueExclusiveSync(() => {
    const queue = loadQueueUnsafeInner();

    const jobProjectId = (j) => {
      if (!j || typeof j !== "object") return "";
      if (j.projectId != null && String(j.projectId).trim())
        return String(j.projectId).trim();
      if (typeof j.projectRoot === "string" && String(j.projectRoot).trim())
        return deriveProjectId(j.projectRoot);
      return "";
    };

    for (const j of queue.jobs) {
      if (!j) continue;
      if (jobProjectId(j) !== pid) continue;
      const st = String(j.status || "").trim();
      if (st === "running" || st === "cancelling") {
        return {
          ok: false,
          code: "project_has_active_jobs",
          message:
            "Existem atividades em execução neste projecto. Aguarde ou cancele antes de eliminar o projecto.",
        };
      }
    }

    const before = queue.jobs.length;
    queue.jobs = queue.jobs.filter((j) => jobProjectId(j) !== pid);
    const removed = before - queue.jobs.length;
    saveQueue(queue);
    return { ok: true, removed };
  });
}

function listSorted(queue) {


  return [...queue.jobs].sort(


    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),


  );


}

/** @returns {{ ok: boolean, error?: string, jobCount?: number, empty?: boolean }} */


function validateQueueStrict() {


  const { queuePath } = getDaemonDirs();


  if (!fs.existsSync(queuePath))


    return { ok: true, jobCount: 0, empty: true };


  try {


    const raw = fs.readFileSync(queuePath, "utf-8");


    const parsed = JSON.parse(raw);


    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.jobs))


      return { ok: false, error: "queue.json: estrutura inválida (jobs)." };


    return { ok: true, jobCount: parsed.jobs.length };


  } catch (e) {


    return { ok: false, error: String((e && e.message) || e) };


  }


}

/** @param {Job} j @returns {boolean} */


function jobRecordLooksStuck(j, nowMs = Date.now()) {


  const st = String(j.status || "");


  if (st !== "running" && st !== "cancelling") return false;


  const hb = j.heartbeatAt && Date.parse(j.heartbeatAt);


  const started = j.startedAt && Date.parse(j.startedAt);


  const ref = Number.isFinite(hb) ? hb : started;


  if (!Number.isFinite(ref)) return false;


  return nowMs - ref > STUCK_JOB_MS;

}

/** @param {QueuePayload} [queue] @returns {string[]} */


function listSuspectStuckJobIds(queue) {


  const snap = queue || loadQueueUnsafe();


  /** @type {string[]} */


  const out = [];


  for (const j of snap.jobs) {


    normalizeJobShape(j);


    if (jobRecordLooksStuck(j)) out.push(String(j.id));


  }


  return out;

}

/** @param {QueuePayload} [queue] */


function countRetryableJobs(queue) {


  const snap = queue || loadQueueUnsafe();


  let n = 0;


  for (const j of snap.jobs) {


    if (jobIsRetryable(normalizeJobShape({ ...j }))) n += 1;


  }


  return n;

}

/** @returns {{ ok: true, job: Job } | { ok: false, code: string, job?: Job, reason?: string }} */


function requestJobRetry(jobId, opts = {}) {


  return withQueueExclusiveSync(() => {


    const queue = loadQueueUnsafeInner();


    const idx = queue.jobs.findIndex((x) => x.id === jobId);


    if (idx < 0) return { ok: false, code: "not_found" };


    const cur = normalizeJobShape({ ...queue.jobs[idx] });


    if (!jobIsRetryable(cur)) {


      return {


        ok: false,


        code: "not_retryable",


        job: cur,


        reason: "state_or_attempts",


      };


    }


    const nowMs = Date.now();

    const nowIso = new Date(nowMs).toISOString();

    const delayRaw =
      opts.delayMs != null && Number.isFinite(Number(opts.delayMs))
        ? Math.max(0, Math.floor(Number(opts.delayMs)))
        : 0;

    const availableIso = new Date(nowMs + delayRaw).toISOString();

    let evs = appendJobEvent(cur, "retry_requeued", {

      previousStatus: cur.status,

      delayMs: delayRaw > 0 ? delayRaw : null,

    });

    if (delayRaw > 0) {
      evs = appendJobEvent(
        { ...cur, events: evs },
        "retry_delayed",

        { delayMs: delayRaw, availableAt: availableIso },

      );


    }

    const next = {


      ...cur,


      status: "pending",


      startedAt: null,


      finishedAt: null,


      runId: null,


      error: null,


      recovery_reason: null,


      cancel_requested: false,


      cancellationRequestedAt: null,


      cancellation_reason: null,


      workerChildPid: null,


      heartbeatAt: null,


      lastProgressAt: null,


      stuckSuspected: false,


      lastAttemptAt: nowIso,


      scheduledAt: delayRaw > 0 ? nowIso : null,


      availableAt: availableIso,


      delayMs: delayRaw > 0 ? delayRaw : null,


      availabilityNotifiedAt: delayRaw > 0 ? null : nowIso,

      events: evs,


    };


    normalizeJobShape(next);


    queue.jobs[idx] = next;


    saveQueue(queue);


    try {

      emitRuntimeEvent({
        type: "retry_scheduled",

        jobId: cur.id,

        runId: null,

        projectId: next.projectId ?? null,

        projectRoot: next.projectRoot,

        data: {
          delayMs: delayRaw,

          availableAt: availableIso,

          projectId: next.projectId ?? null,

          projectRoot: next.projectRoot,

        },

      });

      if (delayRaw === 0) {
        emitRuntimeEvent({
          type: "retry_available",

          jobId: cur.id,

          runId: null,

          projectId: next.projectId ?? null,

          projectRoot: next.projectRoot,

          data: {
            immediate: true,

            projectId: next.projectId ?? null,

            projectRoot: next.projectRoot,

          },

        });

      }

    } catch (_) {
      /* */

    }


    return { ok: true, job: next };


  });

}

/**
 * Remove jobs terminais antigos (nunca pending/running/cancelling).
 * @param {{ maxAgeMs?: number, minKeep?: number, dryRun?: boolean }} opts
 */


function pruneQueueTerminalJobs(opts = {}) {


  const maxAgeMs =


    typeof opts.maxAgeMs === "number" &&


    Number.isFinite(opts.maxAgeMs) &&


    opts.maxAgeMs > 0


      ? opts.maxAgeMs


      : Number(process.env.SETUP_BOSS_QUEUE_PRUNE_MAX_AGE_MS || 1209600000);


  const minKeep =


    typeof opts.minKeep === "number" &&


    Number.isFinite(opts.minKeep) &&


    opts.minKeep >= 0


      ? Math.floor(opts.minKeep)


      : Number(process.env.SETUP_BOSS_QUEUE_PRUNE_MIN_KEEP || 50);


  const dryRun = opts.dryRun === true;


  const terminal = new Set([


    "completed",


    "failed",


    "cancelled",


    "blocked",


    "failed_cancel",


  ]);


  return withQueueExclusiveSync(() => {


    const queue = loadQueueUnsafeInner();


    const now = Date.now();


    const sorted = [...queue.jobs].sort(


      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),


    );


    const removableIds = new Set();


    for (const j of sorted) {


      if (!terminal.has(String(j.status || ""))) continue;


      const fin = j.finishedAt && Date.parse(j.finishedAt);


      if (!Number.isFinite(fin)) continue;


      if (now - fin <= maxAgeMs) continue;


      removableIds.add(j.id);


    }


    let keptTerminal = 0;


    for (let i = sorted.length - 1; i >= 0; i -= 1) {


      const j = sorted[i];


      if (!terminal.has(String(j.status || ""))) continue;


      keptTerminal += 1;


      if (keptTerminal <= minKeep && removableIds.has(j.id)) removableIds.delete(j.id);


    }


    const before = queue.jobs.length;


    if (dryRun)


      return {


        removed: removableIds.size,


        kept: before - removableIds.size,


        dryRun: true,


      };


    queue.jobs = queue.jobs.filter((j) => !removableIds.has(j.id));


    const removed = before - queue.jobs.length;


    if (removed) saveQueue(queue);


    return { removed, kept: queue.jobs.length, dryRun: false };


  });

}

/** Heartbeat do job em execução (daemon). */


function touchJobHeartbeat(jobId) {


  return updateJob(undefined, jobId, (j) => {


    const st = String(j.status || "");


    if (st !== "running" && st !== "cancelling") return j;


    const iso = new Date().toISOString();


    return { ...j, heartbeatAt: iso, stuckSuspected: false };


  });

}

/** Progresso de pipeline (filho / ponte de eventos). */


function touchJobProgress(jobId) {


  return updateJob(undefined, jobId, (j) => {


    const st = String(j.status || "");


    if (st !== "running" && st !== "cancelling") return j;


    const iso = new Date().toISOString();


    return {


      ...j,


      lastProgressAt: iso,


      heartbeatAt: j.heartbeatAt || iso,


    };


  });

}

/** Running jobs interrompidos por restart do daemon; cancelling órfão → cancelled. */


function recoverOrphanRunningJobs(queueIgnored) {


  return withQueueExclusiveSync(() => {


    const queue = loadQueueUnsafeInner();


    const nowIso = new Date().toISOString();


    let runningFinalized = 0;


    let cancellingFinalized = 0;


    const nextJobs = queue.jobs.map((j) => {


      if (j.status === "running") {


        normalizeJobShape(j);


        runningFinalized += 1;


        const deadPid =


          typeof j.workerChildPid === "number" &&


          Number.isFinite(j.workerChildPid) &&


          !isPidAlive(j.workerChildPid);


        /** @type {Job} */


        const next = {


          ...j,


          status: "failed",


          finishedAt: nowIso,


          cancel_requested: false,


          cancellationRequestedAt: null,


          workerChildPid: null,


          error: {


            code: deadPid ? "worker_pid_dead" : "daemon_restarted_while_running",


            message: deadPid


              ? "PID do worker já não existe; job marcado como falhado na recuperação."


              : "O daemon anterior terminou durante a execução deste job; execução não retomada automaticamente nesta fase.",


          },


          recovery_reason: deadPid ? "worker_pid_dead" : "daemon_restarted_while_running",


        };


        next.events = appendJobEvent(next, "failed", {


          reason: next.recovery_reason,


        });


        normalizeJobShape(next);


        return next;


      }


      if (j.status === "cancelling") {


        normalizeJobShape(j);


        cancellingFinalized += 1;


        const reason =


          typeof j.cancellation_reason === "string" && j.cancellation_reason.trim()


            ? j.cancellation_reason.trim()


            : "Cancelamento finalizado na recuperação do daemon.";


        /** @type {Job} */


        const next = {


          ...j,


          status: "cancelled",


          finishedAt: nowIso,


          cancel_requested: false,


          workerChildPid: null,


          error: { code: "job_cancelled", message: reason },


          recovery_reason: "daemon_restart_cancelling_finalized",


        };


        next.events = appendJobEvent(next, "cancelled", {


          reason: "daemon_startup_recovery",


        });


        normalizeJobShape(next);


        return next;


      }


      return j;


    });


    queue.jobs = nextJobs;


    if (runningFinalized || cancellingFinalized) saveQueue(queue);


    return { runningFinalized, cancellingFinalized };


  });


}

/**
 * Persiste projectId canónico em jobs legados (uma vez, sob mutex de fila).
 * @returns {{ migrated: boolean }}
 */
function migrateQueuePersistProjectIdsIfNeeded() {
  const { queuePath } = getDaemonDirs();

  if (!fs.existsSync(queuePath)) return { migrated: false };

  /** @type {unknown} */

  let rawJobs = null;

  try {
    const raw = fs.readFileSync(queuePath, "utf-8");

    const parsed = JSON.parse(raw);

    rawJobs = parsed && parsed.jobs;
  } catch (_) {
    return { migrated: false };
  }

  if (!Array.isArray(rawJobs)) return { migrated: false };

  const needs = rawJobs.some(
    (j) =>
      j &&

      typeof j.projectRoot === "string" &&

      String(j.projectRoot).trim() &&

      (!j.projectId || !String(j.projectId).trim()),
  );

  if (!needs) return { migrated: false };

  return withQueueExclusiveSync(() => {
    const queue = loadQueueUnsafeInner();

    saveQueue(queue);


    try {
      const seen = new Set();

      for (const j of queue.jobs) {
        if (!j || !j.projectId || !j.projectRoot) continue;

        const k = String(j.projectId);

        if (seen.has(k)) continue;

        seen.add(k);

        upsertProjectFromUsage({
          projectId: k,

          projectRoot: j.projectRoot,

          lastJobId: j.id,

          metadata: {},
        });
      }

    } catch (_) {
      /* */

    }


    return { migrated: true };
  });

}

module.exports = {
  loadQueueUnsafe,

  saveQueue,

  enqueueJob,

  updateJob,

  removeJobFromQueueByKey,

  listSorted,

  countsByStatus,

  recoverOrphanRunningJobs,

  migrateQueuePersistProjectIdsIfNeeded,

  withQueueExclusiveSync,

  purgeJobsForProjectId,

  appendJobEvent,

  validateQueueStrict,

  requestJobRetry,

  pruneQueueTerminalJobs,

  listSuspectStuckJobIds,

  countRetryableJobs,

  touchJobHeartbeat,

  touchJobProgress,

  jobIsRetryable,

  jobRecordLooksStuck,

  DEFAULT_MAX_ATTEMPTS,

  STUCK_JOB_MS,

  MIN_RECURRING_INTERVAL_MS,

  jobIsAvailable,

  jobAvailableAtMs,

  jobIsDelayedPending,

  jobHasRecurring,

  normalizeRecurringSpec,

  resolveScheduleTimes,

  parseIsoMs,

};

