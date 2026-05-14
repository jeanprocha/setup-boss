"use strict";

/** Ponte opcional daemon/lib/runtime-events → núcleo de pipeline (filho spawned). */

/** @typedef {{ jobId?: string|null, runId?: string|null, data?: Record<string, unknown> }} EmitOpts */


function emitBridge(type, opts = {}) {
  try {
    const { emitRuntimeEvent } = require("../daemon/lib/runtime-events");

    const jobIdRaw = opts.jobId;

    const jid =
      jobIdRaw !== undefined && jobIdRaw != null && String(jobIdRaw).trim()
        ? String(jobIdRaw).trim()
        : process.env.SETUP_BOSS_DAEMON_JOB_ID && String(process.env.SETUP_BOSS_DAEMON_JOB_ID).trim()
          ? String(process.env.SETUP_BOSS_DAEMON_JOB_ID).trim()
          : null;

    if (
      jid &&
      (type === "phase_started" ||
        type === "phase_completed" ||
        type === "runtime_started")
    ) {
      try {
        const { touchJobProgress } = require("../daemon/lib/queue-store");

        touchJobProgress(jid);
      } catch (_) {
        /* */
      }
    }

    emitRuntimeEvent({
      type,

      ...(jobIdRaw !== undefined ? { jobId: jobIdRaw } : {}),

      runId: opts.runId != null ? opts.runId : null,

      data: opts.data || {},
    });
  } catch (_) {
    /* FS indisponível ou caminho de repo atípico — não bloquear pipeline */
  }
}

module.exports = {
  emitBridge,
};
