"use strict";

const { appendDaemonLog } = require("./daemon-log");
const { writeDaemonStatus } = require("./daemon-status");
const { emitRuntimeEvent } = require("./runtime-events");
const { getSseObservabilityMetrics } = require("./sse-observability");
const { notifyWorkspaceRunSse } = require("./workspace-run-sse");
const { listWorkspaceRuns, getWorkspaceRun } = require("./workspace-run-registry");
const { advanceWorkspaceRunOrchestration } = require("./workspace-run-orchestrator");
const { reconcileWorkspaceRun } = require("./workspace-run-reconcile");
const { runWithWorkspaceRunLock } = require("./workspace-run-lock");
const { getSetupBossRepoRoot } = require("./repo-root");

const ACTIVE_SYNC_STATUSES = new Set(["running", "waiting_user_action"]);

/** @type {ReturnType<typeof setTimeout>|null} */
let syncTimer = null;

/** Loop ativo mesmo entre ticks agendados. */
let syncLoopActive = false;

/** Evita ticks sobrepostos no mesmo processo (lock por PID é reentrante). */
const inFlightWorkspaceRuns = new Set();

let idleStreak = 0;
let effectiveIntervalMs = 0;

/** @type {{ totalTicks: number, totalAdvanced: number, totalCompleted: number, totalFailed: number, totalErrors: number, processedLastTick: number, skippedByCapLastTick: number, lastDurationMs: number, activeRuns: number }} */
const cumulativeMetrics = {
  totalTicks: 0,
  totalAdvanced: 0,
  totalCompleted: 0,
  totalFailed: 0,
  totalErrors: 0,
  processedLastTick: 0,
  skippedByCapLastTick: 0,
  lastDurationMs: 0,
  activeRuns: 0,
};

function isWorkspaceRunSyncEnabled() {
  const v = process.env.SETUP_BOSS_WORKSPACE_SYNC_ENABLED;
  if (v === "0" || v === "false" || v === "FALSE") return false;
  return true;
}

function workspaceRunSyncIntervalMs() {
  return Math.max(1000, Number(process.env.SETUP_BOSS_WORKSPACE_SYNC_INTERVAL_MS || 5000));
}

function workspaceRunSyncCap() {
  const n = Number(process.env.SETUP_BOSS_WORKSPACE_SYNC_CAP || 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.floor(n);
}

function workspaceRunSyncIdleMaxIntervalMs() {
  const base = workspaceRunSyncIntervalMs();
  const n = Number(process.env.SETUP_BOSS_WORKSPACE_SYNC_IDLE_MAX_INTERVAL_MS || 60_000);
  if (!Number.isFinite(n) || n < base) return Math.max(base, 60_000);
  return Math.floor(n);
}

function workspaceRunSyncOneTimeoutMs() {
  const n = Number(process.env.SETUP_BOSS_WORKSPACE_SYNC_ONE_TIMEOUT_MS || 120_000);
  if (!Number.isFinite(n) || n < 1000) return 120_000;
  return Math.floor(n);
}

/**
 * Ordenação estável: running primeiro, depois updatedAt asc.
 * @param {import('./workspace-run-registry').WorkspaceRunRecord[]} runs
 */
function sortActiveRunsForSync(runs) {
  return [...runs].sort((a, b) => {
    const rank = (s) => (String(s) === "running" ? 0 : 1);
    const ra = rank(a && a.status);
    const rb = rank(b && b.status);
    if (ra !== rb) return ra - rb;
    const ta = Date.parse(a && a.updatedAt) || 0;
    const tb = Date.parse(b && b.updatedAt) || 0;
    if (ta !== tb) return ta - tb;
    return String((a && a.workspaceRunId) || "").localeCompare(
      String((b && b.workspaceRunId) || ""),
    );
  });
}

function computeEffectiveIntervalMs(activeCount) {
  const base = workspaceRunSyncIntervalMs();
  if (activeCount > 0) return base;
  const maxIdle = workspaceRunSyncIdleMaxIntervalMs();
  const factor = Math.min(idleStreak, 10);
  const scaled = Math.min(base * Math.pow(2, factor), maxIdle);
  return Math.max(base, scaled);
}

/**
 * @param {string} eventType
 * @param {string|null} workspaceRunId
 * @param {Record<string, unknown>} [data]
 */
function emitWorkspaceRunSyncLog(eventType, workspaceRunId, data = {}) {
  const suffix = workspaceRunId ? ` workspaceRunId=${workspaceRunId}` : "";
  const extra = Object.keys(data).length ? ` ${JSON.stringify(data)}` : "";
  appendDaemonLog(`${eventType}${suffix}${extra}`);
  try {
    emitRuntimeEvent({
      type: eventType,
      jobId: null,
      runId: null,
      data: {
        ...(workspaceRunId ? { workspaceRunId } : {}),
        ...data,
      },
    });
  } catch (_) {
    /* */
  }
}

/**
 * @param {Promise<unknown>} promise
 * @param {number} ms
 */
function withSyncTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("workspace_run_sync_timeout")), ms);
    }),
  ]);
}

