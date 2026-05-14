/**
 * Runtime API local (Fase 3.2): HTTP mínimo integrado ao daemon.
 * Bind obrigatório em 127.0.0.1 — não expor em rede.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { getSetupBossRepoRoot } = require("./lib/repo-root");
const {
  loadQueueUnsafe,

  enqueueJob,

  listSorted,

  updateJob,

  countsByStatus,

  appendJobEvent,

  validateQueueStrict,

  requestJobRetry,

  pruneQueueTerminalJobs,

  listSuspectStuckJobIds,

  countRetryableJobs,

  jobIsRetryable,

  jobRecordLooksStuck,

  jobIsDelayedPending,

  jobHasRecurring,

  parseIsoMs,

} = require("./lib/queue-store");

const {
  buildProjectsOverview,
  resolveProjectSelector,
  findProjectRecord,
  canonicalProjectRoot,
  deriveProjectId,
} = require("./lib/project-registry");

const { readDaemonStatus } = require("./lib/daemon-status");

const {


  readRuntimeEventsFiltered,


  emitRuntimeEvent,


  pruneRuntimeEventsFile,



} = require("./lib/runtime-events");

const RUNTIME_API_HOST = "127.0.0.1";

const DEFAULT_RUNTIME_API_PORT = 3210;

const MAX_JSON_BODY_BYTES = 256 * 1024;

/** @typedef {{ busy: boolean, currentJobId: string|null, pid?: number, startedAt?: string|null, running?: boolean, lastError?: string|null, workerChildPid?: number|null, workers?: { total: number, busy: number, idle: number, stopping?: number }, workerList?: object[], runningJobs?: object[], concurrency?: { maxWorkers: number, maxWorkersPerProject: number } }} DaemonSnapshot */


/** @typedef {(jobId: string) => { ok: boolean, reason?: string, pendingSpawn?: boolean }} RunningTerminateHook */

function resolveRuntimeApiPort() {
  const raw = process.env.SETUP_BOSS_RUNTIME_API_PORT;
  const n = Number(raw == null || raw === "" ? DEFAULT_RUNTIME_API_PORT : raw);

  if (!Number.isFinite(n) || n <= 0 || n > 65535)
    return DEFAULT_RUNTIME_API_PORT;

  return Math.floor(n);
}

function sendJson(res, statusCode, obj) {
  const body = JSON.stringify(obj);

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",

    "Content-Length": Buffer.byteLength(body, "utf8"),
  });

  res.end(body);
}

function errorPayload(code, message) {
  return {
    ok: false,

    error: {
      code,

      message,
    },

  };
}

/**
 * @param {http.IncomingMessage} req
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
function readBodyLimited(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;

    const chunks = [];

    req.on("data", (chunk) => {
      total += chunk.length;

      if (total > maxBytes) {
        reject(Object.assign(new Error("payload_too_large"), { code: "payload_too_large" }));

        req.destroy();

        return;

      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));

    req.on("error", reject);
  });
}

function normalizePath(pathname) {
  let p = pathname || "/";

  if (p.length > 1 && p.endsWith("/"))
    p = p.slice(0, -1);

  return p;
}

function isLocalSocket(socket) {
  const a = socket && socket.remoteAddress;

  const s = a == null ? "" : String(a);

  return (
    s === "127.0.0.1" ||
    s === "::1" ||
    s === "::ffff:127.0.0.1"
  );

}

/**


 * @param {DaemonSnapshot} snap


 * @param {string} jobId


 */


function workerHintsForJob(snap, jobId) {
  const jid = String(jobId);

  const running = Array.isArray(snap.runningJobs) ? snap.runningJobs : [];

  const row = running.find((x) => x && x.jobId != null && String(x.jobId) === jid);

  const matchesCurrent =
    (snap.currentJobId != null && String(snap.currentJobId) === jid) ||
    Boolean(row);

  const childPid =
    row && typeof row.workerChildPid === "number" && Number.isFinite(row.workerChildPid)
      ? row.workerChildPid
      : typeof snap.workerChildPid === "number" && Number.isFinite(snap.workerChildPid)
        ? snap.workerChildPid
        : null;

  return {
    daemonBusy: typeof snap.busy === "boolean" ? snap.busy : false,

    daemonCurrentJobId: snap.currentJobId ?? null,

    workerId:
      row && row.workerId != null && String(row.workerId).trim()
        ? String(row.workerId).trim()
        : null,

    childPid,

    matchesCurrent,
  };
}

function temporalNextRunAt(j) {
  if (String(j.status || "") !== "pending") return null;

  if (!j.availableAt || typeof j.availableAt !== "string") return null;

  const t = parseIsoMs(j.availableAt);

  if (!Number.isFinite(t)) return null;

  if (t > Date.now()) return j.availableAt;

  return null;

}

/**

 * Combina snapshot do daemon útil ao troubleshooting do job atual.


 */


function jobDetailEnvelope(j, snap) {


  return {


    ...detailJob(j),

    worker: workerHintsForJob(snap || {}, String(j.id)),

  };


}

