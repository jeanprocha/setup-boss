#!/usr/bin/env node

require("dotenv").config();

const path = require("path");
const { spawn } = require("child_process");
const {
  readDaemonPidRaw,
  writePid,
  deletePidFile,
  isPidAlive,
} = require("./lib/pid-file");
const { appendDaemonLog } = require("./lib/daemon-log");
const { getSetupBossRepoRoot } = require("./lib/repo-root");
  const {
    loadQueueUnsafe,
    updateJob,
    recoverOrphanRunningJobs,
    countsByStatus,
    appendJobEvent,
    validateQueueStrict,
    touchJobHeartbeat,
    jobRecordLooksStuck,
    enqueueJob,
    jobIsAvailable,
    migrateQueuePersistProjectIdsIfNeeded,
  } = require("./lib/queue-store");

const { deriveProjectId } = require("./lib/project-registry");

const {
  parseWorkerPoolConfig,
  createWorkerPool,
  buildFairnessPendingOrder,
  projectBusyCount,
  firstIdleSlotIndex,
  busyCount,
  findSlotByJobId,
  markSlotBusy,
  markSlotIdle,
  touchSlotHeartbeat,
  markAllStopping,
  getWorkersSummary,
  listWorkersBrief,
  firstBusyJobId,
} = require("./lib/worker-pool");

const {
  tryAcquireProjectLock,
  releaseProjectLock,
  heartbeatProjectLock,

  recoverStaleLocksOnDisk,

} = require("./lib/project-lock");

const {
  writeDaemonStatus,

} = require("./lib/daemon-status");

const {


  emitRuntimeEvent,

  validateRuntimeEventsReadable,





  deriveCurrentPhaseForJobFromStore,





  deriveLastPipelineEventAtForJobFromStore,





} = require("./lib/runtime-events");

const {
  createRuntimeApiServer,

  closeServerAsync,

  resolveRuntimeApiPort,

  RUNTIME_API_HOST,

} = require("./runtime-api");

const {
  runSchedulerTickInternal,

  emitTemporalRecoveryMarkers,

  POLL_MS,

} = require("./lib/scheduler-loop");

/** Versão do protocolo interno daemon/status/API (Fase 3.10). */
const DAEMON_PROTOCOL_VERSION = "3.10";

const HB_MS = Number(process.env.SETUP_BOSS_DAEMON_LOCK_HB_MS || 25000);
const TICK_MS = Number(process.env.SETUP_BOSS_DAEMON_TICK_MS || 850);
const JOB_RECORD_HB_MS = Number(
  process.env.SETUP_BOSS_JOB_HEARTBEAT_MS || 45000,

);

/** @type {Set<string>} */
const stuckAnnounced = new Set();

function parseFlags(argv) {
  return {
    foreground: argv.includes("--foreground"),
  };

}

/** @typedef {import("./lib/queue-store")} QS */

/** @param {QS.Job} job */
function buildRunJsArgv(job) {
  const fo = job.flowOptions && typeof job.flowOptions === "object" ? job.flowOptions : {};

  const argv = [job.taskArg, job.projectArg];

  if (fo.forceScan === true)
    argv.push("--force-scan");

  if (fo.dryRun === true)
    argv.push("--dry-run");

  if (fo.skipPreflightConfirm === true) {
    argv.push("--yes");
  }

  if (fo.policyProfile && String(fo.policyProfile).trim())
    argv.push(`--policy-profile=${String(fo.policyProfile).trim()}`);

  if (fo.forcePolicyBypass === true)
    argv.push("--force-policy-bypass");

  if (fo.disableGovernance === true)
    argv.push("--disable-governance");

  return argv;

}

/**
 * Claim com fairness (round-robin entre projetos) + limites do pool.
 * Mantém apenas lock adquirido com sucesso; liberta tentativas intermédias.
 * @param {string|number} daemonPid
 * @param {import("./lib/worker-pool").WorkerPool} pool
 * @returns {{ job: QS.Job, slotIndex: number, workerId: string }|null}
 */