/**
 * @param {Awaited<ReturnType<typeof advanceWorkspaceRunOrchestration>>} advanced
 * @param {string} workspaceRunId
 */
function emitAdvanceOutcome(advanced, workspaceRunId) {
  if (advanced.completed) {
    cumulativeMetrics.totalCompleted += 1;
    emitWorkspaceRunSyncLog("workspace_run_sync.completed", workspaceRunId, {});
    notifyWorkspaceRunSse("workspace_run.completed", workspaceRunId);
    return;
  }
  if (advanced.stopped === "child_failed" || advanced.failed) {
    cumulativeMetrics.totalFailed += 1;
    emitWorkspaceRunSyncLog("workspace_run_sync.failed", workspaceRunId, {
      stopped: advanced.stopped || "failed",
    });
    notifyWorkspaceRunSse("workspace_run.failed", workspaceRunId, {
      message: advanced.stopped || "failed",
    });
    return;
  }
  if (advanced.stopped === "waiting_user_action" || advanced.waiting) {
    emitWorkspaceRunSyncLog("workspace_run_sync.waiting", workspaceRunId, {
      reason: advanced.stopped || "waiting",
    });
    notifyWorkspaceRunSse("workspace_run.waiting_user_action", workspaceRunId, {
      message: advanced.stopped || "waiting",
    });
    return;
  }
  if (advanced.childRunId || advanced.startedMiniActivityId) {
    emitWorkspaceRunSyncLog("workspace_run_sync.advance", workspaceRunId, {
      childRunId: advanced.childRunId || null,
      miniActivityId: advanced.startedMiniActivityId || null,
    });
    notifyWorkspaceRunSse("workspace_run.advanced", workspaceRunId, {
      runId: advanced.childRunId || null,
      miniActivityId: advanced.startedMiniActivityId || null,
    });
    notifyWorkspaceRunSse("workspace_run.updated", workspaceRunId);
  }
}

/**
 * @param {string} workspaceRunId
 * @param {{ repoRoot?: string, advanceFn?: typeof advanceWorkspaceRunOrchestration }} [opts]
 */
async function syncOneWorkspaceRun(workspaceRunId, opts = {}) {
  const id = String(workspaceRunId || "").trim();
  if (!id) return { ok: false, code: "invalid_request" };

  if (inFlightWorkspaceRuns.has(id)) {
    return { ok: true, skipped: true, reason: "in_flight" };
  }

  inFlightWorkspaceRuns.add(id);
  const repoRoot = opts.repoRoot ? String(opts.repoRoot) : getSetupBossRepoRoot();
  const advance = opts.advanceFn || advanceWorkspaceRunOrchestration;
  const timeoutMs = workspaceRunSyncOneTimeoutMs();

  let locked;
  try {
    locked = await withSyncTimeout(
      runWithWorkspaceRunLock(
        workspaceRunId,
        { label: "workspace_run_sync" },
        async () => {
          reconcileWorkspaceRun(workspaceRunId);
          const row = getWorkspaceRun(workspaceRunId);
          if (!row) {
            return { ok: false, code: "not_found" };
          }

          const status = String(row.status || "");
          if (!ACTIVE_SYNC_STATUSES.has(status)) {
            return { ok: true, noop: true, status };
          }

          if (status === "waiting_user_action") {
            emitWorkspaceRunSyncLog("workspace_run_sync.waiting", workspaceRunId, {
              reason: "workspace_waiting_user_action",
            });
            notifyWorkspaceRunSse("workspace_run.waiting_user_action", workspaceRunId, {
              message: "workspace_waiting_user_action",
            });
            return { ok: true, waiting: true };
          }

          const advanced = await advance(workspaceRunId, { repoRoot });
          if (!advanced.ok) {
            emitWorkspaceRunSyncLog("workspace_run_sync.error", workspaceRunId, {
              code: advanced.code || "advance_failed",
              message: advanced.message || null,
            });
            notifyWorkspaceRunSse("workspace_run.error", workspaceRunId, {
              message: advanced.message || advanced.code || "advance_failed",
            });
            return advanced;
          }

          emitAdvanceOutcome(advanced, workspaceRunId);
          return advanced;
        },
      ),
      timeoutMs,
    );

    if (locked && locked.ok === false && locked.code === "workspace_run_orchestration_busy") {
      return { ok: true, skipped: true, reason: "lock_busy" };
    }

    return locked;
  } finally {
    inFlightWorkspaceRuns.delete(id);
  }
}