/** @param {object} j */
function summarizeJob(j) {
  const exitCode =
    j.error && typeof j.error.exitCode === "number"
      ? j.error.exitCode
      : null;

  const pid =
    j.projectId != null && String(j.projectId).trim()
      ? String(j.projectId).trim()
      : j.projectRoot
        ? deriveProjectId(String(j.projectRoot))
        : null;

  return {
    id: j.id,

    status: j.status,

    projectRoot: j.projectRoot,

    projectId: pid,

    taskPath: j.taskArg,

    taskArg: j.taskArg,

    projectArg: j.projectArg,

    createdAt: j.createdAt,

    startedAt: j.startedAt,

    finishedAt: j.finishedAt,

    runId: j.runId,

    attempts: j.attempts,

    retryable: jobIsRetryable(j),

    assignedWorkerId:
      j.assignedWorkerId != null && String(j.assignedWorkerId).trim()
        ? String(j.assignedWorkerId).trim()
        : null,

    exitCode,

    error: j.error,

    scheduledAt: j.scheduledAt ?? null,

    availableAt: j.availableAt ?? null,

    delayMs: j.delayMs ?? null,

    recurring: j.recurring && typeof j.recurring === "object" ? j.recurring : null,

    nextRunAt: temporalNextRunAt(j),

  };

}

/** @param {object} j */
function detailJob(j) {
  const pid =
    j.projectId != null && String(j.projectId).trim()
      ? String(j.projectId).trim()
      : j.projectRoot
        ? deriveProjectId(String(j.projectRoot))
        : null;

  return {
    id: j.id,

    status: j.status,

    projectRoot: j.projectRoot,

    projectId: pid,

    taskPath: j.taskArg,

    taskArg: j.taskArg,

    projectArg: j.projectArg,

    createdAt: j.createdAt,

    startedAt: j.startedAt,

    finishedAt: j.finishedAt,

    attempts: j.attempts,

    maxAttempts: j.maxAttempts,

    lastAttemptAt: j.lastAttemptAt ?? null,

    retryable: jobIsRetryable(j),

    heartbeatAt: j.heartbeatAt ?? null,

    lastProgressAt: j.lastProgressAt ?? null,

    assignedWorkerId:
      j.assignedWorkerId != null && String(j.assignedWorkerId).trim()
        ? String(j.assignedWorkerId).trim()
        : null,

    workerChildPid:


      typeof j.workerChildPid === "number" && Number.isFinite(j.workerChildPid)


        ? j.workerChildPid


        : null,

    stuckSuspected: jobRecordLooksStuck(j) || j.stuckSuspected === true,

    runId: j.runId,

    exitCode:
      j.error && typeof j.error.exitCode === "number"
        ? j.error.exitCode
        : null,

    error: j.error,

    metadata: j.metadata && typeof j.metadata === "object" ? j.metadata : {},

    flowOptions:
      j.flowOptions && typeof j.flowOptions === "object" ? j.flowOptions : {},

    recovery_reason: j.recovery_reason ?? null,

    cancellation: {

      requested:


        typeof j.cancel_requested === "boolean" ? j.cancel_requested : false,

      requestedAt: j.cancellationRequestedAt ?? null,

      reason: j.cancellation_reason ?? null,

    },

    scheduledAt: j.scheduledAt ?? null,

    availableAt: j.availableAt ?? null,

    delayMs: j.delayMs ?? null,

    recurring: j.recurring && typeof j.recurring === "object" ? j.recurring : null,

    nextRunAt: temporalNextRunAt(j),

    events: Array.isArray(j.events) ? j.events : [],

  };

}

function normalizeFlowOptions(raw) {
  if (raw == null)
    return {};

  if (typeof raw !== "object" || Array.isArray(raw))
    throw Object.assign(new Error("flowOptions deve ser um objeto."), {
      code: "invalid_flow_options",
    });

  const out = {};

  if (raw.dryRun === true)
    out.dryRun = true;

  if (raw.forceScan === true)
    out.forceScan = true;

  if (raw.skipPreflightConfirm === true)
    out.skipPreflightConfirm = true;

  if (raw.forcePolicyBypass === true)
    out.forcePolicyBypass = true;

  if (raw.disableGovernance === true)
    out.disableGovernance = true;

  if (raw.policyProfile != null && String(raw.policyProfile).trim())
    out.policyProfile = String(raw.policyProfile).trim();

  return out;

}