function claimNextPendingJobForPool(daemonPid, pool) {
  if (busyCount(pool) >= pool.maxWorkers) return null;

  const idle = firstIdleSlotIndex(pool);

  if (idle < 0) return null;

  const queue = loadQueueUnsafe();

  const pendingSorted = queue.jobs.filter(
    (j) => j.status === "pending" && jobIsAvailable(j),
  );

  const fairness = buildFairnessPendingOrder(pendingSorted, pool.rrCursor);

  /** @type {Map<string,string>} projeto -> jobId onde lock ficou criado inadvertidamente */
  const tentativeReleases = new Map();

  let emittedSkipBusy = false;

  try {
    for (const cand of fairness) {
      const pid =
        cand.projectId != null && String(cand.projectId).trim()
          ? String(cand.projectId).trim()
          : deriveProjectId(String(cand.projectRoot));

      if (projectBusyCount(pool, pid) >= pool.maxWorkersPerProject) {
        if (!emittedSkipBusy) {
          emittedSkipBusy = true;

          try {
            emitRuntimeEvent({
              type: "job_skipped_project_busy",

              jobId: cand.id,

              runId: null,

              projectId: pid,

              projectRoot: cand.projectRoot,

              data: {
                projectId: pid,

                reason: "per_project_worker_slots",

                maxWorkersPerProject: pool.maxWorkersPerProject,
              },
            });
          } catch (_) {
            /* */
          }
        }

        continue;
      }

      const ac = tryAcquireProjectLock(String(cand.projectRoot), {
        pid: daemonPid,

        jobId: cand.id,
      });

      if (!ac.ok) continue;

      tentativeReleases.set(String(cand.projectRoot), cand.id);

      const startedIso = new Date().toISOString();

      const workerId = pool.slots[idle].workerId;

      const updated = updateJob(queue, cand.id, (j) => ({
        ...j,

        status: "running",

        startedAt: startedIso,

        attempts: (j.attempts || 0) + 1,

        error: null,

        recovery_reason: null,

        workerChildPid: null,

        heartbeatAt: startedIso,

        lastProgressAt: startedIso,

        stuckSuspected: false,

        assignedWorkerId: workerId,

        events: appendJobEvent(j, "started", { daemonPid, workerId }),
      }));

      if (updated) {
        const nProj = new Set(
          fairness.map((x) =>
            x.projectId != null && String(x.projectId).trim()
              ? String(x.projectId).trim()
              : deriveProjectId(String(x.projectRoot)),
          ),
        ).size;

        pool.rrCursor = (pool.rrCursor + 1) % Math.max(1, nProj);

        appendDaemonLog(
          `lock_acquired job=${updated.id} project=${updated.projectRoot}`,
        );

        appendDaemonLog(`job_started job=${updated.id} worker=${workerId}`);

        try {
          emitRuntimeEvent({
            type: "job_claimed",

            jobId: updated.id,

            runId: null,

            projectId: updated.projectId ?? null,

            projectRoot: updated.projectRoot,

            data: {
              daemonPid: String(daemonPid),

              workerId,

              projectId: updated.projectId ?? null,

              projectRoot: updated.projectRoot,
            },
          });

          emitRuntimeEvent({
            type: "job_started",

            jobId: updated.id,

            runId: null,

            projectId: updated.projectId ?? null,

            projectRoot: updated.projectRoot,

            data: {
              daemonPid: String(daemonPid),

              workerId,

              projectId: updated.projectId ?? null,

              projectRoot: updated.projectRoot,
            },
          });

          emitRuntimeEvent({
            type: "worker_busy",

            jobId: updated.id,

            runId: null,

            projectId: updated.projectId ?? null,

            projectRoot: updated.projectRoot,

            data: {
              workerId,

              projectId: updated.projectId ?? null,

              projectRoot: updated.projectRoot,
            },
          });
        } catch (_) {
          /* */
        }

        markSlotBusy(pool, idle, updated);

        return { job: updated, slotIndex: idle, workerId };
      }
    }
  } finally {
    for (const [root, jid] of tentativeReleases) {
      const still = loadQueueUnsafe().jobs.find((x) => x.id === jid);

      if (!still || still.status !== "running")
        releaseProjectLock(root, jid, daemonPid);
    }
  }

  return null;
}

const CANCEL_KILL_AFTER_MS = Number(
  process.env.SETUP_BOSS_CANCEL_SIGKILL_AFTER_MS || 12000,

);