/**
 * @param {{ repoRoot?: string, advanceFn?: typeof advanceWorkspaceRunOrchestration }} [opts]
 */
async function runWorkspaceRunSyncTick(opts = {}) {
  if (!isWorkspaceRunSyncEnabled()) {
    return { ok: true, disabled: true, processed: 0 };
  }

  const tickStart = Date.now();
  const cap = workspaceRunSyncCap();
  const baseIntervalMs = workspaceRunSyncIntervalMs();

  const activeAll = listWorkspaceRuns().filter((r) =>
    ACTIVE_SYNC_STATUSES.has(String(r && r.status)),
  );
  const active = sortActiveRunsForSync(activeAll);
  const toProcess = active.slice(0, cap);
  const skippedByCap = Math.max(0, active.length - toProcess.length);

  cumulativeMetrics.activeRuns = active.length;
  cumulativeMetrics.processedLastTick = 0;
  cumulativeMetrics.skippedByCapLastTick = skippedByCap;

  emitWorkspaceRunSyncLog("workspace_run_sync.tick", null, {
    activeCount: active.length,
    cap,
    processing: toProcess.length,
    skippedByCap,
  });

  let processed = 0;
  let advanced = 0;
  let errors = 0;

  for (const row of toProcess) {
    if (!row || !row.workspaceRunId) continue;
    try {
      const result = await syncOneWorkspaceRun(row.workspaceRunId, opts);
      processed += 1;
      cumulativeMetrics.processedLastTick = processed;
      if (
        result &&
        (result.completed ||
          result.childRunId ||
          result.startedMiniActivityId ||
          result.stopped)
      ) {
        advanced += 1;
        cumulativeMetrics.totalAdvanced += 1;
      }
      if (result && result.ok === false && !result.skipped) {
        errors += 1;
        cumulativeMetrics.totalErrors += 1;
      }
    } catch (e) {
      processed += 1;
      cumulativeMetrics.processedLastTick = processed;
      errors += 1;
      cumulativeMetrics.totalErrors += 1;
      emitWorkspaceRunSyncLog("workspace_run_sync.error", row.workspaceRunId, {
        message: String((e && e.message) || e),
      });
      notifyWorkspaceRunSse("workspace_run.error", row.workspaceRunId, {
        message: String((e && e.message) || e),
      });
    }
  }

  const prevEffective = effectiveIntervalMs || baseIntervalMs;
  if (active.length > 0) {
    idleStreak = 0;
    effectiveIntervalMs = baseIntervalMs;
  } else {
    idleStreak += 1;
    effectiveIntervalMs = computeEffectiveIntervalMs(0);
    if (effectiveIntervalMs !== prevEffective) {
      emitWorkspaceRunSyncLog("workspace_run_sync.backoff", null, {
        idleStreak,
        effectiveIntervalMs,
        baseIntervalMs,
      });
    }
  }

  const lastDurationMs = Date.now() - tickStart;
  cumulativeMetrics.lastDurationMs = lastDurationMs;
  cumulativeMetrics.totalTicks += 1;

  const sse = getSseObservabilityMetrics();
  const summary = {
    enabled: true,
    intervalMs: baseIntervalMs,
    effectiveIntervalMs: effectiveIntervalMs || baseIntervalMs,
    cap,
    activeRuns: active.length,
    processedLastTick: processed,
    skippedByCapLastTick: skippedByCap,
    lastTickAt: new Date().toISOString(),
    lastDurationMs,
    totalTicks: cumulativeMetrics.totalTicks,
    totalAdvanced: cumulativeMetrics.totalAdvanced,
    totalCompleted: cumulativeMetrics.totalCompleted,
    totalFailed: cumulativeMetrics.totalFailed,
    totalErrors: cumulativeMetrics.totalErrors,
    sseConnectedClients: sse.connectedClients,
    sseEventsEmitted: sse.eventsEmitted,
    idleStreak,
    processed,
    advanced,
    errors,
    activeCount: active.length,
  };

  emitWorkspaceRunSyncLog("workspace_run_sync.summary", null, {
    processed,
    skippedByCap,
    advanced,
    errors,
    lastDurationMs,
    effectiveIntervalMs: summary.effectiveIntervalMs,
  });

  try {
    writeDaemonStatus({ workspaceRunSync: summary });
  } catch (_) {
    /* */
  }

  return { ok: true, ...summary };
}

/**
 * @param {{ repoRoot?: string }} tickOpts
 * @param {number} delayMs
 */