/** @param {URL} url @param {string} repoRootAbs */
function parseQueueProjectFilters(url, repoRootAbs) {
  const projectIdParam = url.searchParams.get("projectId");

  const projectRootParam = url.searchParams.get("projectRoot");

  let projectId =
    projectIdParam != null && String(projectIdParam).trim()
      ? String(projectIdParam).trim()
      : null;

  let projectRootCanonical = null;

  if (projectRootParam != null && String(projectRootParam).trim()) {
    const r = resolveProjectSelector(String(projectRootParam).trim(), repoRootAbs);

    projectRootCanonical = r.projectRootCanonical;

    if (!projectId && r.projectId) projectId = r.projectId;
  }

  if (projectId && !/^proj_/i.test(projectId)) {
    const r = resolveProjectSelector(projectId, repoRootAbs);

    if (r.projectId) projectId = r.projectId;

    projectRootCanonical = projectRootCanonical || r.projectRootCanonical;
  } else if (projectId && /^proj_/i.test(projectId)) {
    const suf = projectId.replace(/^proj_/i, "").toLowerCase().slice(0, 8);

    projectId = `proj_${suf}`;
      }

  return { projectId, projectRootCanonical };
}

/** @param {object} j @param {{ projectId?: string|null, projectRootCanonical?: string|null }} f */
function jobMatchesProjectFilters(j, f) {
  if (!f || (!f.projectId && !f.projectRootCanonical)) return true;

  const pid =
    j.projectId != null && String(j.projectId).trim()
      ? String(j.projectId).trim()
      : j.projectRoot
        ? deriveProjectId(String(j.projectRoot))
        : null;

  if (f.projectId && pid !== f.projectId) return false;

  if (f.projectRootCanonical) {
    const c = canonicalProjectRoot(String(j.projectRoot || ""));

    if (c !== f.projectRootCanonical) return false;
  }

  return true;
}

/** @param {{ jobs: object[] }} queue */
function buildMultiProjectStatus(queue) {
  const overview = buildProjectsOverview(queue.jobs);

  const stuckIds = new Set(listSuspectStuckJobIds(queue));

  let active = 0;

  let withPendingJobs = 0;

  let withStuckJobs = 0;

  for (const row of overview) {
    const pid = row.projectId;

    const subset = queue.jobs.filter((j) =>
      jobMatchesProjectFilters(j, { projectId: pid, projectRootCanonical: null }),
    );

    if (subset.some((j) => String(j.status || "") === "running")) active += 1;

    if (subset.some((j) => String(j.status || "") === "pending")) withPendingJobs += 1;

    if (subset.some((j) => stuckIds.has(String(j.id)))) withStuckJobs += 1;
  }

  return {
    total: overview.length,

    active,

    withPendingJobs,

    withStuckJobs,
  };
}

/**
 * @param {string} projectIdNorm
 * @param {{ jobs: object[] }} queue
 * @param {DaemonSnapshot} snap
 */