/** @param {import("./lib/worker-pool").WorkerPool} pool */
function workerObservationPatch(pool) {
  const id = firstBusyJobId(pool);

  const busyFlag = Boolean(id);

  return {
    worker: {
      busy: Boolean(busyFlag),

      currentJobId: id,

      currentPhase: id ? deriveCurrentPhaseForJobFromStore(id) : null,

      lastPipelineEventAt: id
        ? deriveLastPipelineEventAtForJobFromStore(id)
        : null,
    },

    workers: getWorkersSummary(pool),

    workerList: listWorkersBrief(pool),

    concurrency: {
      maxWorkers: pool.maxWorkers,

      maxWorkersPerProject: pool.maxWorkersPerProject,
    },
  };
}

function peekJobRecord(jobId) {
  const q = loadQueueUnsafe();

  const j = q.jobs.find((x) => x.id === jobId);

  return j || null;
}

/** @param {import("./lib/worker-pool").WorkerPool} pool
 * @param {string} jobId
 */
function childPidForJob(pool, jobId) {
  const f = findSlotByJobId(pool, jobId);

  const ch = f && f.slot.workerCtl.child;

  return ch && typeof ch.pid === "number" ? ch.pid : null;
}

/**


 * @param {QS.Job} job


 * @param {string} repoRoot


 * @param {number} daemonPid


 * @param {{
 * workerCtl: { child: import("child_process").ChildProcess | null },

 * daemonSnapshot: { currentJobId: string|null, workerChildPid?: number|null },
 *
 * }} rt


 */


function runJobChild(job, repoRoot, daemonPid, rt) {


  const jr = peekJobRecord(job.id);


  if (
    jr &&
    (jr.cancel_requested === true ||
      jr.status === "cancelling")
  )


    return Promise.resolve({
      code: 130,

      runId: null,

      signal: /** @type {null} */ (null),

      abortedPrespawn: /** @type {true} */ (true),

      spawnErr: null,

    });



  const runScript = path.join(repoRoot, "scripts", "run.js");


  const argv = buildRunJsArgv(job);


  appendDaemonLog(


    `spawn node scripts/run.js ${argv.map((a) => JSON.stringify(a)).join(" ")}`,


  );



  return new Promise((resolve) => {


    const child = spawn(process.execPath, [runScript, ...argv], {


      cwd: repoRoot,

      env: {
        ...process.env,

        SETUP_BOSS_DAEMON_JOB_ID: job.id,

        SETUP_BOSS_WORKER_ID:
          typeof rt.workerId === "string" && rt.workerId ? rt.workerId : "",
      },

      windowsHide: true,


    });


    rt.workerCtl.child = child;


    if (typeof child.pid === "number" && child.pid > 0) {
      if (rt.daemonSnapshot && rt.multiWorker !== true)
        rt.daemonSnapshot.workerChildPid = child.pid;

      const t0 = new Date().toISOString();

      updateJob(undefined, job.id, (j) => ({
        ...j,

        workerChildPid: child.pid,

        heartbeatAt: t0,

        lastProgressAt: t0,

      }));

    }

    const buf = [];


    /** @type {string|null} */


    let extractedRunId = null;


    let settled = false;



    function finish(payload) {


      if (settled) return;


      settled = true;


      rt.workerCtl.child = null;


      if (rt.daemonSnapshot && rt.multiWorker !== true)
        rt.daemonSnapshot.workerChildPid = null;


      resolve(payload);


    }



    function onChunk(d) {


      const s = d.toString();

      buf.push(s);


      appendDaemonLog(`[job ${job.id} stdout/stderr] ${s.trimEnd()}`);



    }



    if (child.stdout) child.stdout.on("data", onChunk);


    if (child.stderr) child.stderr.on("data", onChunk);


    child.once("close", (code, signal) => {


      const out = buf.join("");


      const m = out.match(/^\[RUN\] runId:\s*(\S+)/m);


      if (m) extractedRunId = String(m[1]).trim();


      finish({
        code:


          typeof code === "number" && Number.isFinite(code)


            ? code


            : code == null


              ? 130


              : 1,

        runId: extractedRunId,

        signal: signal != null ? String(signal) : null,

        abortedPrespawn: /** @type {false} */ (false),

        spawnErr: null,

      });


    });


    child.once("error", (err) => {


      appendDaemonLog(


        `job_spawn_error job=${job.id} ${String(err.message || err)}`,


      );



      finish({


        code: 1,


        runId: null,

        signal: null,

        abortedPrespawn: /** @type {false} */ (false),


        spawnErr: String(err.message || err),


      });


    });


  });


}

