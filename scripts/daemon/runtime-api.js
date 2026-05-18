/**
 * Runtime API local (Fase 3.2): HTTP mínimo integrado ao daemon.
 * Bind obrigatório em 127.0.0.1 — não expor em rede.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const {
  runWithTraceContext,
  appendRuntimeTrace,
  mergeTraceContext,
  generateRequestId,
} = require("../runtime-observability/runtime-trace");
const { getSetupBossRepoRoot } = require("./lib/repo-root");
const {
  loadQueueUnsafe,

  enqueueJob,

  listSorted,

  updateJob,

  removeJobFromQueueByKey,

  purgeJobsForProjectId,

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
  computePublicProjectsList,
  demoProjectsEnabled,
  resolveProjectSelector,
  findProjectRecord,
  canonicalProjectRoot,
  deriveProjectId,
  upsertProjectFromUsage,
  removeProjectRecordById,
  discoverManagedProjectRows,
} = require("./lib/project-registry");

const {
  loadRunArchiveUnsafe,
  isJobArchived,
  archiveJobRecord,
  removeArchiveEntriesForJob,
  removeArchiveEntriesForRunId,
} = require("./lib/run-archive");
const {
  parseRunDeleteKey,
  deleteRunIndexArtifact,
} = require("./lib/run-artifact-delete");

const { getManagedProjectsRoot } = require("./lib/daemon-paths");
const {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
} = require("./lib/workspace-registry");
const {
  createWorkspaceRun,
  listWorkspaceRuns,
  getWorkspaceRun,
  updateWorkspaceRun,
  deleteWorkspaceRun,
  addMiniActivity,
  updateMiniActivity,
  deleteMiniActivity,
} = require("./lib/workspace-run-registry");
const {
  startWorkspaceRun,
  resumeWorkspaceRun,
  retryMiniActivity,
  skipMiniActivity,
} = require("./lib/workspace-run-orchestrator");
const {
  prepareWorkspaceRunGit,
  retryPrepareWorkspaceGitProject,
  getWorkspaceRunGitStatus,
} = require("./lib/workspace-run-git-api");
const { registerOrUpdateGitProject } = require("./lib/project-git-register");
const { listSyntheticJobsFromRunIndex } = require("./lib/project-run-index");
const { dedupeJobsByRunId } = require("./lib/dedupe-jobs-by-run-id");

const { readDaemonStatus } = require("./lib/daemon-status");
const { buildRuntimeHeartbeat } = require("./lib/runtime-heartbeat");

const { resolveOutputDir } = require("../../core/run-resolver");

const {
  collectRunEvidence,
  readArtifactContent,
  resolveRunIdForEvidence,
} = require("./lib/run-evidence");

const {
  collectClarificationForRun,
  runClarificationMutation,
} = require("./lib/run-clarification");

const {
  collectPlanCommentsForRun,
  submitPlanCommentForRun,
  submitPlanCommentAnswersForRun,
} = require("./lib/run-plan-comments");

const {
  collectPlanPresentationBaseForRun,
  upsertPlanPresentationBaseForRun,
} = require("./lib/run-plan-presentation-base");

const { collectStrategyForRun } = require("./lib/run-strategy");

const { triggerStrategyRun } = require("./lib/run-strategy-api");

const { collectExecutionForRun } = require("./lib/run-execution");

const { createRunFromTask } = require("./lib/run-intake-api");
const {
  recordPreRunFailed,
  readPreRunDiagnosticEvents,
} = require("./lib/pre-run-observability");
const {
  buildProjectGovernanceReport,
  resolveGovernanceProject,
} = require("./lib/project-governance-api");

const {
  triggerRunExecution,
  collectOrchestrationBootstrap,
} = require("./lib/run-execute-api");

const {
  getOperationalReviewSession,
  confirmOperationalReview,
  requestOperationalReviewAdjustment,
} = require("./lib/run-operational-review-api");

const {
  getOperationalFinalizationSession,
  finalizeOperationalActivity,
  requestOperationalFinalAdjustment,
} = require("./lib/run-operational-finalization-api");

const { prepareRunGitBranch } = require("./lib/run-git-branch-api");
const { pushRunGitBranch } = require("./lib/run-git-push-api");
const { resolveRunGitUiEnvelope } = require("./lib/run-git-ui-envelope");

const { buildRuntimeRecoverySnapshot } = require("./lib/run-runtime-rehydration");

const {
  readRuntimeEventsFiltered,
  emitRuntimeEvent,
  pruneRuntimeEventsFile,
  subscribeRuntimeEventListener,
} = require("./lib/runtime-events");

const {
  subscribeWorkspaceRunSseListener,
  notifyWorkspaceRunSse,
} = require("./lib/workspace-run-sse");

const { resetWorkspaceRunSyncBackoff } = require("./lib/workspace-run-sync");

const {
  getSseObservabilityMetrics,
  registerSseStreamClient,
  unregisterSseStreamClient,
  recordSseEventEmitted,
} = require("./lib/sse-observability");

const { buildRunObservabilityBundle } = require("./lib/run-observability-bundle");

const runtimeLogger = require("../runtime/logger");

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

function errorPayload(code, message, extras = {}) {
  return {
    ok: false,

    error: {
      code,

      message,
      ...extras,
    },

  };
}

/**
 * @param {Record<string, unknown>} rawError
 * @param {{
 *   requestId: string,
 *   projectId?: string|null,
 *   projectRoot?: string|null,
 * }} ctx
 */
function preRunHttpErrorPayload(rawError, ctx) {
  const structured = recordPreRunFailed({
    requestId: ctx.requestId,
    projectId: ctx.projectId,
    projectRoot: ctx.projectRoot,
    component: "runtime_api",
    error: rawError,
  });
  return {
    ok: false,
    error: structured,
  };
}

function writeSseEvent(res, eventName, payload, opts = {}) {
  const body = JSON.stringify(payload);
  res.write(`event: ${eventName}\ndata: ${body}\n\n`);
  if (!opts.skipMetrics && eventName && eventName !== "heartbeat") {
    recordSseEventEmitted();
  }
}

/**
 * GET /events/stream — SSE read-only (heartbeat + runtime_event).
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {URL} url
 * @param {string} repoRoot
 */
