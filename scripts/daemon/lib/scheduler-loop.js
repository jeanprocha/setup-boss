"use strict";

const {
  loadQueueUnsafe,
  updateJob,
  appendJobEvent,
  jobIsAvailable,
  pruneQueueTerminalJobs,
  validateQueueStrict,
  listSuspectStuckJobIds,
  parseIsoMs,
} = require("./queue-store");

const { emitRuntimeEvent } = require("./runtime-events");

const POLL_MS = Math.max(
  200,
  Number(process.env.SETUP_BOSS_SCHEDULER_POLL_MS || 1500),
);

const AUTO_PRUNE = process.env.SETUP_BOSS_AUTO_PRUNE_ENABLED === "1";

const AUTO_DOCTOR_LIGHT = process.env.SETUP_BOSS_AUTO_DOCTOR_ENABLED === "1";

/**
 * Marca jobs pendentes que acabaram de ficar disponíveis e emite eventos.
 * @returns {{ availabilityActivations: number, tickEmitted: boolean, maintenance?: object }}
 */
function runSchedulerTickInternal() {
  const nowMs = Date.now();

  let availabilityActivations = 0;

  const snap = loadQueueUnsafe();

  for (const j of snap.jobs) {
    if (String(j.status || "") !== "pending") continue;

    if (!jobIsAvailable(j, nowMs)) continue;

    if (j.availabilityNotifiedAt != null && String(j.availabilityNotifiedAt).trim())
      continue;

    if (j.availableAt == null || typeof j.availableAt !== "string") continue;

    updateJob(undefined, j.id, (row) => {
      const evs = appendJobEvent(
        { ...row, events: row.events },
        "available",
        { availableAt: row.availableAt },
      );

      return {
        ...row,

        events: evs,

        availabilityNotifiedAt: new Date().toISOString(),
      };
    });

    availabilityActivations += 1;

    try {
      emitRuntimeEvent({
        type: "job_available",

        jobId: j.id,

        runId: null,

        projectId: j.projectId ?? null,

        projectRoot: j.projectRoot,

        data: {
          availableAt: j.availableAt,

          waitedMs: Math.max(
            0,

            nowMs - (parseIsoMs(j.scheduledAt || "") || parseIsoMs(j.createdAt)),
          ),

          projectId: j.projectId ?? null,

          projectRoot: j.projectRoot,
        },
      });

      const hadRetryDelay =

        Array.isArray(j.events) &&


        j.events.some((ev) => ev && ev.type === "retry_delayed");

      if (hadRetryDelay) {
        emitRuntimeEvent({
          type: "retry_available",

          jobId: j.id,

          runId: null,

          projectId: j.projectId ?? null,

          projectRoot: j.projectRoot,

          data: {
            projectId: j.projectId ?? null,

            projectRoot: j.projectRoot,
          },

        });

      }

    } catch (_) {
      /* */

    }

  }

  /** @type {{ prune?: unknown, doctorLight?: unknown }} */
  const maintenance = {};

  if (AUTO_PRUNE) {
    try {
      maintenance.prune = pruneQueueTerminalJobs({});

    } catch (_) {
      /* */

    }

  }

  if (AUTO_DOCTOR_LIGHT) {
    try {
      const qv = validateQueueStrict();

      const stuckN = listSuspectStuckJobIds(loadQueueUnsafe()).length;

      maintenance.doctorLight = { queueOk: qv.ok, stuckSuspected: stuckN };

    } catch (_) {
      /* */

    }

  }

  const didWork = availabilityActivations > 0 || AUTO_PRUNE || AUTO_DOCTOR_LIGHT;

  const emitTicks = process.env.SETUP_BOSS_SCHEDULER_EMIT_TICK !== "0";

  let tickEmitted = false;

  if (emitTicks && didWork) {
    try {
      emitRuntimeEvent({
        type: "scheduler_tick",

        jobId: null,

        runId: null,

        data: {
          activated: availabilityActivations,

          maintenance: maintenance && Object.keys(maintenance).length ? maintenance : null,
        },

      });

      tickEmitted = true;

    } catch (_) {
      /* */

    }

  }

  return { availabilityActivations, tickEmitted, maintenance };

}

/**
 * Recuperação temporal ao arranque: jobs delayed permanecem válidos; emite sinais de observabilidade.
 * @param {{ cap?: number }} [opts]
 */
function emitTemporalRecoveryMarkers(opts = {}) {
  const cap =
    typeof opts.cap === "number" && Number.isFinite(opts.cap) && opts.cap > 0
      ? Math.floor(opts.cap)


      : 40;

  const q = loadQueueUnsafe();

  let delayed = 0;

  try {
    emitRuntimeEvent({
      type: "scheduler_recovered",

      jobId: null,

      runId: null,

      data: { pendingJobs: q.jobs.filter((x) => String(x.status) === "pending").length },

    });

  } catch (_) {
    /* */

  }

  for (const j of q.jobs) {
    if (delayed >= cap) break;

    if (String(j.status || "") !== "pending") continue;

    if (j.availableAt == null) continue;

    const av = parseIsoMs(j.availableAt);

    if (!Number.isFinite(av) || av <= Date.now()) continue;

    delayed += 1;

    try {
      emitRuntimeEvent({
        type: "delayed_job_recovered",

        jobId: j.id,

        runId: null,

        data: { availableAt: j.availableAt },

      });

    } catch (_) {
      /* */

    }

  }

}

module.exports = {
  POLL_MS,

  runSchedulerTickInternal,

  emitTemporalRecoveryMarkers,

};