/** Envio cooperativo SIGTERM (+ SIGKILL retardado opcional via env). */


function requestRunningTerminateForJob(jobId, pool) {
  const found = findSlotByJobId(pool, String(jobId));

  if (!found)
    return { ok: /** @type {false} */ (false), reason: "job_not_current" };

  const child = found.slot.workerCtl.child;

  if (!child || typeof child.pid !== "number") {
    appendDaemonLog(
      `job_cancel_enqueue_no_child_yet job=${jobId}`,
    );

    return { ok: /** @type {true} */ (true), pendingSpawn: /** @type {true} */ (true) };
  }

  try {
    killTimerAttach(child, { workerCtl: found.slot.workerCtl }, jobId);

    child.kill("SIGTERM");

    appendDaemonLog(`job_cancel_sigterm job=${jobId}`);

    return { ok: /** @type {true} */ (true) };
  } catch (e) {
    return {
      ok: /** @type {false} */ (false),

      reason: String((e && e.message) || e),
    };
  }
}

/** @param {import("child_process").ChildProcess} child */


function killTimerAttach(child, rt, jobId) {


  const ms = Math.max(200, CANCEL_KILL_AFTER_MS);


  const t = setTimeout(() => {


    try {


      if (child && !child.killed && rt.workerCtl.child === child)


        child.kill("SIGKILL");


      appendDaemonLog(`job_cancel_sigkill job=${jobId}`);


    } catch (_) {
      /* */


    }


  }, ms);


  child.once("close", () => {


    try {


      clearTimeout(t);


    } catch (_) {
      /* */


    }


  });


}