function handleEventsStream(req, res, url, repoRoot) {
  let projectIdParam = url.searchParams.get("projectId");
  const workspaceIdParamRaw = url.searchParams.get("workspaceId");
  const workspaceIdParam =
    workspaceIdParamRaw != null && String(workspaceIdParamRaw).trim()
      ? String(workspaceIdParamRaw).trim()
      : null;

  if (projectIdParam != null && String(projectIdParam).trim()) {
    const r = resolveProjectSelector(String(projectIdParam).trim(), repoRoot);
    if (r.projectId) projectIdParam = r.projectId;
  } else {
    projectIdParam = null;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.write(": stream-open\n\n");

  registerSseStreamClient();

  runtimeLogger.info("runtime.sse.connect", {
    projectId: projectIdParam,
    userAgent: req.headers["user-agent"]
      ? String(req.headers["user-agent"]).slice(0, 160)
      : null,
  });

  writeSseEvent(res, "connected", {
    ok: true,
    ts: new Date().toISOString(),
    projectId: projectIdParam,
    workspaceId: workspaceIdParam,
  });

  /** @param {import('./lib/workspace-run-sse').WorkspaceRunSsePayload} wsEvt */
  const onWorkspaceRunEvent = (wsEvt) => {
    if (workspaceIdParam) {
      const wid =
        wsEvt.workspaceId != null && String(wsEvt.workspaceId).trim()
          ? String(wsEvt.workspaceId).trim()
          : null;
      if (wid && wid !== workspaceIdParam) return;
    }
    try {
      writeSseEvent(res, wsEvt.eventType, { ok: true, ...wsEvt });
    } catch (_) {
      /* cliente desligou */
    }
  };

  /** @param {import('./lib/runtime-events').RuntimeEventRow} evt */
  const onEvent = (evt) => {
    if (projectIdParam) {
      const pid =
        evt.projectId != null && String(evt.projectId).trim()
          ? String(evt.projectId).trim()
          : null;
      if (pid && pid !== projectIdParam) return;
    }
    try {
      writeSseEvent(res, "runtime_event", { ok: true, event: evt });
    } catch (_) {
      /* cliente desligou */
    }
  };

  const unsub = subscribeRuntimeEventListener(onEvent);
  const unsubWs = subscribeWorkspaceRunSseListener(onWorkspaceRunEvent);

  const heartbeatMs = 25_000;
  const heartbeat = setInterval(() => {
    try {
      writeSseEvent(res, "heartbeat", { ts: new Date().toISOString() });
    } catch (_) {
      clearInterval(heartbeat);
    }
  }, heartbeatMs);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(heartbeat);
    unsub();
    unsubWs();
    unregisterSseStreamClient();
    runtimeLogger.info("runtime.sse.disconnect", {
      projectId: projectIdParam,
      workspaceId: workspaceIdParam,
    });
  };

  req.on("close", cleanup);
  req.on("aborted", cleanup);
  res.on("close", cleanup);
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

function clampActivityStr(s, n) {
  const t = String(s || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

/** @param {object} j */
function deriveActivityTitle(j) {
  const meta =
    j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
      ? j.metadata
      : {};

  const pick =
    meta.displayTitle ??
    meta.activityTitle ??
    meta.taskTitle ??
    meta.task_title ??
    meta.summary ??
    meta.taskSummary;

  if (typeof pick === "string" && pick.trim()) {
    return clampActivityStr(pick.trim(), 60);
  }

  const taskArg = j.taskArg != null ? String(j.taskArg) : "";
  if (taskArg) {
    const base = path.basename(taskArg.replace(/\\/g, "/"));

    if (/\.md$/i.test(base)) {
      const stem = base.replace(/\.md$/i, "");
      const stampSlug = /^(\d{8}-\d{6})-(.+)$/.exec(stem);

      if (stampSlug && stampSlug[2]) {
        const phrase = stampSlug[2]
          .replace(/-/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (phrase) return clampActivityStr(phrase, 60);
      }

      if (!/^\d{8}-\d{6}-/.test(stem) && stem.length) {
        return clampActivityStr(stem, 60);
      }
    } else if (base && base !== "task.md") {
      return clampActivityStr(base.replace(/\.md$/i, "").replace(/-/g, " "), 60);
    }
  }

  return deriveActivityFallbackClock(j);
}

/** @param {object} j */
function deriveActivityFallbackClock(j) {
  const runId = j.runId != null ? String(j.runId).trim() : "";
  const m = runId ? /^(\d{8})-(\d{6})-(.+)$/.exec(runId) : null;

  if (m) {
    const iso = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}`;

    const d = Date.parse(iso);

    if (Number.isFinite(d)) {
      const clock = new Date(d).toLocaleString("pt-PT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      const phrase = m[3].replace(/-/g, " ").replace(/\s+/g, " ").trim().slice(0, 36);
      if (phrase) return clampActivityStr(`Atividade · ${clock} · ${phrase}`, 60);

      return `Atividade · ${clock}`;
    }
  }

  return "Atividade";
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

    activityTitle: deriveActivityTitle(j),

    metadata:
      j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
        ? j.metadata
        : null,

    ...(() => {
      const runId = j.runId != null ? String(j.runId).trim() : "";
      const projectRoot =
        j.projectRoot != null ? String(j.projectRoot).trim() : "";
      if (!runId || !projectRoot) {
        return { branchHint: null, git: null };
      }
      return resolveRunGitUiEnvelope({ runId, projectRoot });
    })(),

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
 * @param {{ includeArchived?: boolean }} [opts]
 */
function buildProjectDetailBundle(projectIdNorm, queue, snap, opts) {
  const includeArchived = Boolean(opts && opts.includeArchived);

  const queueJobs = queue.jobs.filter((j) =>
    jobMatchesProjectFilters(j, { projectId: projectIdNorm, projectRootCanonical: null }),
  );

  const reg = findProjectRecord(projectIdNorm);

  let rootCanon = reg?.projectRoot ? canonicalProjectRoot(String(reg.projectRoot)) : null;
  if (!rootCanon && queueJobs[0]?.projectRoot) {
    rootCanon = canonicalProjectRoot(String(queueJobs[0].projectRoot));
  }
  if (!rootCanon) {
    const managed = discoverManagedProjectRows().find((r) => r.projectId === projectIdNorm);
    if (managed?.projectRoot) rootCanon = canonicalProjectRoot(String(managed.projectRoot));
  }

  const runIndexJobs =
    queueJobs.length > 0
      ? []
      : listSyntheticJobsFromRunIndex({
          repoRoot: getSetupBossRepoRoot(),
          projectId: projectIdNorm,
          projectRootCanonical: rootCanon,
          existingRunIds: new Set(
            queueJobs
              .map((j) => (j.runId != null ? String(j.runId).trim() : ""))
              .filter(Boolean),
          ),
        });

  const jobs = dedupeJobsByRunId([...queueJobs, ...runIndexJobs]);
  const rootGuess = rootCanon || reg?.projectRoot || jobs[0]?.projectRoot || null;

  const running = jobs.find((j) => String(j.status || "") === "running") || null;

  const sorted = [...jobs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const archiveFile = loadRunArchiveUnsafe();

  let recentSource = sorted;

  if (!includeArchived) {
    recentSource = sorted.filter((j) => !isJobArchived(j, archiveFile));
  }

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

    recentJobs: recentSource.slice(0, 25).map((j) => ({
      ...summarizeJob(j),
      archived: isJobArchived(j, archiveFile),
    })),

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
      try {
        runtimeLogger.error(
          "runtime.http.unhandled",
          err instanceof Error ? err : new Error(String(err)),
          {
            url: req.url,
            method: req.method,
          },
        );
      } catch (_) {
        /* */
      }

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

    runtimeLogger.debug("runtime.http.request", {
      method: req.method,
      path: p,
    });

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

      if (req.method === "GET" && p === "/runtime/heartbeat") {
        const snap = deps.getDaemonSnapshot();
        const diskStatus = readDaemonStatus();
        const q = loadQueueUnsafe();
        sendJson(res, 200, {
          ok: true,
          data: buildRuntimeHeartbeat({ snap, diskStatus, queue: q }),
        });
        return;
      }

      if (req.method === "GET" && p === "/runtime/recovery") {
        const snap = buildRuntimeRecoverySnapshot();
        sendJson(res, 200, { ok: true, data: snap });
        return;
      }

      const runOrchGet = /^\/runs\/([^/]+)\/orchestration$/.exec(p);
      if (req.method === "GET" && runOrchGet) {
        const runId = decodeURIComponent(runOrchGet[1]);
        let outputDir;
        try {
          outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
        } catch (e) {
          sendJson(res, 404, {
            ok: false,
            error: {
              code: "output_unavailable",
              message: e && e.message ? String(e.message) : "Output indisponível.",
            },
          });
          return;
        }
        const boot = collectOrchestrationBootstrap(runId, outputDir);
        sendJson(res, 200, { ok: true, data: boot });
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

            workspaceRunSync: (() => {
              const base =
                diskStatus &&
                diskStatus.workspaceRunSync &&
                typeof diskStatus.workspaceRunSync === "object"
                  ? { ...diskStatus.workspaceRunSync }
                  : null;
              const sseLive = getSseObservabilityMetrics();
              if (!base) {
                return sseLive.connectedClients > 0 || sseLive.eventsEmitted > 0
                  ? {
                      enabled: false,
                      sseConnectedClients: sseLive.connectedClients,
                      sseEventsEmitted: sseLive.eventsEmitted,
                    }
                  : null;
              }
              return {
                ...base,
                sseConnectedClients: sseLive.connectedClients,
                sseEventsEmitted: Math.max(
                  Number(base.sseEventsEmitted) || 0,
                  sseLive.eventsEmitted,
                ),
              };
            })(),

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
        const jobs = loadQueueUnsafe().jobs;
        const { projects: overview, diagnostics } = computePublicProjectsList(jobs);

        const explain =
          url.searchParams.get("explain") === "1" ||
          url.searchParams.get("explain") === "true";

        const sampleProjectIds = (diagnostics.finalProjects || [])
          .slice(0, 5)
          .map((r) => r && r.projectId)
          .filter(Boolean);

        runtimeLogger.info("runtime.projects.pipeline", {
          registryRowsRead: diagnostics.registryRowsRead,
          registryUniqueRoots: diagnostics.registryUniqueRoots,
          registryDuplicatesMerged: diagnostics.registryDuplicatesMerged,
          registryRowsSkippedMissingPath: diagnostics.registryRowsSkippedMissingPath,
          registryRowsSkippedDemo: diagnostics.registryRowsSkippedDemo,
          managedRowsAdded: diagnostics.managedRowsAdded,
          queueDistinctRootsInJobs: diagnostics.queueDistinctRootsInJobs,
          queueOnlyRowsAdded: diagnostics.queueOnlyRowsAdded,
          removedStaleQueuePath: diagnostics.removedStaleQueuePath,
          removedQueueOnlyAsDemo: diagnostics.removedQueueOnlyAsDemo,
          removedAsDemoPostMerge: diagnostics.removedAsDemoPostMerge,
          finalCount: diagnostics.finalCount,
          demoMode: diagnostics.demoMode,
          sampleProjectIds,
        });

        runtimeLogger.info("runtime.projects.list", {
          count: overview.length,
          empty: overview.length === 0,
          demoMode: demoProjectsEnabled(),
        });

        const data = overview.map((r) => ({
          projectId: r.projectId,

          projectRoot: r.projectRoot,

          displayName: r.displayName,

          jobCounts: r.jobCounts && typeof r.jobCounts === "object" ? r.jobCounts : {},

          lastSeenAt: r.lastSeenAt || null,
        }));

        sendJson(res, 200, {
          ok: true,
          data,
          ...(explain ? { explain: diagnostics } : {}),
        });

        return;
      }

      const projectGovernance = /^\/projects\/([^/]+)\/governance$/.exec(p);

      if (projectGovernance && req.method === "GET") {
        const rawSeg = decodeURIComponent(projectGovernance[1]);

        let jobsForGovernance = [];
        try {
          jobsForGovernance = loadQueueUnsafe().jobs || [];
        } catch (_) {
          jobsForGovernance = [];
        }

        const govResolved = resolveGovernanceProject(rawSeg, {
          repoRoot,
          jobs: jobsForGovernance,
        });

        if (!govResolved.ok) {
          sendJson(res, govResolved.status, {
            ok: false,
            error: govResolved.error,
          });
          return;
        }

        const report = buildProjectGovernanceReport(govResolved.projectRootCanonical, {
          projectId: govResolved.projectId,
          displayName: govResolved.displayName,
          setupBossRoot: repoRoot,
        });

        sendJson(res, 200, {
          ok: true,
          data: report.ux,
          validation: report.validation,
        });
        return;
      }

      const projectDetail = /^\/projects\/([^/]+)$/.exec(p);

      if (projectDetail && (req.method === "GET" || req.method === "DELETE")) {
        const rawSeg = decodeURIComponent(projectDetail[1]);

        const resolved = resolveProjectSelector(rawSeg, repoRoot);

        if (!resolved.projectId) {
          sendJson(res, 400, errorPayload("invalid_request", "projectId ou caminho inválido."));

          return;
        }

        if (req.method === "GET") {
          const q = loadQueueUnsafe();

          const includeArchived =
            url.searchParams.get("includeArchived") === "1" ||
            url.searchParams.get("includeArchived") === "true";

          const bundle = buildProjectDetailBundle(
            resolved.projectId,
            q,
            deps.getDaemonSnapshot(),
            { includeArchived },
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

        const purge = purgeJobsForProjectId(resolved.projectId);

        if (!purge.ok) {
          const status =
            purge.code === "project_has_active_jobs" ? 409 : 400;

          sendJson(res, status, errorPayload(purge.code, purge.message));

          return;
        }

        const regRemoved = removeProjectRecordById(resolved.projectId);

        emitRuntimeEvent({
          type: "project_deleted",

          projectId: resolved.projectId,

          data: { removedJobs: purge.removed, registryRemoved: regRemoved },
        });

        runtimeLogger.info("runtime.project_deleted", {
          projectId: resolved.projectId,

          removedJobs: purge.removed,

          registryRemoved: regRemoved,
        });

        sendJson(res, 200, {
          ok: true,

          data: {
            projectId: resolved.projectId,

            removedJobs: purge.removed,

            registryRemoved: regRemoved,
          },
        });

        return;
      }

      if (req.method === "POST" && p === "/projects/register") {
        let rawReg = "";

        try {
          rawReg = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
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
        let regBody = {};

        if (rawReg && rawReg.trim()) {
          try {
            regBody = JSON.parse(rawReg);
          } catch (_) {
            regBody = {};
          }
        }

        const projectRootRaw =
          regBody.projectRoot != null && String(regBody.projectRoot).trim()
            ? String(regBody.projectRoot).trim()
            : "";

        if (!projectRootRaw) {
          sendJson(res, 400, errorPayload("invalid_request", "projectRoot é obrigatório."));

          return;
        }

        const canonReg = canonicalProjectRoot(projectRootRaw);

        if (!canonReg) {
          sendJson(res, 400, errorPayload("invalid_request", "Caminho inválido."));

          return;
        }

        let stReg;

        try {
          stReg = fs.statSync(canonReg);
        } catch (_) {
          sendJson(res, 400, errorPayload("not_found", "Pasta não encontrada."));

          return;
        }

        if (!stReg.isDirectory()) {
          sendJson(
            res,

            400,

            errorPayload("invalid_request", "projectRoot tem de ser uma pasta."),
          );

          return;
        }

        const pidReg = deriveProjectId(canonReg);

        upsertProjectFromUsage({
          projectId: pidReg,

          projectRoot: canonReg,

          displayName: path.basename(canonReg),
        });

        sendJson(res, 200, {
          ok: true,

          data: { projectId: pidReg, projectRoot: canonReg },
        });

        return;
      }

      if (req.method === "POST" && p === "/projects/git/register") {
        let rawGit = "";

        try {
          rawGit = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
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
        let gitBody = {};

        if (rawGit && rawGit.trim()) {
          try {
            gitBody = JSON.parse(rawGit);
          } catch (_) {
            gitBody = {};
          }
        }

        const pickRepoUrl = (b) => {
          const keys = ["repo_url", "repoUrl", "url", "repositoryUrl"];

          for (const k of keys) {
            const v = b[k];

            if (v != null && String(v).trim()) return String(v).trim();
          }

          return "";
        };

        const repoUrl = pickRepoUrl(gitBody);

        const branchRaw =
          gitBody.branch != null && String(gitBody.branch).trim()
            ? String(gitBody.branch).trim()
            : null;

        if (!repoUrl) {
          sendJson(res, 400, errorPayload("invalid_request", "repo_url é obrigatório."));

          return;
        }

        let managedRoot;

        try {
          managedRoot = getManagedProjectsRoot();
        } catch (e) {
          sendJson(
            res,

            500,

            errorPayload(
              "managed_root_error",

              String((e && e.message) || e),
            ),
          );

          return;
        }

        try {
          const data = await registerOrUpdateGitProject({
            repoUrl,

            branch: branchRaw,

            managedRoot,
          });

          sendJson(res, 200, { ok: true, data });
        } catch (e) {
          const code =
            e && typeof e === "object" && e !== null && "code" in e && (e).code
              ? String(/** @type {{ code: unknown }} */ (e).code)
              : "git_register_failed";

          const msg = String((e && /** @type {{ message?: string }} */ (e).message) || e || "Falha ao registar repositório.");

          sendJson(res, 400, errorPayload(code, msg));
        }

        return;
      }

      if (req.method === "GET" && p === "/workspaces") {
        sendJson(res, 200, { ok: true, data: listWorkspaces() });
        return;
      }

      const workspaceDetail = /^\/workspaces\/([^/]+)$/.exec(p);

      if (workspaceDetail && req.method === "GET") {
        const wsId = decodeURIComponent(workspaceDetail[1]);
        const row = getWorkspace(wsId);
        if (!row) {
          sendJson(res, 404, errorPayload("not_found", `Workspace não encontrado: ${wsId}`));
          return;
        }
        sendJson(res, 200, { ok: true, data: row });
        return;
      }

      if (req.method === "POST" && p === "/workspaces") {
        let rawWs = "";
        try {
          rawWs = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }

        let body = {};
        try {
          body = rawWs ? JSON.parse(rawWs) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }

        const created = createWorkspace(body);
        if (!created.ok) {
          sendJson(res, 400, {
            ok: false,
            error: "workspace_validation_failed",
            message: "Validação do workspace falhou.",
            validation: created.errors,
          });
          return;
        }

        runtimeLogger.info("runtime.workspace_created", {
          workspaceId: created.workspace.workspaceId,
          projectCount: created.workspace.projectIds.length,
        });

        sendJson(res, 201, { ok: true, data: created.workspace });
        return;
      }

      if (workspaceDetail && req.method === "PATCH") {
        const wsId = decodeURIComponent(workspaceDetail[1]);
        let rawPatch = "";
        try {
          rawPatch = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }

        let patch = {};
        try {
          patch = rawPatch ? JSON.parse(rawPatch) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }

        const updated = updateWorkspace(wsId, patch);
        if (!updated.ok) {
          if (updated.code === "not_found") {
            sendJson(res, 404, errorPayload("not_found", updated.message || "Workspace não encontrado."));
            return;
          }
          if (updated.errors) {
            sendJson(res, 400, {
              ok: false,
              error: "workspace_validation_failed",
              message: "Validação do workspace falhou.",
              validation: updated.errors,
            });
            return;
          }
          sendJson(res, 400, errorPayload(updated.code || "invalid_request", updated.message || "Pedido inválido."));
          return;
        }

        runtimeLogger.info("runtime.workspace_updated", { workspaceId: wsId });
        sendJson(res, 200, { ok: true, data: updated.workspace });
        return;
      }

      if (workspaceDetail && req.method === "DELETE") {
        const wsId = decodeURIComponent(workspaceDetail[1]);
        const removed = deleteWorkspace(wsId);
        if (!removed.ok) {
          sendJson(res, 404, errorPayload(removed.code || "not_found", removed.message || "Workspace não encontrado."));
          return;
        }
        runtimeLogger.info("runtime.workspace_deleted", { workspaceId: wsId });
        sendJson(res, 200, { ok: true, data: { workspaceId: wsId, removed: true } });
        return;
      }

      if (req.method === "GET" && p === "/workspace-runs") {
        const workspaceIdFilter = url.searchParams.get("workspaceId");
        const data = listWorkspaceRuns({
          workspaceId: workspaceIdFilter,
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }

      const workspaceRunMiniActivities = /^\/workspace-runs\/([^/]+)\/mini-activities$/.exec(p);
      const workspaceRunMiniActivityDetail =
        /^\/workspace-runs\/([^/]+)\/mini-activities\/([^/]+)$/.exec(p);

      if (workspaceRunMiniActivities && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunMiniActivities[1]);
        let rawMa = "";
        try {
          rawMa = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }
        let bodyMa = {};
        try {
          bodyMa = rawMa ? JSON.parse(rawMa) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }
        const addedMa = addMiniActivity(wsRunId, bodyMa);
        if (!addedMa.ok) {
          if (addedMa.code === "not_found") {
            sendJson(res, 404, errorPayload("not_found", addedMa.message || "WorkspaceRun não encontrado."));
            return;
          }
          sendJson(res, 400, {
            ok: false,
            error: "workspace_run_validation_failed",
            message: "Validação da miniActivity falhou.",
            validation: addedMa.errors,
          });
          return;
        }
        sendJson(res, 201, { ok: true, data: addedMa.workspaceRun });
        return;
      }

      if (workspaceRunMiniActivityDetail && req.method === "PATCH") {
        const wsRunId = decodeURIComponent(workspaceRunMiniActivityDetail[1]);
        const maId = decodeURIComponent(workspaceRunMiniActivityDetail[2]);
        let rawPatchMa = "";
        try {
          rawPatchMa = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }
        let patchMa = {};
        try {
          patchMa = rawPatchMa ? JSON.parse(rawPatchMa) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }
        const updatedMa = updateMiniActivity(wsRunId, maId, patchMa);
        if (!updatedMa.ok) {
          if (updatedMa.code === "not_found") {
            sendJson(res, 404, errorPayload("not_found", updatedMa.message || "Não encontrado."));
            return;
          }
          sendJson(res, 400, {
            ok: false,
            error: "workspace_run_validation_failed",
            message: "Validação da miniActivity falhou.",
            validation: updatedMa.errors,
          });
          return;
        }
        sendJson(res, 200, { ok: true, data: updatedMa.workspaceRun });
        return;
      }

      if (workspaceRunMiniActivityDetail && req.method === "DELETE") {
        const wsRunId = decodeURIComponent(workspaceRunMiniActivityDetail[1]);
        const maId = decodeURIComponent(workspaceRunMiniActivityDetail[2]);
        const removedMa = deleteMiniActivity(wsRunId, maId);
        if (!removedMa.ok) {
          sendJson(
            res,
            404,
            errorPayload(removedMa.code || "not_found", removedMa.message || "Não encontrado."),
          );
          return;
        }
        sendJson(res, 200, { ok: true, data: removedMa.workspaceRun });
        return;
      }

      const workspaceRunStart = /^\/workspace-runs\/([^/]+)\/start$/.exec(p);
      const workspaceRunResume = /^\/workspace-runs\/([^/]+)\/resume$/.exec(p);
      const workspaceRunPrepareGit = /^\/workspace-runs\/([^/]+)\/prepare-git$/.exec(p);
      const workspaceRunGitStatus = /^\/workspace-runs\/([^/]+)\/git-status$/.exec(p);
      const workspaceRunRetryPrepareGit =
        /^\/workspace-runs\/([^/]+)\/retry-prepare-git\/([^/]+)$/.exec(p);
      const workspaceRunRetryMini =
        /^\/workspace-runs\/([^/]+)\/retry-mini-activity\/([^/]+)$/.exec(p);
      const workspaceRunSkipMini =
        /^\/workspace-runs\/([^/]+)\/skip-mini-activity\/([^/]+)$/.exec(p);

      if (workspaceRunPrepareGit && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunPrepareGit[1]);
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
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }
        let body = {};
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }
        const skipProjectIds = Array.isArray(body.skipProjectIds)
          ? body.skipProjectIds
          : Array.isArray(body.skippedProjectIds)
            ? body.skippedProjectIds
            : [];
        const result = await prepareWorkspaceRunGit(wsRunId, {
          activityBranch:
            body.activityBranch != null ? String(body.activityBranch).trim() : null,
          skipProjectIds,
          force: body.force === true,
        });
        if (!result.ok) {
          const status =
            result.code === "not_found"
              ? 404
              : result.code === "workspace_git_prepare_incomplete"
                ? 422
                : 400;
          sendJson(res, status, {
            ok: false,
            error: result.code || "workspace_git_prepare_failed",
            message: result.message || "Falha ao preparar Git do workspace.",
            git: result.git,
            data: result.workspaceRun,
          });
          return;
        }
        runtimeLogger.info("runtime.workspace_run_git_prepared", {
          workspaceRunId: wsRunId,
          activityBranch: result.git && result.git.activityBranch,
        });
        notifyWorkspaceRunSse("workspace_run.git_updated", wsRunId);
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId);
        sendJson(res, 200, {
          ok: true,
          data: result.workspaceRun,
          git: result.git,
          meta: { idempotent: result.idempotent === true },
        });
        return;
      }

      if (workspaceRunGitStatus && req.method === "GET") {
        const wsRunId = decodeURIComponent(workspaceRunGitStatus[1]);
        const result = getWorkspaceRunGitStatus(wsRunId);
        if (!result.ok) {
          sendJson(res, 404, errorPayload("not_found", result.message || "Não encontrado."));
          return;
        }
        sendJson(res, 200, { ok: true, data: result });
        return;
      }

      if (workspaceRunRetryPrepareGit && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunRetryPrepareGit[1]);
        const projectId = decodeURIComponent(workspaceRunRetryPrepareGit[2]);
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
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }
        let retryBody = {};
        try {
          retryBody = rawRetry ? JSON.parse(rawRetry) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }
        const result = await retryPrepareWorkspaceGitProject(wsRunId, projectId, {
          force: retryBody.force === true,
        });
        if (!result.ok) {
          const status =
            result.code === "not_found"
              ? 404
              : result.code === "workspace_git_prepare_incomplete"
                ? 422
                : 400;
          sendJson(res, status, {
            ok: false,
            error: result.code || "workspace_git_retry_failed",
            message: result.message || "Falha no retry de prepare Git.",
            git: result.git,
            data: result.workspaceRun,
          });
          return;
        }
        notifyWorkspaceRunSse("workspace_run.git_updated", wsRunId, {
          projectId,
        });
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId);
        sendJson(res, 200, {
          ok: true,
          data: result.workspaceRun,
          git: result.git,
          meta: { retriedProjectId: result.retriedProjectId },
        });
        return;
      }

      if (workspaceRunStart && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunStart[1]);
        const result = await startWorkspaceRun(wsRunId, { repoRoot });
        if (!result.ok) {
          const status =
            result.code === "not_found"
              ? 404
              : result.code === "workspace_run_already_running"
                ? 409
                : 400;
          sendJson(res, status, {
            ok: false,
            error: result.code || "orchestration_failed",
            message: result.message || "Falha ao iniciar orquestração.",
            validation: result.errors,
          });
          return;
        }
        runtimeLogger.info("runtime.workspace_run_started", { workspaceRunId: wsRunId });
        resetWorkspaceRunSyncBackoff();
        notifyWorkspaceRunSse("workspace_run.started", wsRunId);
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId);
        sendJson(res, 200, { ok: true, data: result.workspaceRun, meta: result });
        return;
      }

      if (workspaceRunResume && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunResume[1]);
        const result = await resumeWorkspaceRun(wsRunId, { repoRoot });
        if (!result.ok) {
          const status = result.code === "not_found" ? 404 : 400;
          sendJson(res, status, {
            ok: false,
            error: result.code || "orchestration_failed",
            message: result.message || "Falha ao retomar orquestração.",
          });
          return;
        }
        runtimeLogger.info("runtime.workspace_run_resumed", { workspaceRunId: wsRunId });
        resetWorkspaceRunSyncBackoff();
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId);
        if (result.childRunId || result.startedMiniActivityId) {
          notifyWorkspaceRunSse("workspace_run.advanced", wsRunId, {
            runId: result.childRunId || null,
            miniActivityId: result.startedMiniActivityId || null,
          });
        }
        sendJson(res, 200, { ok: true, data: result.workspaceRun, meta: result });
        return;
      }

      if (workspaceRunRetryMini && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunRetryMini[1]);
        const maId = decodeURIComponent(workspaceRunRetryMini[2]);
        const result = await retryMiniActivity(wsRunId, maId, { repoRoot });
        if (!result.ok) {
          sendJson(res, result.code === "not_found" ? 404 : 400, {
            ok: false,
            error: result.code || "orchestration_failed",
            message: result.message || "Falha no retry da miniActivity.",
          });
          return;
        }
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId, {
          miniActivityId: maId,
        });
        sendJson(res, 200, { ok: true, data: result.workspaceRun, meta: result });
        return;
      }

      if (workspaceRunSkipMini && req.method === "POST") {
        const wsRunId = decodeURIComponent(workspaceRunSkipMini[1]);
        const maId = decodeURIComponent(workspaceRunSkipMini[2]);
        const result = await skipMiniActivity(wsRunId, maId, { repoRoot });
        if (!result.ok) {
          sendJson(res, result.code === "not_found" ? 404 : 400, {
            ok: false,
            error: result.code || "orchestration_failed",
            message: result.message || "Falha ao saltar miniActivity.",
          });
          return;
        }
        notifyWorkspaceRunSse("workspace_run.updated", wsRunId, {
          miniActivityId: maId,
        });
        sendJson(res, 200, { ok: true, data: result.workspaceRun, meta: result });
        return;
      }

      const workspaceRunDetail = /^\/workspace-runs\/([^/]+)$/.exec(p);

      if (workspaceRunDetail && req.method === "GET") {
        const runId = decodeURIComponent(workspaceRunDetail[1]);
        const row = getWorkspaceRun(runId);
        if (!row) {
          sendJson(res, 404, errorPayload("not_found", `WorkspaceRun não encontrado: ${runId}`));
          return;
        }
        sendJson(res, 200, { ok: true, data: row });
        return;
      }

      if (req.method === "POST" && p === "/workspace-runs") {
        let rawWsr = "";
        try {
          rawWsr = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }

        let bodyWsr = {};
        try {
          bodyWsr = rawWsr ? JSON.parse(rawWsr) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }

        const createdWsr = createWorkspaceRun(bodyWsr);
        if (!createdWsr.ok) {
          sendJson(res, 400, {
            ok: false,
            error: "workspace_run_validation_failed",
            message: "Validação do workspace run falhou.",
            validation: createdWsr.errors,
          });
          return;
        }

        runtimeLogger.info("runtime.workspace_run_created", {
          workspaceRunId: createdWsr.workspaceRun.workspaceRunId,
          workspaceId: createdWsr.workspaceRun.workspaceId,
        });

        sendJson(res, 201, { ok: true, data: createdWsr.workspaceRun });
        return;
      }

      if (workspaceRunDetail && req.method === "PATCH") {
        const runId = decodeURIComponent(workspaceRunDetail[1]);
        let rawPatchWsr = "";
        try {
          rawPatchWsr = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite permitido."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_request", "Corpo JSON inválido."));
          return;
        }

        let patchWsr = {};
        try {
          patchWsr = rawPatchWsr ? JSON.parse(rawPatchWsr) : {};
        } catch (_) {
          sendJson(res, 400, errorPayload("invalid_request", "JSON inválido."));
          return;
        }

        const updatedWsr = updateWorkspaceRun(runId, patchWsr);
        if (!updatedWsr.ok) {
          if (updatedWsr.code === "not_found") {
            sendJson(res, 404, errorPayload("not_found", updatedWsr.message || "WorkspaceRun não encontrado."));
            return;
          }
          if (updatedWsr.errors) {
            sendJson(res, 400, {
              ok: false,
              error: "workspace_run_validation_failed",
              message: "Validação do workspace run falhou.",
              validation: updatedWsr.errors,
            });
            return;
          }
          sendJson(
            res,
            400,
            errorPayload(updatedWsr.code || "invalid_request", updatedWsr.message || "Pedido inválido."),
          );
          return;
        }

        runtimeLogger.info("runtime.workspace_run_updated", { workspaceRunId: runId });
        sendJson(res, 200, { ok: true, data: updatedWsr.workspaceRun });
        return;
      }

      if (workspaceRunDetail && req.method === "DELETE") {
        const runId = decodeURIComponent(workspaceRunDetail[1]);
        const removedWsr = deleteWorkspaceRun(runId);
        if (!removedWsr.ok) {
          sendJson(
            res,
            404,
            errorPayload(removedWsr.code || "not_found", removedWsr.message || "WorkspaceRun não encontrado."),
          );
          return;
        }
        runtimeLogger.info("runtime.workspace_run_deleted", { workspaceRunId: runId });
        sendJson(res, 200, { ok: true, data: { workspaceRunId: runId, removed: true } });
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
      if (req.method === "GET" && p === "/diagnostics/events") {
        const channel = url.searchParams.get("channel") || "pre_run";
        let projectIdParam = url.searchParams.get("projectId");
        if (projectIdParam != null && String(projectIdParam).trim()) {
          const r = resolveProjectSelector(String(projectIdParam).trim(), repoRoot);
          if (r.projectId) projectIdParam = r.projectId;
        }
        const limRaw = url.searchParams.get("limit");
        let limit = 40;
        if (limRaw != null && limRaw !== "") {
          const n = Number(limRaw);
          if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), 100);
        }
        const codeParam = url.searchParams.get("code");
        const phaseParam = url.searchParams.get("phase");
        const events = readPreRunDiagnosticEvents({
          channel: String(channel),
          projectId: projectIdParam,
          code: codeParam,
          phase: phaseParam,
          limit,
        });
        sendJson(res, 200, {
          ok: true,
          data: {
            channel: String(channel),
            limit,
            ...(codeParam ? { code: String(codeParam) } : {}),
            ...(phaseParam ? { phase: String(phaseParam) } : {}),
            events,
          },
        });
        return;
      }

      if (req.method === "GET" && p === "/events/stream") {
        handleEventsStream(req, res, url, repoRoot);
        return;
      }

      if (req.method === "GET" && p === "/events") {
        const jobIdParam = url.searchParams.get("jobId");

        const after = url.searchParams.get("after");

        const limRaw = url.searchParams.get("limit");

        let projectIdParam = url.searchParams.get("projectId");

        const runKeyParam = url.searchParams.get("runKey");

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
          runKey:
            runKeyParam != null && String(runKeyParam).trim()
              ? String(runKeyParam).trim()
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

      if (req.method === "POST" && p === "/runs") {
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
            sendJson(res, 400, errorPayload("invalid_json", "Corpo não é JSON válido."));
            return;
          }
        }

        if (!body || typeof body !== "object" || Array.isArray(body)) {
          sendJson(res, 400, errorPayload("invalid_request", "Body deve ser um objeto JSON."));
          return;
        }

        const projectId =
          body.projectId != null
            ? String(body.projectId).trim()
            : body.project_id != null
              ? String(body.project_id).trim()
              : "";
        const task =
          body.task != null
            ? String(body.task).trim()
            : body.taskText != null
              ? String(body.taskText).trim()
              : "";

        if (!projectId || !task) {
          sendJson(
            res,
            400,
            errorPayload(
              "invalid_request",
              "Campos obrigatórios: projectId (string) e task (string).",
            ),
          );
          return;
        }

        const metadata =
          body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {};

        const headerRidRaw = req.headers["x-setup-boss-request-id"];
        const headerRid =
          headerRidRaw != null && String(headerRidRaw).trim()
            ? String(headerRidRaw).trim()
            : "";
        const requestId = headerRid || generateRequestId();

        runtimeLogger.info("runtime.api.submit_received", {
          requestId,
          projectId,
          taskChars: task.length,
          skipLlm: metadata.skipLlm !== false,
        });

        const created = await runWithTraceContext(
          { requestId, repoRoot },
          async () => {
            mergeTraceContext({ projectId });
            appendRuntimeTrace({
              component: "runtime_api",
              event: "submit_received",
              phase: "submit",
              step: "post_runs",
              projectId,
              message: "POST /runs recebido",
              source: "server",
              derivedFrom: "state",
              metadata: {
                taskChars: task.length,
                skipLlm: metadata.skipLlm !== false,
              },
            });
            appendRuntimeTrace({
              component: "runtime_api",
              event: "submit_payload_normalized",
              phase: "submit",
              projectId,
              message: "Payload normalizado (projectId/task/metadata)",
              source: "server",
              derivedFrom: "state",
            });
            return createRunFromTask({
              repoRoot,
              projectId,
              task,
              metadata,
            });
          },
        );

        if (!created.ok) {
          const rawErr =
            created.error && typeof created.error === "object"
              ? /** @type {Record<string, unknown>} */ (created.error)
              : {
                  code: "run_create_failed",
                  message: "Falha ao criar corrida.",
                };
          const payload = preRunHttpErrorPayload(rawErr, {
            requestId,
            projectId,
            projectRoot:
              rawErr.projectRoot != null
                ? String(rawErr.projectRoot)
                : null,
          });
          appendRuntimeTrace({
            component: "runtime_api",
            event: "run_create_failed",
            phase: "submit",
            level: "error",
            requestId,
            projectId,
            projectRoot: payload.error?.projectRoot ?? null,
            runId: created.runId != null ? String(created.runId) : null,
            message: payload.error?.message || "Falha ao criar corrida.",
            source: "server",
            derivedFrom: "state",
            error: payload.error || null,
            metadata: {
              channel: "pre_run",
              code: payload.error?.code || "run_create_failed",
            },
          });
          const code = String(payload.error?.code || "run_create_failed");
          const status =
            code === "project_not_found"
              ? 404
              : code === "task_too_short" ||
                  code === "project_id_required" ||
                  code === "KNOWLEDGE_BASE_MISSING" ||
                  code === "KNOWLEDGE_BASE_UNTRACKED" ||
                  code === "KNOWLEDGE_BASE_IGNORED" ||
                  code === "KNOWLEDGE_BASE_NOT_GIT" ||
                  code === "KNOWLEDGE_BASE_WRONG_PATH" ||
                  code === "KNOWLEDGE_BASE_INVALID_SEED" ||
                  code === "KNOWLEDGE_BASE_INVALID_STRUCTURE" ||
                  code === "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION" ||
                  code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT" ||
                  code === "KNOWLEDGE_BASE_VERSION_MISSING" ||
                  code === "KNOWLEDGE_BASE_VERSION_INVALID" ||
                  code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION" ||
                  code === "KNOWLEDGE_BASE_SENSITIVE_DATA" ||
                  code === "PROJECT_ROOT_UNRESOLVED"
                ? 400
                : 500;
          res.setHeader("X-Setup-Boss-Request-Id", requestId);
          sendJson(res, status, payload);
          runtimeLogger.warn("runtime.api.submit_failed", {
            requestId,
            projectId,
            code,
            runId: created.runId != null ? String(created.runId) : null,
            message: created.error?.message || "run_create_failed",
          });
          return;
        }

        runtimeLogger.info("runtime.api.submit_ok", {
          requestId,
          projectId,
          runId: created.data?.runId,
          jobId: created.data?.jobId,
          initialState: created.data?.initialState,
          phase2Status: created.data?.phase2Status,
          classification: created.data?.classification,
          uiPhase: created.data?.uiPhase,
          uiState: created.data?.uiState,
        });

        res.setHeader("X-Setup-Boss-Request-Id", requestId);
        sendJson(res, 201, { ok: true, data: created.data });
        return;
      }

      const runObservabilityGet = /^\/runs\/([^/]+)\/runtime-observability$/.exec(p);
      if (req.method === "GET" && runObservabilityGet) {
        const idOrRun = decodeURIComponent(runObservabilityGet[1]);
        const bundle = buildRunObservabilityBundle(repoRoot, idOrRun);
        if (!bundle.ok) {
          sendJson(
            res,
            400,
            errorPayload(bundle.code || "invalid_request", bundle.message || "Pedido inválido."),
          );
          return;
        }
        sendJson(res, 200, { ok: true, data: bundle.data });
        return;
      }

      const runEvidenceGet = /^\/runs\/([^/]+)\/evidence$/.exec(p);

      if (req.method === "GET" && runEvidenceGet) {
        const idOrRun = decodeURIComponent(runEvidenceGet[1]);
        const qEv = loadQueueUnsafe();
        const resolved = resolveRunIdForEvidence(idOrRun, qEv.jobs);

        if (!resolved.runId) {
          const code =
            resolved.error === "no_run_id"
              ? "run_id_missing"
              : "not_found";
          const msg =
            resolved.error === "no_run_id"
              ? "Job sem runId associado — evidência indisponível."
              : `Run ou job não encontrado: ${idOrRun}`;
          sendJson(res, resolved.error === "no_run_id" ? 409 : 404, errorPayload(code, msg));
          return;
        }

        const ev = collectRunEvidence(resolved.runId, resolved.job);

        if (!ev.ok) {
          sendJson(
            res,
            404,
            errorPayload("output_unavailable", ev.error?.message || "Output indisponível."),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: ev.data });
        return;
      }

      const runClarifyGet = /^\/runs\/([^/]+)\/clarification$/.exec(p);

      if (req.method === "GET" && runClarifyGet) {
        const idOrRun = decodeURIComponent(runClarifyGet[1]);
        const qCl = loadQueueUnsafe();
        const resolvedCl = resolveRunIdForEvidence(idOrRun, qCl.jobs);

        if (!resolvedCl.runId) {
          sendJson(
            res,
            resolvedCl.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedCl.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedCl.error === "no_run_id"
                ? "Job sem runId — clarificação indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const bundle = collectClarificationForRun(
          resolvedCl.runId,
          resolvedCl.job,
        );

        if (!bundle.ok) {
          const code = bundle.error?.code || "clarification_unavailable";
          sendJson(
            res,
            code === "clarification_not_applicable" ? 404 : 404,
            errorPayload(code, bundle.error?.message || "Clarificação indisponível."),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: bundle.data });
        return;
      }

      const runPlanPresentationBaseGet =
        /^\/runs\/([^/]+)\/plan-presentation-base$/.exec(p);

      if (req.method === "GET" && runPlanPresentationBaseGet) {
        const idOrRun = decodeURIComponent(runPlanPresentationBaseGet[1]);
        const qPpb = loadQueueUnsafe();
        const resolvedPpb = resolveRunIdForEvidence(idOrRun, qPpb.jobs);

        if (!resolvedPpb.runId) {
          sendJson(
            res,
            resolvedPpb.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedPpb.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedPpb.error === "no_run_id"
                ? "Job sem runId — snapshot de plano indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const bundlePpb = collectPlanPresentationBaseForRun(resolvedPpb.runId);
        if (!bundlePpb.ok) {
          sendJson(
            res,
            404,
            errorPayload(
              bundlePpb.code || "plan_presentation_base_unavailable",
              bundlePpb.message || "Snapshot de plano indisponível.",
            ),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: bundlePpb.data });
        return;
      }

      const runPlanPresentationBasePut =
        /^\/runs\/([^/]+)\/plan-presentation-base$/.exec(p);

      if (req.method === "PUT" && runPlanPresentationBasePut) {
        const idOrRun = decodeURIComponent(runPlanPresentationBasePut[1]);
        const qPpbPut = loadQueueUnsafe();
        const resolvedPpbPut = resolveRunIdForEvidence(idOrRun, qPpbPut.jobs);

        if (!resolvedPpbPut.runId) {
          sendJson(
            res,
            resolvedPpbPut.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedPpbPut.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedPpbPut.error === "no_run_id"
                ? "Job sem runId — snapshot de plano indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let bodyPpb = {};
        try {
          const rawBodyPpb = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBodyPpb && rawBodyPpb.trim()) bodyPpb = JSON.parse(rawBodyPpb);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const resultPpb = upsertPlanPresentationBaseForRun(
          resolvedPpbPut.runId,
          bodyPpb,
        );

        if (!resultPpb.ok) {
          sendJson(
            res,
            422,
            errorPayload(
              resultPpb.code || "plan_presentation_base_failed",
              resultPpb.message || "Falha ao gravar snapshot de plano.",
            ),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: resultPpb.data });
        return;
      }

      const runPlanCommentsGet = /^\/runs\/([^/]+)\/plan-comments$/.exec(p);

      if (req.method === "GET" && runPlanCommentsGet) {
        const idOrRun = decodeURIComponent(runPlanCommentsGet[1]);
        const qPc = loadQueueUnsafe();
        const resolvedPc = resolveRunIdForEvidence(idOrRun, qPc.jobs);

        if (!resolvedPc.runId) {
          sendJson(
            res,
            resolvedPc.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedPc.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedPc.error === "no_run_id"
                ? "Job sem runId — comentários indisponíveis."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const bundlePc = collectPlanCommentsForRun(resolvedPc.runId);
        if (!bundlePc.ok) {
          sendJson(
            res,
            404,
            errorPayload(
              bundlePc.code || "plan_comments_unavailable",
              bundlePc.message || "Comentários indisponíveis.",
            ),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: bundlePc.data });
        return;
      }

      const runPlanCommentsPost = /^\/runs\/([^/]+)\/plan-comments$/.exec(p);

      if (req.method === "POST" && runPlanCommentsPost) {
        const idOrRun = decodeURIComponent(runPlanCommentsPost[1]);
        const qPcPost = loadQueueUnsafe();
        const resolvedPcPost = resolveRunIdForEvidence(idOrRun, qPcPost.jobs);

        if (!resolvedPcPost.runId) {
          sendJson(
            res,
            resolvedPcPost.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedPcPost.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedPcPost.error === "no_run_id"
                ? "Job sem runId — comentários indisponíveis."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let bodyPc = {};
        try {
          const rawBodyPc = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBodyPc && rawBodyPc.trim()) bodyPc = JSON.parse(rawBodyPc);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const skipLlmPc = bodyPc.skipLlm === true;
        const resultPc = await submitPlanCommentForRun(
          resolvedPcPost.runId,
          {
            commentId: bodyPc.commentId,
            text: bodyPc.text,
            createdAt: bodyPc.createdAt,
            skipLlm: skipLlmPc,
          },
          {
            jobId: resolvedPcPost.job?.id ?? null,
            projectId: resolvedPcPost.job?.projectId ?? null,
          },
        );

        if (!resultPc.ok) {
          sendJson(
            res,
            422,
            errorPayload(
              resultPc.code || "plan_comment_failed",
              resultPc.message || "Falha ao processar comentário.",
            ),
          );
          return;
        }

        try {
          emitRuntimeEvent({
            type: "plan_comment_submitted",
            jobId: resolvedPcPost.job?.id ?? null,
            runId: resolvedPcPost.runId,
            data: {
              commentId: resultPc.comment?.id ?? bodyPc.commentId,
              classification: resultPc.analysis?.classification ?? null,
            },
          });
        } catch (_) {
          /* */
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            comment: resultPc.comment,
            analysis: resultPc.analysis,
            additionalQuestions: resultPc.additionalQuestions ?? null,
            additionalAnswers: resultPc.additionalAnswers ?? null,
            updatedPlan: resultPc.updatedPlan ?? null,
            idempotent: Boolean(resultPc.idempotent),
          },
        });
        return;
      }

      const runPlanCommentAnswersPost =
        /^\/runs\/([^/]+)\/plan-comments\/([^/]+)\/questions\/answers$/.exec(p);

      if (req.method === "POST" && runPlanCommentAnswersPost) {
        const idOrRun = decodeURIComponent(runPlanCommentAnswersPost[1]);
        const commentIdEnc = decodeURIComponent(runPlanCommentAnswersPost[2]);
        const qAns = loadQueueUnsafe();
        const resolvedAns = resolveRunIdForEvidence(idOrRun, qAns.jobs);

        if (!resolvedAns.runId) {
          sendJson(
            res,
            resolvedAns.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedAns.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedAns.error === "no_run_id"
                ? "Job sem runId — respostas indisponíveis."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let bodyAns = {};
        try {
          const rawBodyAns = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBodyAns && rawBodyAns.trim()) bodyAns = JSON.parse(rawBodyAns);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const resultAns = await submitPlanCommentAnswersForRun(
          resolvedAns.runId,
          commentIdEnc,
          { answers: bodyAns.answers },
        );

        if (!resultAns.ok) {
          sendJson(
            res,
            422,
            errorPayload(
              resultAns.code || "plan_comment_answers_failed",
              resultAns.message || "Falha ao registar respostas.",
            ),
          );
          return;
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            additionalAnswers: resultAns.additionalAnswers,
            updatedPlan: resultAns.updatedPlan,
            idempotent: Boolean(resultAns.idempotent),
          },
        });
        return;
      }

      const runStrategyGet = /^\/runs\/([^/]+)\/strategy$/.exec(p);

      if (req.method === "GET" && runStrategyGet) {
        const idOrRun = decodeURIComponent(runStrategyGet[1]);
        const qSt = loadQueueUnsafe();
        const resolvedSt = resolveRunIdForEvidence(idOrRun, qSt.jobs);

        if (!resolvedSt.runId) {
          sendJson(
            res,
            resolvedSt.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedSt.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedSt.error === "no_run_id"
                ? "Job sem runId — strategy indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const bundleSt = collectStrategyForRun(resolvedSt.runId);

        if (!bundleSt.ok) {
          sendJson(
            res,
            404,
            errorPayload(
              bundleSt.error?.code || "strategy_unavailable",
              bundleSt.error?.message || "Strategy indisponível.",
            ),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: bundleSt.data });
        return;
      }

      const runStrategyPost = /^\/runs\/([^/]+)\/strategy$/.exec(p);

      if (req.method === "POST" && runStrategyPost) {
        const idOrRun = decodeURIComponent(runStrategyPost[1]);
        const qStp = loadQueueUnsafe();
        const resolvedStp = resolveRunIdForEvidence(idOrRun, qStp.jobs);

        if (!resolvedStp.runId) {
          sendJson(
            res,
            resolvedStp.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedStp.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedStp.error === "no_run_id"
                ? "Job sem runId — não é possível gerar strategy."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const stratResult = await triggerStrategyRun({
          runId: resolvedStp.runId,
          jobId: resolvedStp.job?.id ?? null,
          projectId: resolvedStp.job?.projectId ?? null,
          force: Boolean(body.force),
        });

        if (!stratResult.ok) {
          const errCode = stratResult.code || "strategy_failed";
          const status =
            errCode === "strategy_approval_not_approved" ||
            errCode === "strategy_phase2_not_ready"
              ? 409
              : errCode === "output_unavailable"
                ? 503
                : 400;
          sendJson(res, status, errorPayload(errCode, stratResult.message));
          return;
        }

        sendJson(res, stratResult.idempotent ? 200 : 202, {
          ok: true,
          data: stratResult.data,
        });
        return;
      }

      const runExecutionGet = /^\/runs\/([^/]+)\/execution$/.exec(p);

      if (req.method === "GET" && runExecutionGet) {
        const idOrRun = decodeURIComponent(runExecutionGet[1]);
        const qEx = loadQueueUnsafe();
        const resolvedEx = resolveRunIdForEvidence(idOrRun, qEx.jobs);

        if (!resolvedEx.runId) {
          sendJson(
            res,
            resolvedEx.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedEx.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedEx.error === "no_run_id"
                ? "Job sem runId — execution indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const bundleEx = collectExecutionForRun(resolvedEx.runId);

        if (!bundleEx.ok) {
          sendJson(
            res,
            404,
            errorPayload(
              bundleEx.error?.code || "execution_unavailable",
              bundleEx.error?.message || "Execution indisponível.",
            ),
          );
          return;
        }

        sendJson(res, 200, { ok: true, data: bundleEx.data });
        return;
      }

      const runArchivePost = /^\/runs\/([^/]+)\/archive$/.exec(p);

      if (req.method === "POST" && runArchivePost) {
        const idOrRun = decodeURIComponent(runArchivePost[1]);
        const qAr = loadQueueUnsafe();

        let job = qAr.jobs.find((j) => j && String(j.id) === idOrRun) || null;

        if (!job) {
          job =
            qAr.jobs.find((j) => j && j.runId && String(j.runId) === idOrRun) ||
            null;
        }

        if (!job) {
          sendJson(
            res,
            404,
            errorPayload(
              "not_found",
              `Job ou run não encontrado na fila: ${idOrRun}`,
            ),
          );

          return;
        }

        const ar = archiveJobRecord(job);

        if (!ar.ok || !ar.archivedAt) {
          sendJson(res, 500, errorPayload("internal_error", "Falha ao arquivar."));

          return;
        }

        const rid = job.runId != null ? String(job.runId) : null;
        const jid = String(job.id);

        emitRuntimeEvent({
          type: "run_archived",
          jobId: jid,
          runId: rid,
          projectId:
            job.projectId != null && String(job.projectId).trim()
              ? String(job.projectId).trim()
              : null,
          data: { archivedAt: ar.archivedAt, keys: ar.keys },
        });

        runtimeLogger.info("runtime.run_archived", {
          runId: rid,
          jobId: jid,
          projectId: job.projectId,
          archivedAt: ar.archivedAt,
          archiveKeys: ar.keys,
        });

        sendJson(res, 200, {
          ok: true,
          data: { archivedAt: ar.archivedAt, runId: rid, jobId: jid },
        });
        return;
      }

      const runDeletePost = /^\/runs\/([^/]+)\/delete$/.exec(p);

      if (req.method === "POST" && runDeletePost) {
        const idOrRun = decodeURIComponent(runDeletePost[1]);
        const rm = removeJobFromQueueByKey(idOrRun);

        if (!rm.ok && rm.code !== "not_found") {
          const status = rm.code === "job_active" ? 409 : 400;
          sendJson(res, status, errorPayload(rm.code, rm.message));
          return;
        }

        /** @type {string|null} */
        let rid = null;
        /** @type {string|null} */
        let jid = null;
        /** @type {string|null} */
        let projectId = null;
        let archiveEntriesRemoved = 0;
        let indexArtifactRemoved = false;

        if (rm.ok) {
          const job = rm.job;
          jid = String(job.id);
          rid = job.runId != null ? String(job.runId).trim() : null;
          projectId =
            job.projectId != null && String(job.projectId).trim()
              ? String(job.projectId).trim()
              : null;
          archiveEntriesRemoved = removeArchiveEntriesForJob(job).removed;
        } else {
          const parsed = parseRunDeleteKey(idOrRun);
          rid = parsed.runId;
          jid = parsed.jobId;
          if (!rid) {
            sendJson(
              res,
              404,
              errorPayload(
                "not_found",
                "Atividade não encontrada na fila nem como corrida em disco.",
              ),
            );
            return;
          }
          archiveEntriesRemoved = removeArchiveEntriesForRunId(rid).removed;
        }

        if (rid) {
          const art = deleteRunIndexArtifact(rid, repoRoot);
          indexArtifactRemoved = art.ok;
          if (!rm.ok && !art.ok) {
            sendJson(res, 404, errorPayload(art.code, art.message));
            return;
          }
        } else if (!rm.ok) {
          sendJson(
            res,
            404,
            errorPayload(
              "not_found",
              "Atividade não encontrada na fila nem como corrida em disco.",
            ),
          );
          return;
        }

        emitRuntimeEvent({
          type: "run_deleted",
          jobId: jid,
          runId: rid,
          projectId,
          data: {
            archiveEntriesRemoved,
            indexArtifactRemoved,
          },
        });

        runtimeLogger.info("runtime.run_deleted", {
          runId: rid,
          jobId: jid,
          projectId,
          archiveEntriesRemoved,
          indexArtifactRemoved,
        });

        sendJson(res, 200, {
          ok: true,
          data: { runId: rid, jobId: jid, indexArtifactRemoved },
        });
        return;
      }

      const runGitBranchPost = /^\/runs\/([^/]+)\/git-branch$/.exec(p);

      if (req.method === "POST" && runGitBranchPost) {
        const idOrRun = decodeURIComponent(runGitBranchPost[1]);
        const qGit = loadQueueUnsafe();
        const resolvedGit = resolveRunIdForEvidence(idOrRun, qGit.jobs);

        if (!resolvedGit.runId) {
          sendJson(
            res,
            resolvedGit.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedGit.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedGit.error === "no_run_id"
                ? "Job sem runId — git-branch indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const activityBranch =
          body.activityBranch != null && String(body.activityBranch).trim()
            ? String(body.activityBranch).trim()
            : body.activity_branch != null && String(body.activity_branch).trim()
              ? String(body.activity_branch).trim()
              : null;

        const gitResult = await prepareRunGitBranch({
          runId: resolvedGit.runId,
          activityBranch,
          jobId: resolvedGit.job?.id ?? null,
          projectId:
            resolvedGit.job?.projectId != null && String(resolvedGit.job.projectId).trim()
              ? String(resolvedGit.job.projectId).trim()
              : null,
        });

        if (!gitResult.ok) {
          const errCode = gitResult.code || "git_unknown_error";
          const status =
            errCode === "strategy_not_ready" ||
            errCode === "git_dirty_worktree" ||
            errCode === "git_branch_exists" ||
            errCode === "git_pull_failed"
              ? 409
              : errCode === "output_unavailable" || errCode === "project_not_found"
                ? 503
                : 400;
          sendJson(res, status, {
            ok: false,
            error: errCode,
            message: gitResult.message,
            data: gitResult.data ?? null,
          });
          return;
        }

        sendJson(res, gitResult.idempotent ? 200 : 201, {
          ok: true,
          data: gitResult.data,
          message: gitResult.message,
        });
        return;
      }

      const runGitPushPost = /^\/runs\/([^/]+)\/git-push$/.exec(p);

      if (req.method === "POST" && runGitPushPost) {
        const idOrRun = decodeURIComponent(runGitPushPost[1]);
        const qPush = loadQueueUnsafe();
        const resolvedPush = resolveRunIdForEvidence(idOrRun, qPush.jobs);

        if (!resolvedPush.runId) {
          sendJson(
            res,
            resolvedPush.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedPush.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedPush.error === "no_run_id"
                ? "Job sem runId — publicação de branch indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        const pushResult = await pushRunGitBranch({
          runId: resolvedPush.runId,
          jobId: resolvedPush.job?.id ?? null,
          projectId:
            resolvedPush.job?.projectId != null &&
            String(resolvedPush.job.projectId).trim()
              ? String(resolvedPush.job.projectId).trim()
              : null,
        });

        if (!pushResult.ok) {
          const errCode = pushResult.code || "git_push_failed";
          const status =
            errCode === "git_push_branch_mismatch" ||
            errCode === "git_push_branch_required" ||
            errCode === "git_push_commit_required" ||
            errCode === "git_push_no_remote" ||
            errCode === "git_push_protected_branch" ||
            errCode === "git_branch_mismatch"
              ? 409
              : errCode === "output_unavailable" || errCode === "project_not_found"
                ? 503
                : 400;
          sendJson(res, status, {
            ok: false,
            error: errCode,
            message: pushResult.message,
            data: pushResult.data ?? null,
          });
          return;
        }

        sendJson(res, pushResult.idempotent ? 200 : 201, {
          ok: true,
          data: pushResult.data,
          message: pushResult.message,
        });
        return;
      }

      const runExecutePost = /^\/runs\/([^/]+)\/execute$/.exec(p);

      if (req.method === "POST" && runExecutePost) {
        const idOrRun = decodeURIComponent(runExecutePost[1]);
        const qExec = loadQueueUnsafe();
        const resolvedExec = resolveRunIdForEvidence(idOrRun, qExec.jobs);

        if (!resolvedExec.runId) {
          sendJson(
            res,
            resolvedExec.error === "no_run_id" ? 409 : 404,
            errorPayload(
              resolvedExec.error === "no_run_id" ? "run_id_missing" : "not_found",
              resolvedExec.error === "no_run_id"
                ? "Job sem runId — execute indisponível."
                : `Run ou job não encontrado: ${idOrRun}`,
            ),
          );
          return;
        }

        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const snap = deps.getDaemonSnapshot();
        const execResult = await triggerRunExecution({
          repoRoot,
          runId: resolvedExec.runId,
          sourceJob: resolvedExec.job,
          daemonSnapshot: {
            running: snap.running !== false,
            busy: Boolean(snap.busy),
            workerId:
              snap.workerId != null
                ? String(snap.workerId)
                : snap.workers && Array.isArray(snap.workerList) && snap.workerList[0]
                  ? String(
                      /** @type {{ id?: string }} */ (snap.workerList[0]).id || "",
                    )
                  : null,
          },
          force: Boolean(body.force),
        });

        if (!execResult.ok) {
          const errCode = execResult.code || "execute_failed";
          const status =
            errCode === "clarification_not_approved" ||
            errCode === "clarification_pending" ||
            errCode === "clarification_not_ready" ||
            errCode === "strategy_not_ready" ||
            errCode === "execution_already_active" ||
            errCode === "git_branch_required" ||
            errCode === "git_branch_mismatch"
              ? 409
              : errCode === "runtime_offline" ||
                  errCode === "output_unavailable" ||
                  errCode === "queue_unavailable"
                ? 503
                : 400;
          try {
            runtimeLogger.warn("execution_start_blocked", {
              runId: resolvedExec.runId,
              code: errCode,
              message: execResult.message,
            });
            emitRuntimeEvent({
              type: "execution_start_blocked",
              jobId: resolvedExec.job?.id ?? null,
              runId: resolvedExec.runId,
              data: {
                code: errCode,
                message: execResult.message,
                source: "post_execute",
              },
            });
          } catch (_) {
            /* */
          }
          sendJson(res, status, errorPayload(errCode, execResult.message));
          return;
        }

        try {
          emitRuntimeEvent({
            type: "execution_triggered",
            jobId: execResult.data?.jobId ?? resolvedExec.job?.id ?? null,
            runId: resolvedExec.runId,
            data: {
              executionState: execResult.data?.executionState,
              orchestrationState: execResult.data?.orchestrationState,
              idempotent: Boolean(execResult.idempotent),
            },
          });
        } catch (_) {
          /* */
        }

        sendJson(res, execResult.idempotent ? 200 : 202, {
          ok: true,
          data: execResult.data,
        });
        return;
      }

      const runOperationalReviewGet = /^\/runs\/([^/]+)\/operational-review$/.exec(p);
      const runOperationalReviewConfirm = /^\/runs\/([^/]+)\/operational-review\/confirm$/.exec(
        p,
      );
      const runOperationalReviewAdjust = /^\/runs\/([^/]+)\/operational-review\/request-adjustment$/.exec(
        p,
      );

      if (req.method === "GET" && runOperationalReviewGet) {
        const idOrRun = decodeURIComponent(runOperationalReviewGet[1]);
        const qRev = loadQueueUnsafe();
        const resolvedRev = resolveRunIdForEvidence(idOrRun, qRev.jobs);
        if (!resolvedRev.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        const rev = getOperationalReviewSession(resolvedRev.runId);
        if (!rev.ok) {
          const code = rev.code || "operational_review_unavailable";
          const status =
            code === "execution_not_completed"
              ? 409
              : code === "output_unavailable"
                ? 503
                : 400;
          sendJson(res, status, errorPayload(code, rev.message));
          return;
        }
        sendJson(res, 200, { ok: true, data: rev.data });
        return;
      }

      if (req.method === "POST" && runOperationalReviewConfirm) {
        const idOrRun = decodeURIComponent(runOperationalReviewConfirm[1]);
        const qRev = loadQueueUnsafe();
        const resolvedRev = resolveRunIdForEvidence(idOrRun, qRev.jobs);
        if (!resolvedRev.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }
        const result = await confirmOperationalReview({
          repoRoot,
          runId: resolvedRev.runId,
          notes: body.notes != null ? String(body.notes) : "",
        });
        if (!result.ok) {
          sendJson(
            res,
            409,
            errorPayload(result.code || "operational_review_failed", result.message),
          );
          return;
        }
        sendJson(res, 200, { ok: true, data: result.data });
        return;
      }

      if (req.method === "POST" && runOperationalReviewAdjust) {
        const idOrRun = decodeURIComponent(runOperationalReviewAdjust[1]);
        const qRev = loadQueueUnsafe();
        const resolvedRev = resolveRunIdForEvidence(idOrRun, qRev.jobs);
        if (!resolvedRev.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }
        const result = await requestOperationalReviewAdjustment({
          repoRoot,
          runId: resolvedRev.runId,
          notes: body.notes != null ? String(body.notes) : "",
        });
        if (!result.ok) {
          const code = result.code || "operational_review_failed";
          const status =
            code === "notes_required" || code === "execution_not_completed" ? 409 : 400;
          sendJson(res, status, errorPayload(code, result.message));
          return;
        }
        sendJson(res, result.partial ? 202 : 200, {
          ok: true,
          data: result.data,
          message: result.message ?? null,
        });
        return;
      }

      const runOperationalFinalizationGet =
        /^\/runs\/([^/]+)\/operational-finalization$/.exec(p);
      const runOperationalFinalizationFinalize =
        /^\/runs\/([^/]+)\/operational-finalization\/finalize$/.exec(p);
      const runOperationalFinalizationAdjust =
        /^\/runs\/([^/]+)\/operational-finalization\/request-adjustment$/.exec(p);

      if (req.method === "GET" && runOperationalFinalizationGet) {
        const idOrRun = decodeURIComponent(runOperationalFinalizationGet[1]);
        const qFin = loadQueueUnsafe();
        const resolvedFin = resolveRunIdForEvidence(idOrRun, qFin.jobs);
        if (!resolvedFin.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        const fin = getOperationalFinalizationSession(resolvedFin.runId);
        if (!fin.ok) {
          const code = fin.code || "operational_finalization_unavailable";
          const status =
            code === "execution_not_completed" || code === "review_not_confirmed"
              ? 409
              : code === "output_unavailable"
                ? 503
                : 400;
          sendJson(res, status, errorPayload(code, fin.message));
          return;
        }
        sendJson(res, 200, { ok: true, data: fin.data });
        return;
      }

      if (req.method === "POST" && runOperationalFinalizationFinalize) {
        const idOrRun = decodeURIComponent(runOperationalFinalizationFinalize[1]);
        const qFin = loadQueueUnsafe();
        const resolvedFin = resolveRunIdForEvidence(idOrRun, qFin.jobs);
        if (!resolvedFin.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }
        const result = await finalizeOperationalActivity({
          runId: resolvedFin.runId,
          notes: body.notes != null ? String(body.notes) : "",
        });
        if (!result.ok) {
          sendJson(
            res,
            409,
            errorPayload(
              result.code || "operational_finalization_failed",
              result.message,
            ),
          );
          return;
        }
        sendJson(res, 200, { ok: true, data: result.data });
        return;
      }

      if (req.method === "POST" && runOperationalFinalizationAdjust) {
        const idOrRun = decodeURIComponent(runOperationalFinalizationAdjust[1]);
        const qFin = loadQueueUnsafe();
        const resolvedFin = resolveRunIdForEvidence(idOrRun, qFin.jobs);
        if (!resolvedFin.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }
        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }
        const result = await requestOperationalFinalAdjustment({
          runId: resolvedFin.runId,
          notes: body.notes != null ? String(body.notes) : "",
        });
        if (!result.ok) {
          const code = result.code || "operational_finalization_failed";
          const status =
            code === "notes_required" ||
            code === "execution_not_completed" ||
            code === "review_not_confirmed"
              ? 409
              : 400;
          sendJson(res, status, errorPayload(code, result.message));
          return;
        }
        sendJson(res, 200, {
          ok: true,
          data: result.data,
          message: result.message ?? null,
        });
        return;
      }

      const runClarifyPost = /^\/runs\/([^/]+)\/clarification\/(answers|approve|reject|refine)$/.exec(
        p,
      );

      if (req.method === "POST" && runClarifyPost) {
        const idOrRun = decodeURIComponent(runClarifyPost[1]);
        const action = runClarifyPost[2];
        const qMut = loadQueueUnsafe();
        const resolvedMut = resolveRunIdForEvidence(idOrRun, qMut.jobs);

        if (!resolvedMut.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }

        let body = {};
        try {
          const rawBody = await readBodyLimited(req, MAX_JSON_BODY_BYTES);
          if (rawBody && rawBody.trim()) body = JSON.parse(rawBody);
        } catch (e) {
          if (e && e.code === "payload_too_large") {
            sendJson(
              res,
              413,
              errorPayload("payload_too_large", "Corpo JSON excede o limite."),
            );
            return;
          }
          sendJson(res, 400, errorPayload("invalid_json", "JSON inválido."));
          return;
        }

        const skipLlm = body.skipLlm !== false;
        const runOrPath = resolvedMut.runId;

        /** @type {{ question_id: string, value: string }[]} */
        let answerPairs = [];
        if (action === "answers" && Array.isArray(body.answers)) {
          answerPairs = body.answers.map((a) => ({
            question_id: String(a.questionId || a.question_id || "").trim(),
            value: a.value != null ? String(a.value) : "",
          }));
        }

        const recommendedModeRaw =
          body.recommendedMode != null ? String(body.recommendedMode).trim() : "";
        const operatorRecommendedMode =
          recommendedModeRaw === "basic" ||
          recommendedModeRaw === "standard" ||
          recommendedModeRaw === "expert"
            ? recommendedModeRaw
            : null;

        const mut = await runClarificationMutation(runOrPath, {
          answerPairs,
          overwrite: Boolean(body.overwrite),
          refine: action === "refine",
          approve: action === "approve",
          reject: action === "reject",
          approvalNotes: body.notes != null ? String(body.notes) : "",
          operatorRecommendedMode,
          skipLlm,
          jobId: resolvedMut.job?.id ?? null,
          projectId: resolvedMut.job?.projectId ?? null,
        });

        if (mut.ok && action === "approve" && resolvedMut.job?.id) {
          const priorityRaw =
            body.priority != null ? String(body.priority).trim().toLowerCase() : "";
          const priority =
            priorityRaw === "low" || priorityRaw === "normal" || priorityRaw === "high"
              ? priorityRaw
              : null;
          if (operatorRecommendedMode || priority) {
            try {
              updateJob(undefined, resolvedMut.job.id, (j) => ({
                ...j,
                metadata: {
                  ...(j.metadata && typeof j.metadata === "object" ? j.metadata : {}),
                  ...(operatorRecommendedMode
                    ? { recommendedMode: operatorRecommendedMode }
                    : {}),
                  ...(priority ? { priority } : {}),
                },
              }));
            } catch (_) {
              /* */
            }
          }
        }

        if (!mut.ok) {
          const errCode = mut.code || "clarification_mutation_failed";
          const status =
            errCode === "clarification_validation_failed"
              ? 422
              : errCode === "clarification_not_ready"
                ? 409
                : errCode === "clarification_already_processed"
                  ? 409
                  : errCode === "output_unavailable"
                    ? 503
                    : 400;
          sendJson(res, status, errorPayload(errCode, mut.message));
          return;
        }

        try {
          emitRuntimeEvent({
            type: `clarification_${action}`,
            jobId: resolvedMut.job?.id ?? null,
            runId: resolvedMut.runId,
            data: {
              message: mut.message,
              phase2Status: mut.phase2Status,
              runtimePhase: mut.runtimePhase ?? null,
              nextPhase: mut.nextPhase ?? null,
              idempotent: Boolean(mut.idempotent),
            },
          });
        } catch (_) {
          /* */
        }

        sendJson(res, mut.idempotent ? 200 : 200, {
          ok: true,
          data: {
            message: mut.message,
            phase2Status: mut.phase2Status,
            runtimePhase: mut.runtimePhase ?? null,
            runtimeState: mut.runtimePhase ?? null,
            nextPhase: mut.nextPhase ?? null,
            transitionedAt: mut.transitionedAt ?? null,
            idempotent: Boolean(mut.idempotent),
            session: mut.session ?? null,
            refinement: mut.refinement ?? null,
            approvalReadiness: mut.approvalReadiness ?? null,
            updatedAt: mut.updatedAt ?? null,
          },
        });
        return;
      }

      const runArtifactGet = /^\/runs\/([^/]+)\/artifacts\/([^/]+)$/.exec(p);

      if (req.method === "GET" && runArtifactGet) {
        const idOrRun = decodeURIComponent(runArtifactGet[1]);
        const artifactId = decodeURIComponent(runArtifactGet[2]);
        const qArt = loadQueueUnsafe();
        const resolvedArt = resolveRunIdForEvidence(idOrRun, qArt.jobs);

        if (!resolvedArt.runId) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Run ou job não encontrado: ${idOrRun}`),
          );
          return;
        }

        const evBundle = collectRunEvidence(resolvedArt.runId, resolvedArt.job);

        if (!evBundle.ok || !evBundle.data) {
          sendJson(
            res,
            404,
            errorPayload("output_unavailable", "Output indisponível."),
          );
          return;
        }

        const summary = evBundle.data.artifacts.find((a) => a.id === artifactId);

        if (!summary) {
          sendJson(
            res,
            404,
            errorPayload("not_found", `Artifact não encontrado: ${artifactId}`),
          );
          return;
        }

        const contentRes = readArtifactContent(
          resolveOutputDir(resolvedArt.runId, { warnLegacy: false }),
          summary.relativePath,
        );

        if (!contentRes.ok) {
          sendJson(
            res,
            400,
            errorPayload(contentRes.error?.code || "read_failed", contentRes.error?.message || "Leitura falhou."),
          );
          return;
        }

        sendJson(res, 200, {
          ok: true,
          data: {
            ...summary,
            ...contentRes.data,
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

      if (req.method === "OPTIONS" && (p === "/health" || p === "/status" || p === "/runtime/heartbeat" || p === "/projects" || p.startsWith("/projects/") || p === "/workspaces" || p.startsWith("/workspaces/") || p === "/workspace-runs" || p.startsWith("/workspace-runs/") || p.startsWith("/jobs") || p === "/queue" || p === "/diagnostics/events" || p === "/events" || p === "/events/stream" || p === "/runs" || p.startsWith("/runs/") || p.startsWith("/maintenance") || /\/governance$/.test(p))) {
        res.writeHead(204, {
          Allow: "GET,POST,PATCH,DELETE,OPTIONS",
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