function buildProjectDetailBundle(projectIdNorm, queue, snap) {
  const jobs = queue.jobs.filter((j) =>
    jobMatchesProjectFilters(j, { projectId: projectIdNorm, projectRootCanonical: null }),
  );

  const reg = findProjectRecord(projectIdNorm);

  const running = jobs.find((j) => String(j.status || "") === "running") || null;

  const sorted = [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const nowMs = Date.now();

  /** @type {Record<string, number>} */
  const byStatus = {};

  let delayed = 0;

  let scheduled = 0;

  let recurring = 0;

  let stuck = 0;

  let retryable = 0;

  for (const j of jobs) {
    const st = String(j.status || "") || "unknown";

    byStatus[st] = (byStatus[st] || 0) + 1;

    if (jobIsDelayedPending(j)) delayed += 1;

    if (
      st === "pending" &&
      j.availableAt &&
      Number.isFinite(parseIsoMs(String(j.availableAt))) &&
      parseIsoMs(String(j.availableAt)) > nowMs
    )
      scheduled += 1;

    if (jobHasRecurring(j)) recurring += 1;

    if (jobRecordLooksStuck(j)) stuck += 1;

    if (jobIsRetryable(j)) retryable += 1;
  }

  const scheduledJobs = jobs
    .filter((j) => {
      if (String(j.status || "") !== "pending") return false;

      if (!j.availableAt) return false;

      const t = parseIsoMs(String(j.availableAt));

      return Number.isFinite(t) && t > nowMs;
    })

    .map(summarizeJob);

  const retryableJobs = jobs.filter((j) => jobIsRetryable(j)).map(summarizeJob);

  const stuckJobs = jobs.filter((j) => jobRecordLooksStuck(j)).map(summarizeJob);

  const rootGuess = reg?.projectRoot || jobs[0]?.projectRoot || null;

  const pendingN = jobs.filter((j) => String(j.status || "") === "pending").length;

  const runningN = jobs.filter((j) => String(j.status || "") === "running").length;

  return {
    projectId: projectIdNorm,

    projectRoot: rootGuess,

    displayName:
      reg?.displayName ||
      (rootGuess ? path.basename(String(rootGuess)) : null),

    registry: reg,

    activeWorkers: runningN,

    runningJobs: runningN,

    queueDepth: pendingN,

    counts: {
      byStatus,

      delayed,

      scheduled,

      recurring,

      stuck,

      retryable,

    },

    recentJobs: sorted.slice(0, 25).map(summarizeJob),

    runningJob: running ? jobDetailEnvelope(running, snap) : null,

    scheduledJobs,

    retryableJobs,

    stuckJobs,
  };
}

/**
 * @param {{
 *   getDaemonSnapshot: () => DaemonSnapshot,
 *   repoRoot?: string,
 *   requestRunningTerminate?: RunningTerminateHook,
 * }} deps
 */
function createRuntimeApiServer(deps) {
  const repoRoot = deps.repoRoot || getSetupBossRepoRoot();

  /** @type {http.Server} */

  const server = http.createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      const msg = String((err && err.message) || err);

      sendJson(res, 500, errorPayload("internal_error", msg));
    });
  });

  const reqTimeoutMs = Number(
    process.env.SETUP_BOSS_RUNTIME_API_REQUEST_TIMEOUT_MS || 30000,
  );

  if (Number.isFinite(reqTimeoutMs) && reqTimeoutMs > 0) {
    server.requestTimeout = reqTimeoutMs;

    server.headersTimeout = Math.min(Math.max(reqTimeoutMs, 8000), 120000);
  }

  async function handleRequest(req, res) {
    if (!isLocalSocket(req.socket)) {
      sendJson(res, 403, errorPayload("forbidden", "Acesso apenas a partir de localhost."));

      return;

    }

    const url = new URL(req.url || "/", `http://${RUNTIME_API_HOST}`);

    const p = normalizePath(url.pathname);

    try {
      if (req.method === "GET" && p === "/health") {
        const snap = deps.getDaemonSnapshot();

        const uptimeMs =
          snap.startedAt && Number.isFinite(Date.parse(snap.startedAt))
            ? Math.max(0, Date.now() - Date.parse(snap.startedAt))
            : null;

        sendJson(res, 200, {
          ok: true,

          daemon: snap.running !== false ? "running" : "stopped",

          pid: typeof snap.pid === "number" ? snap.pid : null,

          uptimeMs,
        });

        return;

      }

      if (req.method === "GET" && p === "/status") {
        const snap = deps.getDaemonSnapshot();

        const q = loadQueueUnsafe();

        const qc = countsByStatus(q);

        const uptimeMsApprox =
          snap.startedAt && Number.isFinite(Date.parse(snap.startedAt))
            ? Math.max(0, Date.now() - Date.parse(snap.startedAt))
            : null;

        const diskStatus = readDaemonStatus();

        const qValid = validateQueueStrict();

        const stuckIds = listSuspectStuckJobIds(q);

        const retryableN = countRetryableJobs(q);

        sendJson(res, 200, {
          ok: true,

          data: {
            running: snap.running !== false,

            pid: typeof snap.pid === "number" ? snap.pid : null,

            startedAt: snap.startedAt ?? null,

            uptimeMsApprox,

            daemonVersion:
              diskStatus &&
              typeof diskStatus.daemonVersion === "string" &&
              diskStatus.daemonVersion.trim()
                ? diskStatus.daemonVersion.trim()
                : null,

            processedJobs:
              diskStatus &&
              typeof diskStatus.processedJobs === "number" &&
              Number.isFinite(diskStatus.processedJobs)
                ? diskStatus.processedJobs
                : null,

            scheduler:
              diskStatus &&
              diskStatus.scheduler &&
              typeof diskStatus.scheduler === "object"
                ? diskStatus.scheduler
                : null,

            worker: {
              busy: Boolean(snap.busy),

              currentJobId:
                snap.busy && snap.currentJobId ? snap.currentJobId : null,

              currentPhase:
                diskStatus &&
                diskStatus.worker &&
                typeof diskStatus.worker.currentPhase === "string" &&
                diskStatus.worker.currentPhase.trim()
                  ? diskStatus.worker.currentPhase.trim()
                  : null,

              lastPipelineEventAt:
                diskStatus &&
                diskStatus.worker &&
                typeof diskStatus.worker.lastPipelineEventAt === "string"
                  ? diskStatus.worker.lastPipelineEventAt
                  : null,
            },

            workers:
              snap.workers && typeof snap.workers === "object" ? snap.workers : null,

            workerList:
              Array.isArray(snap.workerList) ? snap.workerList : [],

            runningJobs:
              Array.isArray(snap.runningJobs) ? snap.runningJobs : [],

            runningJobsCount:
              diskStatus &&
              typeof diskStatus.runningJobsCount === "number" &&
              Number.isFinite(diskStatus.runningJobsCount)
                ? diskStatus.runningJobsCount
                : Array.isArray(snap.runningJobs)
                  ? snap.runningJobs.length
                  : null,

            concurrency:
              snap.concurrency && typeof snap.concurrency === "object"
                ? snap.concurrency
                : null,

            queue: {
              pending: qc.pending || 0,

              running: qc.running || 0,

              completed: qc.completed || 0,

              failed: qc.failed || 0,

              cancelled: qc.cancelled || 0,

              stuckSuspected: stuckIds.length,

              retryable: retryableN,

              health: qValid.ok ? "ok" : "degraded",
            },

            projects: buildMultiProjectStatus(q),

            lastError:
              typeof snap.lastError === "string" ? snap.lastError : null,

            updatedAt: new Date().toISOString(),
          },

        });

        return;

      }

      if (req.method === "GET" && p === "/projects") {
        const overview = buildProjectsOverview(loadQueueUnsafe().jobs);

        const data = overview.map((r) => ({
          projectId: r.projectId,

          projectRoot: r.projectRoot,

          displayName: r.displayName,

          jobCounts: r.jobCounts && typeof r.jobCounts === "object" ? r.jobCounts : {},

          lastSeenAt: r.lastSeenAt || null,
        }));

        sendJson(res, 200, { ok: true, data });

        return;
      }

      const projectDetail = /^\/projects\/([^/]+)$/.exec(p);

      if (req.method === "GET" && projectDetail) {
        const rawSeg = decodeURIComponent(projectDetail[1]);

        const resolved = resolveProjectSelector(rawSeg, repoRoot);

        if (!resolved.projectId) {
          sendJson(res, 400, errorPayload("invalid_request", "projectId ou caminho inválido."));

          return;
        }

        const q = loadQueueUnsafe();

        const bundle = buildProjectDetailBundle(
          resolved.projectId,
          q,
          deps.getDaemonSnapshot(),
        );

        if (
          !bundle.registry &&

          !bundle.recentJobs.length &&

          !bundle.projectRoot
        ) {
          sendJson(res, 404, errorPayload("not_found", `Projeto não encontrado: ${resolved.projectId}`));

          return;
        }

        sendJson(res, 200, { ok: true, data: bundle });

        return;
      }

      if (req.method === "GET" && p === "/queue") {
        const statusFilter = url.searchParams.get("status");

        const delayedFilter = url.searchParams.get("delayed");

        const recurringFilter = url.searchParams.get("recurring");

        const limitRaw = url.searchParams.get("limit");

        let limit = 100;

        if (limitRaw != null && limitRaw !== "") {
          const n = Number(limitRaw);

          if (!Number.isFinite(n) || n < 1 || n > 500)
            limit = 100;

          else limit = Math.floor(n);

        }

        const q = loadQueueUnsafe();

        const pf = parseQueueProjectFilters(url, repoRoot);

        let rowsRaw =
          statusFilter && String(statusFilter).trim()


            ? listSorted(q).filter(
              (j) => j.status === String(statusFilter).trim(),


            )


            : listSorted(q);

        if (delayedFilter === "1" || delayedFilter === "true")
          rowsRaw = rowsRaw.filter((j) => jobIsDelayedPending(j));

        if (recurringFilter === "1" || recurringFilter === "true")

          rowsRaw = rowsRaw.filter((j) => jobHasRecurring(j));

        rowsRaw = rowsRaw.filter((j) => jobMatchesProjectFilters(j, pf));

        let rows = rowsRaw.map(summarizeJob);

        rows = rows.slice(-limit);

        sendJson(res, 200, {
          ok: true,

          data: {
            jobs: rows,

            limit,

          },

        });

        return;

      }
      if (req.method === "GET" && p === "/events") {
        const jobIdParam = url.searchParams.get("jobId");

        const after = url.searchParams.get("after");

        const limRaw = url.searchParams.get("limit");

        let projectIdParam = url.searchParams.get("projectId");

        if (projectIdParam != null && String(projectIdParam).trim()) {
          const r = resolveProjectSelector(String(projectIdParam).trim(), repoRoot);

          if (r.projectId) projectIdParam = r.projectId;
        }

        let limit = 200;

        if (limRaw != null && limRaw !== "") {
          const n = Number(limRaw);

          if (Number.isFinite(n) && n >= 1 && n <= 500) limit = Math.floor(n);
        }

        const rows = readRuntimeEventsFiltered({
          jobId:
            jobIdParam != null && String(jobIdParam).trim()
              ? String(jobIdParam).trim()
              : null,
          projectId:
            projectIdParam != null && String(projectIdParam).trim()
              ? String(projectIdParam).trim()
              : null,
          after: after != null && String(after).trim() ? String(after).trim() : null,
          limit,
        });

        sendJson(res, 200, { ok: true, data: rows });

        return;
      }



      const jobCancel = /^\/jobs\/([^/]+)\/cancel$/.exec(p);

      if (req.method === "POST" && jobCancel) {
        const jobId = jobCancel[1];

        let rawCancel = "";

        try {
          rawCancel = await readBodyLimited(req, MAX_JSON_BODY_BYTES);

        } catch (e) {
          if (e && e.code === "payload_too_large") {


            sendJson(


              res,



              413,



              errorPayload(
                "payload_too_large",
                "Corpo JSON excede o limite permitido.",



              ),

            );

            return;

          }

          throw e;

        }

        /** @type {Record<string, unknown>} */


        let cancelBody = {};

        if (rawCancel && rawCancel.trim()) {


          try {


            cancelBody = JSON.parse(rawCancel);


          } catch (_) {


            cancelBody = {};


          }

        }


        const reason =


          cancelBody.reason != null && String(cancelBody.reason).trim()


            ? String(cancelBody.reason).trim()


            : null;

        const job = loadQueueUnsafe().jobs.find((x) => x.id === jobId);

        if (!job) {
          sendJson(res, 404, errorPayload("not_found", `Job não encontrado: ${jobId}`));

          return;

        }

        const st = String(job.status || "");

        if (st === "completed") {
          sendJson(res, 409, {
            ok: false,
            outcome: "already_completed",
            error: errorPayload(
              "already_completed",
              "Este job já terminou com sucesso; não pode ser cancelado.",
            ).error,
          });
          return;
        }

        if (st === "cancelled") {
          sendJson(res, 200, {
            ok: true,
            data: {
              jobId,
              outcome: "already_cancelled",
              status: "cancelled",
            },
          });
          return;
        }

        if (st === "cancelling") {
          sendJson(res, 200, {
            ok: true,
            data: {
              jobId,
              outcome: "cancellation_already_requested",
              status: "cancelling",
            },
          });
          return;
        }

        const nowIso = new Date().toISOString();

        if (st === "pending") {
          updateJob(undefined, jobId, (j) => ({
            ...j,
            status: "cancelled",
            finishedAt: nowIso,
            cancel_requested: false,
            cancellationRequestedAt: null,
            cancellation_reason: reason,
            error: {
              code: "job_cancelled",
              message:
                reason || "Job cancelado via Runtime API antes da execução.",
            },
            events: appendJobEvent(j, "cancelled", { phase: "pending" }),
          }));

          try {
            emitRuntimeEvent({
              type: "job_cancelled",
              jobId,
              runId: job.runId ?? null,
              data: { via: "runtime_api", phase: "pending" },
            });
          } catch (_) {
            /* */
          }

          sendJson(res, 200, {
            ok: true,
            data: {
              jobId,
              outcome: "cancelled",
              status: "cancelled",
            },
          });
          return;
        }

        if (st === "blocked" || st === "failed" || st === "failed_cancel") {
          sendJson(res, 409, {
            ok: false,
            outcome: "invalid_state",
            error: errorPayload(
              "invalid_state",
              `Estado atual do job (${st}) não admite cancelamento.`,
            ).error,
          });
          return;
        }

        if (st !== "running") {
          sendJson(res, 409, {
            ok: false,
            outcome: "invalid_state",
            error: errorPayload(
              "invalid_state",
              `Job não aceita cancelamento aqui (estado: ${st}).`,
            ).error,
          });
          return;
        }

        const snap = deps.getDaemonSnapshot();

        const runningJobsSnap = Array.isArray(snap.runningJobs)
          ? snap.runningJobs
          : [];

        const matchesWorker = runningJobsSnap.some(
          (r) => r && r.jobId != null && String(r.jobId) === String(jobId),
        );

        const matchesPrimary =
          snap.currentJobId != null &&
          String(snap.currentJobId) === String(jobId);

        if (!matchesPrimary && !matchesWorker) {
          sendJson(res, 409, {
            ok: false,
            outcome: "worker_mismatch",
            error: errorPayload(
              "worker_mismatch",
              "Worker atual não coincide com este job; SIGTERM não enviado.",
            ).error,
          });
          return;
        }

        updateJob(undefined, jobId, (j) => ({
          ...j,
          status: "cancelling",
          cancel_requested: true,
          cancellationRequestedAt: nowIso,
          cancellation_reason:
            reason != null
              ? reason
              : typeof j.cancellation_reason === "string"
                ? j.cancellation_reason
                : null,
          events: appendJobEvent(j, "cancellation_requested", {
            ...(reason ? { reason } : {}),
          }),
        }));

        try {
          emitRuntimeEvent({
            type: "job_cancel_requested",
            jobId,
            runId: job.runId ?? null,
            data: reason ? { reason } : {},
          });
        } catch (_) {
          /* */
        }

        /** @type {{ ok?: boolean, pendingSpawn?: boolean, reason?: string }} */
        let term = {};
        if (typeof deps.requestRunningTerminate === "function") {
          term = deps.requestRunningTerminate(jobId) || {};
        }

        const termOk = term.ok === true || term.pendingSpawn === true;

        if (typeof deps.requestRunningTerminate === "function" && !termOk) {
          updateJob(undefined, jobId, (j) => ({
            ...j,
            status: "failed_cancel",
            finishedAt: new Date().toISOString(),
            error: {
              code: "failed_cancel",
              message: term.reason
                ? "Falha ao enviar cancelamento (" + String(term.reason) + ")."
                : "Falha ao enviar SIGTERM ao processo filho.",
            },
            events: appendJobEvent(j, "failed_cancel", {
              reason: typeof term.reason === "string" ? term.reason : null,
            }),
          }));

          sendJson(res, 500, {
            ok: false,
            outcome: "failed_cancel",
            error: errorPayload(
              "failed_cancel",
              "Não foi coordenado o cancelamento cooperativo neste servidor.",
            ).error,
          });

          return;
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            jobId,
            outcome: "cancellation_requested",
            status: "cancelling",
          },
        });

        return;

      }

      const jobRetry = /^\/jobs\/([^/]+)\/retry$/.exec(p);

      if (req.method === "POST" && jobRetry) {
        const jobId = jobRetry[1];

        let rawRetry = "";

        try {
          rawRetry = await readBodyLimited(req, MAX_JSON_BODY_BYTES);

        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,

              413,

              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),

            );

            return;

          }

          throw e;

        }

        /** @type {Record<string, unknown>} */
        let retryBody = {};

        if (rawRetry && rawRetry.trim()) {
          try {
            retryBody = JSON.parse(rawRetry);

          } catch (_) {
            retryBody = {};

          }

        }

        const delayMs =
          retryBody.delayMs != null && Number.isFinite(Number(retryBody.delayMs))
            ? Number(retryBody.delayMs)

            : undefined;

        const r = requestJobRetry(jobId, { delayMs });

        if (!r.ok && r.code === "not_found") {
          sendJson(res, 404, errorPayload("not_found", `Job não encontrado: ${jobId}`));

          return;

        }

        if (!r.ok) {
          try {
            emitRuntimeEvent({
              type: "job_retry_rejected",

              jobId,

              runId: r.job && r.job.runId ? r.job.runId : null,

              data: { code: r.code, reason: r.reason || null },
            });

          } catch (_) {
            /* */
          }

          sendJson(res, 409, {
            ok: false,

            error: errorPayload(
              "not_retryable",

              "Job não permite novo pedido de execução (estado ou tentativas esgotadas).",

            ).error,

            data: { code: r.code },
          });

          return;

        }

        try {
          emitRuntimeEvent({
            type: "job_retry_requested",

            jobId,

            runId: r.job.runId ?? null,

            data: { lastAttemptAt: r.job.lastAttemptAt ?? null },
          });

          emitRuntimeEvent({
            type: "job_requeued",

            jobId,

            runId: null,

            data: { lastAttemptAt: r.job.lastAttemptAt ?? null },
          });

        } catch (_) {
          /* */
        }

        sendJson(res, 200, {
          ok: true,

          data: {

            jobId,

            status: "pending",

            lastAttemptAt: r.job.lastAttemptAt ?? null,

            availableAt: r.job.availableAt ?? null,

            delayMs: r.job.delayMs ?? null,

          },
        });

        return;

      }

      const jobGet = /^\/jobs\/([^/]+)$/.exec(p);

      if (req.method === "GET" && jobGet) {
        const jobId = jobGet[1];

        const q = loadQueueUnsafe();

        const job = q.jobs.find((x) => x.id === jobId);

        if (!job) {
          sendJson(res, 404, errorPayload("not_found", `Job não encontrado: ${jobId}`));

          return;

        }

        sendJson(res, 200, {
          ok: true,

          data: jobDetailEnvelope(job, deps.getDaemonSnapshot()),

        });

        return;

      }

      if (req.method === "POST" && p === "/jobs") {
        let rawBody = "";

        try {
          rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,

              413,

              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),

            );

            return;

          }

          throw e;

        }

        let body = {};

        if (rawBody && rawBody.trim()) {
          try {
            body = JSON.parse(rawBody);
          } catch (_) {
            sendJson(
              res,

              400,

              errorPayload("invalid_json", "Corpo não é JSON válido."),
            );

            return;

          }

        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          sendJson(res, 400, errorPayload("invalid_request", "Body deve ser um objeto JSON."));

          return;

        }

        const taskPath = body.taskPath;

        const projectPath = body.projectPath;

        if (
          typeof taskPath !== "string" ||
          !taskPath.trim() ||
          typeof projectPath !== "string" ||
          !projectPath.trim()
        ) {
          sendJson(
            res,

            400,

            errorPayload(
              "invalid_request",

              "Campos obrigatórios: taskPath (string) e projectPath (string).",


            ),

          );

          return;

        }

        let flowOpts = {};

        try {
          flowOpts = normalizeFlowOptions(body.flowOptions);
        } catch (e) {
          sendJson(
            res,

            400,

            errorPayload(
              String(e.code || "invalid_flow_options"),

              String((e && e.message) || e),

            ),

          );

          return;

        }

        const taskArg = String(taskPath).trim();

        const projectArg = String(projectPath).trim();

        const taskAbs = path.resolve(repoRoot, taskArg);

        if (!fs.existsSync(taskAbs)) {
          sendJson(
            res,

            400,

            errorPayload("invalid_task_path", `Task não encontrada: ${taskAbs}`),

          );

          return;

        }

        const projectRoot = path.resolve(repoRoot, projectArg);


        let mergedMeta = {};

        if (
          body.metadata &&

          typeof body.metadata === "object" &&


          !Array.isArray(body.metadata)


        )


          mergedMeta = { ...body.metadata };



        if (!(mergedMeta.source && String(mergedMeta.source).trim()))


          mergedMeta.source = "runtime_api";

        let job;

        try {

          job = enqueueJob({
            projectRoot,

            taskArg,

            projectArg,

            flowOptions: flowOpts,

            metadata: mergedMeta,

            delayMs:
              body.delayMs != null && Number.isFinite(Number(body.delayMs))
                ? Number(body.delayMs)

                : undefined,

            scheduledAt:
              body.scheduledAt != null && String(body.scheduledAt).trim()
                ? String(body.scheduledAt).trim()

                : undefined,

            recurring:

              body.recurring && typeof body.recurring === "object" && !Array.isArray(body.recurring)
                ? body.recurring

                : undefined,

          });

        } catch (e) {


          const code = String((e && /** @type {any} */ (e).code) || "invalid_schedule");



          sendJson(
            res,

            400,

            errorPayload(code, String((e && e.message) || e)),

          );

          return;

        }

        sendJson(res, 201, {
          ok: true,

          jobId: job.id,

          availableAt: job.availableAt ?? null,

          scheduledAt: job.scheduledAt ?? null,

          recurring: job.recurring ?? null,

        });

        return;

      }

      if (req.method === "POST" && p === "/maintenance/queue/prune") {
        let rawMp = "";

        try {
          rawMp = await readBodyLimited(req, MAX_JSON_BODY_BYTES);

        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,

              413,

              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),

            );

            return;

          }

          throw e;

        }

        /** @type {Record<string, unknown>} */

        let mpBody = {};

        if (rawMp && rawMp.trim()) {
          try {
            mpBody = JSON.parse(rawMp);

          } catch (_) {
            mpBody = {};

          }

        }

        const maxAgeMsRaw = mpBody.maxAgeMs;

        const minKeepRaw = mpBody.minKeep;

        const maxAgeMs =


          maxAgeMsRaw != null && Number.isFinite(Number(maxAgeMsRaw))


            ? Number(maxAgeMsRaw)


            : undefined;

        const minKeep =


          minKeepRaw != null && Number.isFinite(Number(minKeepRaw))


            ? Number(minKeepRaw)


            : undefined;

        const dryRun = mpBody.dryRun === true;

        const result = pruneQueueTerminalJobs({ maxAgeMs, minKeep, dryRun });

        try {
          emitRuntimeEvent({
            type: "maintenance_queue_pruned",

            jobId: null,

            runId: null,

            data: /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (result)),


          });

        } catch (_) {
          /* */
        }

        sendJson(res, 200, { ok: true, data: result });

        return;

      }

      if (req.method === "POST" && p === "/maintenance/events/prune") {
        let rawEp = "";

        try {
          rawEp = await readBodyLimited(req, MAX_JSON_BODY_BYTES);

        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,

              413,

              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),

            );

            return;

          }

          throw e;

        }

        /** @type {Record<string, unknown>} */

        let epBody = {};

        if (rawEp && rawEp.trim()) {
          try {
            epBody = JSON.parse(rawEp);

          } catch (_) {
            epBody = {};

          }

        }

        const maxBytes =


          epBody.maxBytes != null && Number.isFinite(Number(epBody.maxBytes))


            ? Number(epBody.maxBytes)


            : undefined;

        const keepLines =


          epBody.keepLines != null && Number.isFinite(Number(epBody.keepLines))


            ? Number(epBody.keepLines)


            : undefined;

        const force = epBody.force === true;

        const er = pruneRuntimeEventsFile({ maxBytes, keepLines, force });

        try {
          emitRuntimeEvent({
            type: "maintenance_events_pruned",

            jobId: null,

            runId: null,

            data: /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (er)),


          });

        } catch (_) {
          /* */
        }

        sendJson(res, 200, { ok: true, data: er });

        return;

      }

      if (req.method === "OPTIONS" && (p === "/health" || p === "/status" || p === "/projects" || p.startsWith("/projects/") || p.startsWith("/jobs") || p === "/queue" || p === "/events" || p.startsWith("/maintenance"))) {
        res.writeHead(204, {
          Allow: "GET,POST,OPTIONS",
        });

        res.end();

        return;

      }

      sendJson(res, 404, errorPayload("not_found", "Rota não encontrada."));
    } catch (e) {
      const msg = String((e && e.message) || e);

      sendJson(res, 500, errorPayload("internal_error", msg));
    }
  }

  return { server, host: RUNTIME_API_HOST, resolvePort: resolveRuntimeApiPort };
}

function closeServerAsync(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);

      else resolve();
    });

  });

}

module.exports = {
  createRuntimeApiServer,

  closeServerAsync,

  resolveRuntimeApiPort,

  RUNTIME_API_HOST,

  DEFAULT_RUNTIME_API_PORT,

  MAX_JSON_BODY_BYTES,

  _test: {
    summarizeJob,

    detailJob,

    normalizeFlowOptions,

    normalizePath,

    jobDetailEnvelope,

    workerHintsForJob,

  },
};