async function executeJobLifecycle(job, repoRoot, daemonPid, rt, pool, slotIndex) {
  const holder = { pid: daemonPid, jobId: job.id };

  const hb = setInterval(() => {
    heartbeatProjectLock(job.projectRoot, holder);

  }, HB_MS);

  const jobRecHbMs = Math.max(5000, JOB_RECORD_HB_MS);

  const jobHb = setInterval(() => {
    try {
      touchJobHeartbeat(job.id);

      touchSlotHeartbeat(pool, slotIndex);
    } catch (_) {
      /* */
    }

  }, jobRecHbMs);



  try {


    const res = await runJobChild(job, repoRoot, daemonPid, rt);



    const jr = peekJobRecord(job.id);

    const cancelTone =
      res.abortedPrespawn === true ||

      Boolean(

        jr &&

          (jr.cancel_requested === true || jr.status === "cancelling"),

      );



    const nowIso = new Date().toISOString();



    if (cancelTone) {


      updateJob(undefined, job.id, (j) => {


        const reason =


          typeof j.cancellation_reason === "string" &&
          j.cancellation_reason.trim()


            ? j.cancellation_reason.trim()


            : "Execução cancelada (cooperativa).";



        return {


          ...j,



          status: "cancelled",



          finishedAt: nowIso,



          cancel_requested: false,

          workerChildPid: null,

          runId: res.runId || j.runId,



          error: {


            code: "job_cancelled",



            message: reason,

            exitCode:

              typeof res.code === "number" && Number.isFinite(res.code)


                ? res.code


                : null,

            signal: res.signal ?? null,

          },

          events: appendJobEvent(j, "cancelled", {


            exitCode: res.code ?? null,

            signal: res.signal ?? null,

          }),

        };


      });

      appendDaemonLog(`job_cancelled job=${job.id} runId=${res.runId || ""}`);


      try {


        emitRuntimeEvent({




          type: "job_cancelled",




          jobId: job.id,




          runId:

            res.runId || (jr && jr.runId) || null,



          data:


            {


              exitCode: res.code ?? null,





              signal: res.signal ?? null,






            },






        });


      } catch (_) {
        /* */


      }



      return;


    }



    if (res.code === 0) {


      updateJob(undefined, job.id, (j) => ({


        ...j,



        status: "completed",



        finishedAt: nowIso,

        workerChildPid: null,



        runId: res.runId || j.runId,

        error: null,

        events: appendJobEvent(j, "completed", {


          runId: res.runId || j.runId,

        }),

      }));

      appendDaemonLog(`job_completed job=${job.id} runId=${res.runId || ""}`);


      try {


        emitRuntimeEvent({




          type: "job_completed",




          jobId: job.id,

          projectId: job.projectId ?? null,

          projectRoot: job.projectRoot,

          runId: res.runId || null,




          data: {
            projectId: job.projectId ?? null,
            projectRoot: job.projectRoot,
          },



        });


      } catch (_) {
        /* */


      }

      try {
        const done = peekJobRecord(job.id);

        if (

          done &&

          done.recurring &&

          typeof done.recurring === "object" &&

          Number.isFinite(Number(/** @type {any} */ (done.recurring).intervalMs))

        ) {
          const iv = Math.floor(Number(/** @type {any} */ (done.recurring).intervalMs));

          enqueueJob({
            projectRoot: String(done.projectRoot),

            taskArg: String(done.taskArg),

            projectArg: String(done.projectArg),

            flowOptions:


              done.flowOptions && typeof done.flowOptions === "object" ? done.flowOptions : {},

            metadata: {
              ...(
                done.metadata && typeof done.metadata === "object" ? done.metadata : {}


              ),

              recurringDerivedFrom: String(done.id),

            },

            recurring: {
              intervalMs: iv,

              originJobId:
                /** @type {any} */ (done.recurring).originJobId || String(done.id),

            },

            delayMs: iv,

          });

        }

      } catch (e) {
        try {
          emitRuntimeEvent({
            type: "recurring_job_skipped",

            jobId: job.id,

            runId: res.runId || null,

            data: { reason: String((e && e.message) || e) },

          });

        } catch (_) {
          /* */

        }

      }

    } else {
      updateJob(undefined, job.id, (j) => ({
        ...j,

        status: "failed",

        finishedAt: nowIso,

        workerChildPid: null,

        runId: res.runId || j.runId,

        error: {
          code: res.spawnErr ? "run_js_spawn_failed" : "run_js_nonzero_exit",

          exitCode: res.code,

          message:
            res.spawnErr ||

            `Processo scripts/run.js terminou com código ${res.code}.`,
        },

        events: appendJobEvent(j, "failed", {


          exitCode: res.code ?? null,

        }),

      }));



      appendDaemonLog(
        `job_failed job=${job.id} exit=${res.code} runId=${res.runId || ""}`,

      );


      try {


        emitRuntimeEvent({





          type: "job_failed",




          jobId: job.id,




          runId: res.runId || null,




          data:


            {


              exitCode:




                typeof res.code === "number" && Number.isFinite(res.code)






                  ? res.code




                  : null,








              spawnErr: res.spawnErr || null,




            },








        });


      } catch (_) {
        /* */


      }


    }


  } finally {


    clearInterval(hb);

    clearInterval(jobHb);

    stuckAnnounced.delete(job.id);





    try {


      emitRuntimeEvent({





        type: "worker_idle",




        jobId: null,




        runId: null,




        data:


          {


            afterJobId: job.id,

            workerId: typeof rt.workerId === "string" ? rt.workerId : null,








          },








      });


    } catch (_) {
      /* */


    }



    releaseProjectLock(job.projectRoot, job.id, daemonPid);



    appendDaemonLog(`lock_released job=${job.id} project=${job.projectRoot}`);



    rt.workerCtl.child = null;


    if (rt.daemonSnapshot && rt.multiWorker !== true)
      rt.daemonSnapshot.workerChildPid = null;

    markSlotIdle(pool, slotIndex);


  }



}