function scheduleWorkspaceRunSyncTick(tickOpts, delayMs) {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    runWorkspaceRunSyncTick(tickOpts)
      .catch((e) => {
        emitWorkspaceRunSyncLog("workspace_run_sync.error", null, {
          message: String((e && e.message) || e),
          phase: "scheduled_tick",
        });
      })
      .finally(() => {
        if (!syncLoopActive) return;
        const ms = effectiveIntervalMs || workspaceRunSyncIntervalMs();
        scheduleWorkspaceRunSyncTick(tickOpts, ms);
      });
  }, delayMs);
}

/** Reset backoff após evento novo (start/resume). */
function resetWorkspaceRunSyncBackoff() {
  const base = workspaceRunSyncIntervalMs();
  const hadBackoff = idleStreak > 0 || effectiveIntervalMs > base;
  idleStreak = 0;
  effectiveIntervalMs = base;
  if (hadBackoff) {
    emitWorkspaceRunSyncLog("workspace_run_sync.backoff", null, {
      action: "reset",
      effectiveIntervalMs: base,
    });
  }
}

/**
 * @param {{ repoRoot?: string }} [opts]
 * @returns {ReturnType<typeof setTimeout>|null}
 */
function startWorkspaceRunSyncLoop(opts = {}) {
  stopWorkspaceRunSyncLoop();

  const intervalMs = workspaceRunSyncIntervalMs();
  effectiveIntervalMs = intervalMs;
  idleStreak = 0;
  syncLoopActive = false;

  if (!isWorkspaceRunSyncEnabled()) {
    try {
      writeDaemonStatus({
        workspaceRunSync: {
          enabled: false,
          intervalMs,
          effectiveIntervalMs: intervalMs,
          cap: workspaceRunSyncCap(),
          lastTickAt: null,
        },
      });
    } catch (_) {
      /* */
    }
    appendDaemonLog("workspace_run_sync.disabled");
    return null;
  }

  const tickOpts = { repoRoot: opts.repoRoot };
  appendDaemonLog(
    `workspace_run_sync.start intervalMs=${intervalMs} cap=${workspaceRunSyncCap()} idleMaxMs=${workspaceRunSyncIdleMaxIntervalMs()}`,
  );

  runWorkspaceRunSyncTick(tickOpts).catch((e) => {
    emitWorkspaceRunSyncLog("workspace_run_sync.error", null, {
      message: String((e && e.message) || e),
      phase: "initial_tick",
    });
  });

  syncLoopActive = true;
  scheduleWorkspaceRunSyncTick(tickOpts, intervalMs);

  try {
    writeDaemonStatus({
      workspaceRunSync: {
        enabled: true,
        intervalMs,
        effectiveIntervalMs: intervalMs,
        cap: workspaceRunSyncCap(),
        startedAt: new Date().toISOString(),
      },
    });
  } catch (_) {
    /* */
  }

  return syncTimer;
}

function stopWorkspaceRunSyncLoop() {
  syncLoopActive = false;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    appendDaemonLog("workspace_run_sync.stop");
  }
}

function isWorkspaceRunSyncLoopRunning() {
  return syncLoopActive;
}

function getWorkspaceRunSyncMetrics() {
  return { ...cumulativeMetrics };
}

function resetWorkspaceRunSyncMetricsForTest() {
  cumulativeMetrics.totalTicks = 0;
  cumulativeMetrics.totalAdvanced = 0;
  cumulativeMetrics.totalCompleted = 0;
  cumulativeMetrics.totalFailed = 0;
  cumulativeMetrics.totalErrors = 0;
  cumulativeMetrics.processedLastTick = 0;
  cumulativeMetrics.skippedByCapLastTick = 0;
  cumulativeMetrics.lastDurationMs = 0;
  cumulativeMetrics.activeRuns = 0;
  idleStreak = 0;
  effectiveIntervalMs = workspaceRunSyncIntervalMs();
}

module.exports = {
  ACTIVE_SYNC_STATUSES,
  isWorkspaceRunSyncEnabled,
  workspaceRunSyncIntervalMs,
  workspaceRunSyncCap,
  workspaceRunSyncIdleMaxIntervalMs,
  sortActiveRunsForSync,
  syncOneWorkspaceRun,
  runWorkspaceRunSyncTick,
  startWorkspaceRunSyncLoop,
  stopWorkspaceRunSyncLoop,
  isWorkspaceRunSyncLoopRunning,
  resetWorkspaceRunSyncBackoff,
  emitWorkspaceRunSyncLog,
  getWorkspaceRunSyncMetrics,
  resetWorkspaceRunSyncMetricsForTest,
};