function main() {
  const flags = parseFlags(process.argv.slice(2));

  const repoRoot = getSetupBossRepoRoot();

  const existing = readDaemonPidRaw();

  if (existing != null && Number(existing) !== Number(process.pid)) {
    if (isPidAlive(existing)) {

      appendDaemonLog(
        `abort_duplicate_daemon existingPid=${existing} newPid=${process.pid}`,

      );

      console.error(
        `[setup-bossd] Daemon já parece estar a correr (PID ${existing}).`,
      );

      process.exit(1);

      return;


    }


  }



  stuckAnnounced.clear();

  try {
    emitRuntimeEvent({
      type: "daemon_recovery_started",

      jobId: null,

      runId: null,

      data: { pid: process.pid },

    });

  } catch (_) {
    /* */
  }

  const qVal = validateQueueStrict();

  if (!qVal.ok)
    appendDaemonLog(`recovery_warn invalid_queue: ${qVal.error || ""}`);

  const evVal = validateRuntimeEventsReadable();

  if (!evVal.ok)
    appendDaemonLog(`recovery_warn invalid_events: ${evVal.error || ""}`);

  const clearedLocks = recoverStaleLocksOnDisk();

  if (clearedLocks) {
    try {
      emitRuntimeEvent({
        type: "daemon_recovered_lock",

        jobId: null,

        runId: null,

        data: { cleared: clearedLocks },

      });

    } catch (_) {
      /* */
    }
  }

  appendDaemonLog(`recovery_action orphan_running_jobs`);

  const recovered = recoverOrphanRunningJobs();

  if (recovered && typeof recovered === "object") {
    const rf = recovered.runningFinalized || 0;

    const cf = recovered.cancellingFinalized || 0;

    appendDaemonLog(`recovery_jobs running_finalized=${rf} cancelling_finalized=${cf}`);

    const emitCap = 40;

    let k = 0;

    if (rf + cf) {
      try {
        const q = loadQueueUnsafe();

        for (const j of q.jobs) {
          if (k >= emitCap) break;

          if (


            j.recovery_reason === "daemon_restarted_while_running" ||


            j.recovery_reason === "worker_pid_dead" ||


            j.recovery_reason === "daemon_restart_cancelling_finalized"


          ) {
            emitRuntimeEvent({
              type: "daemon_recovered_job",

              jobId: j.id,

              runId: j.runId ?? null,

              data: { recovery_reason: j.recovery_reason },

            });

            k += 1;

          }

        }

      } catch (_) {
        /* */
      }
    }
  }

  try {
    emitRuntimeEvent({
      type: "daemon_recovery_completed",

      jobId: null,

      runId: null,

      data: {
        queueOk: qVal.ok,

        eventsOk: evVal.ok,

        staleLocksCleared: clearedLocks || 0,

        runningFinalized:


          recovered && typeof recovered === "object"


            ? recovered.runningFinalized || 0


            : 0,

        cancellingFinalized:


          recovered && typeof recovered === "object"


            ? recovered.cancellingFinalized || 0


            : 0,

      },

    });

  } catch (_) {
    /* */
  }

  try {
    emitTemporalRecoveryMarkers({ cap: 40 });

  } catch (_) {
    /* */
  }

  try {
    const mig = migrateQueuePersistProjectIdsIfNeeded();

    if (mig && mig.migrated)
      appendDaemonLog("migration_action queue_project_ids_persisted");
  } catch (e) {
    appendDaemonLog(`migration_warn project_ids ${String((e && e.message) || e)}`);
  }

  writePid(process.pid);

  const startedAt = new Date().toISOString();

  let processedJobs = 0;

  const poolConfig = parseWorkerPoolConfig();

  const workerPool = createWorkerPool({
    maxWorkers: poolConfig.maxWorkers,
    maxWorkersPerProject: poolConfig.maxWorkersPerProject,
  });

  try {
    emitRuntimeEvent({
      type: "worker_started",
      jobId: null,
      runId: null,
      data: {
        workerIds: workerPool.slots.map((x) => x.workerId),
        maxWorkers: workerPool.maxWorkers,
        maxWorkersPerProject: workerPool.maxWorkersPerProject,
      },
    });
  } catch (_) {
    /* */
  }

  /** Jobs concluídos nesta sessão (sucesso, falha ou cancelamento cooperativo). */

  writeDaemonStatus({
    running: true,

    pid: process.pid,

    startedAt,

    currentJobId: null,

    daemonVersion: DAEMON_PROTOCOL_VERSION,

    processedJobs,

    ...workerObservationPatch(workerPool),

    updatedAt: startedAt,
  });

  try {
    const qc = countsByStatus(loadQueueUnsafe());
    appendDaemonLog(
      `startup_summary queue_pending=${qc.pending || 0} running=${qc.running || 0} delayed_notice=scheduler_poll`,
    );
  } catch (_) {
    /* */
  }

  appendDaemonLog(`daemon_started pid=${process.pid} repo=${repoRoot} workers=${workerPool.maxWorkers}`);

  console.log(`setup-bossd iniciado PID=${process.pid} (foreground=${flags.foreground}) maxWorkers=${workerPool.maxWorkers}`);

  let shutdownRequested = false;

  const daemonSnapshot = {
    lastError: /** @type {string|null} */ (null),
  };

  const runtimeApiPort = resolveRuntimeApiPort();

  const { server: runtimeApiServer } = createRuntimeApiServer({
    getDaemonSnapshot: () => {
      const jid = firstBusyJobId(workerPool);

      return {
        busy: busyCount(workerPool) > 0,

        currentJobId: jid,

        lastError: daemonSnapshot.lastError,

        pid: process.pid,

        startedAt,

        running: true,

        workerChildPid: jid ? childPidForJob(workerPool, jid) : null,

        workers: getWorkersSummary(workerPool),

        workerList: listWorkersBrief(workerPool),

        runningJobs: listWorkersBrief(workerPool)
          .filter(
            (w) =>
              w.jobId &&
              (w.status === "busy" || w.status === "stopping"),
          )
          .map((w) => ({
            jobId: w.jobId,

            workerId: w.workerId,

            projectId: w.projectId,

            workerChildPid: w.jobId
              ? childPidForJob(workerPool, w.jobId)
              : null,
          })),

        concurrency: {
          maxWorkers: workerPool.maxWorkers,

          maxWorkersPerProject: workerPool.maxWorkersPerProject,
        },
      };
    },

    repoRoot,

    requestRunningTerminate: (jid) =>
      requestRunningTerminateForJob(String(jid), workerPool),
  });

  runtimeApiServer.listen(runtimeApiPort, RUNTIME_API_HOST, () => {
    appendDaemonLog(
      `runtime_api_listen host=${RUNTIME_API_HOST} port=${runtimeApiPort}`,
    );

    console.log(
      `Runtime API em http://${RUNTIME_API_HOST}:${runtimeApiPort} (apenas localhost)`,
    );
  });

  const STUCK_POLL_MS = Number(process.env.SETUP_BOSS_STUCK_POLL_MS || 60000);

  const stuckPollInterval = setInterval(() => {
    try {
      const q = loadQueueUnsafe();

      for (const jr of q.jobs) {
        if (String(jr.status || "") !== "running") continue;

        const jid = String(jr.id);

        if (!jobRecordLooksStuck(jr)) continue;

        if (stuckAnnounced.has(jid)) continue;

        stuckAnnounced.add(jid);

        appendDaemonLog(`suspect_stuck job=${jid}`);

        updateJob(undefined, jid, (x) => ({ ...x, stuckSuspected: true }));

        try {
          emitRuntimeEvent({
            type: "job_stuck_detected",

            jobId: jid,

            runId: jr.runId ?? null,

            data: {
              heartbeatAt: jr.heartbeatAt ?? null,

              startedAt: jr.startedAt ?? null,
            },
          });

          emitRuntimeEvent({
            type: "worker_stuck_detected",

            jobId: jid,

            runId: jr.runId ?? null,

            data: { childPid: childPidForJob(workerPool, jid) },
          });
        } catch (_) {
          /* */
        }
      }
    } catch (_) {
      /* */
    }
  }, Math.max(10000, STUCK_POLL_MS));

  const schedulerInterval = setInterval(() => {
    try {
      const r = runSchedulerTickInternal();

      writeDaemonStatus({
        scheduler: {
          lastTickAt: new Date().toISOString(),

          pollMs: POLL_MS,

          lastActivations: r.availabilityActivations,
        },
      });
    } catch (_) {
      /* */
    }
  }, POLL_MS);

  runtimeApiServer.on("error", (err) => {
    appendDaemonLog(
      `runtime_api_fatal ${String((err && err.message) || err)}`,
    );

    daemonSnapshot.lastError = String((err && err.message) || err);
  });

  function finishDaemonShutdown() {
    try {
      clearInterval(stuckPollInterval);
    } catch (_) {
      /* */
    }

    try {
      clearInterval(schedulerInterval);
    } catch (_) {
      /* */
    }

    closeServerAsync(runtimeApiServer)
      .catch(() => {
        /* */
      })

      .finally(() => {
        deletePidFile();

        writeDaemonStatus({
          running: false,

          pid: null,

          startedAt: null,

          currentJobId: null,

          ...workerObservationPatch(workerPool),

          queue: countsByStatus(loadQueueUnsafe()),

          stoppedAt: new Date().toISOString(),
        });
        appendDaemonLog("daemon_stopped");

        process.exit(0);
      });
  }

  async function runWorkerJob(claimedPack) {
    const { job, slotIndex, workerId } = claimedPack;

    const slotRt = {
      workerCtl: workerPool.slots[slotIndex].workerCtl,

      workerId,

      multiWorker: true,

      daemonSnapshot: null,
    };

    try {
      await executeJobLifecycle(
        job,
        repoRoot,
        process.pid,
        slotRt,
        workerPool,
        slotIndex,
      );
    } catch (e) {
      appendDaemonLog(
        `job_fatal job=${job.id} ${String((e && e.message) || e)}`,
      );

      try {
        emitRuntimeEvent({
          type: "worker_crashed",

          jobId: job.id,

          runId: null,

          projectId: job.projectId ?? null,

          projectRoot: job.projectRoot,

          data: {
            workerId,

            message: String((e && e.message) || e),
          },
        });
      } catch (_) {
        /* */
      }

      const jr = peekJobRecord(job.id);

      if (jr && String(jr.status || "") === "running") {
        updateJob(undefined, job.id, (j) => ({
          ...j,

          status: "failed",

          finishedAt: new Date().toISOString(),

          workerChildPid: null,

          error: {
            code: "daemon_worker_exception",

            message: String((e && e.message) || e),
          },
        }));

        try {
          emitRuntimeEvent({
            type: "job_failed",

            jobId: job.id,

            runId: null,

            data: { code: "daemon_worker_exception" },
          });
        } catch (_) {
          /* */
        }

        try {
          releaseProjectLock(job.projectRoot, job.id, process.pid);
        } catch (_) {
          /* */
        }

        markSlotIdle(workerPool, slotIndex);
      }
    } finally {
      processedJobs += 1;

      const pj = firstBusyJobId(workerPool);

      writeDaemonStatus({
        running: true,

        pid: process.pid,

        startedAt,

        currentJobId: pj,

        daemonVersion: DAEMON_PROTOCOL_VERSION,

        processedJobs,

        queue: countsByStatus(loadQueueUnsafe()),

        ...workerObservationPatch(workerPool),
      });
    }
  }

  function tick() {
    if (shutdownRequested) {
      if (busyCount(workerPool) === 0) {
        try {
          emitRuntimeEvent({
            type: "worker_stopped",

            jobId: null,

            runId: null,

            data: { graceful: true },
          });
        } catch (_) {
          /* */
        }

        finishDaemonShutdown();

        return;
      }

      setTimeout(tick, TICK_MS);

      return;
    }

    const qSnap = loadQueueUnsafe();

    const pj = firstBusyJobId(workerPool);

    writeDaemonStatus({
      running: true,

      pid: process.pid,

      startedAt,

      currentJobId: pj,

      daemonVersion: DAEMON_PROTOCOL_VERSION,

      processedJobs,

      queue: countsByStatus(qSnap),

      ...workerObservationPatch(workerPool),
    });

    while (!shutdownRequested) {
      if (busyCount(workerPool) >= workerPool.maxWorkers) break;

      const claimed = claimNextPendingJobForPool(process.pid, workerPool);

      if (!claimed) break;

      void runWorkerJob(claimed);
    }

    setTimeout(tick, TICK_MS);
  }

  function requestShutdown() {
    shutdownRequested = true;

    markAllStopping(workerPool);

    try {
      emitRuntimeEvent({
        type: "worker_stopping",

        jobId: null,

        runId: null,

        data: { busyRemaining: busyCount(workerPool) },
      });
    } catch (_) {
      /* */
    }

    appendDaemonLog(
      `shutdown_requested workers_busy=${busyCount(workerPool)}`,
    );
  }

  process.on("SIGINT", requestShutdown);

  process.on("SIGTERM", requestShutdown);

  setTimeout(tick, 50);

}

main();
