"use strict";

const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { runStrategyRuntimeBase } = require("../../runtime/strategy-runtime/run-strategy-runtime");
const { collectStrategyForRun } = require("./run-strategy");
const runtimeLogger = require("../../runtime/logger");
const { emitRuntimeEvent } = require("./runtime-events");
const { promoteJobUiPhaseForRun } = require("./promote-job-ui-phase");
const {
  getWorkspaceRun,
  loadWorkspaceRunsUnsafe,
  updateWorkspaceRun,
} = require("./workspace-run-registry");
const { resolveProjectRecord } = require("./project-registry");
const { resolveSetupBossRepoRoot } = require("../../../core/validate-project-knowledge-base");
const { syncWorkspaceAfterPlanningStrategy } = require("../../../core/sync-workspace-after-planning-strategy");

/**
 * @param {string} projectId
 */
function resolveProjectForWorkspaceStrategy(projectId) {
  const id = String(projectId || "").trim();
  if (!id) return null;
  try {
    const resolved = resolveProjectRecord(id, {
      repoRoot: resolveSetupBossRepoRoot(),
      jobs: [],
    });
    const rec = resolved.record;
    if (!rec) return null;
    return {
      projectId: rec.projectId,
      displayName: rec.displayName || rec.name || id,
      projectRoot: rec.projectRoot,
    };
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   runId: string,
 *   jobId?: string|null,
 *   projectId?: string|null,
 *   force?: boolean,
 * }} input
 * @returns {Promise<{
 *   ok: true,
 *   idempotent?: boolean,
 *   data: {
 *     skipped: boolean,
 *     strategySummary: object|null,
 *   },
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 * }>}
 */
async function triggerStrategyRun(input) {
  const runId = String(input.runId || "").trim();
  const jobId = input.jobId != null ? String(input.jobId) : null;
  const projectId =
    input.projectId != undefined && input.projectId != null && String(input.projectId).trim()
      ? String(input.projectId).trim()
      : null;
  const force = Boolean(input.force);

  if (!runId) {
    return { ok: false, code: "run_id_required", message: "runId é obrigatório." };
  }

  let outputDirAbs;
  try {
    outputDirAbs = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    const msg = e && /** @type {{ message?: string }} */ (e).message ? String(e.message) : "Output indisponível.";
    return { ok: false, code: "output_unavailable", message: msg };
  }

  runtimeLogger.info("runtime.strategy_start_requested", {
    runId,
    jobId,
    projectId,
    outputDir: outputDirAbs,
    force,
  });

  try {
    emitRuntimeEvent({
      type: "strategy_requested",
      jobId,
      runId,
      projectId,
      data: { outputDir: outputDirAbs, force },
    });
  } catch (_) {
    /* */
  }

  runtimeLogger.info("runtime.strategy_started", {
    runId,
    jobId,
    projectId,
    outputDir: outputDirAbs,
  });

  try {
    emitRuntimeEvent({
      type: "strategy_started",
      jobId,
      runId,
      projectId,
      data: { outputDir: outputDirAbs },
    });
  } catch (_) {
    /* */
  }

  const emitProgress = (type, data = {}) => {
    runtimeLogger.info(type, { runId, jobId, projectId, ...data });
    try {
      emitRuntimeEvent({
        type,
        jobId,
        runId,
        projectId,
        data,
      });
    } catch (_) {
      /* */
    }
  };

  const r = runStrategyRuntimeBase({
    outputDirAbs,
    runId,
    force,
    onProgress: emitProgress,
    getWorkspaceRun,
    resolveProject: resolveProjectForWorkspaceStrategy,
  });

  if (!r.ok) {
    const msg =
      r.error && typeof r.error === "object" && r.error.message != null
        ? String(r.error.message)
        : "Strategy falhou.";
    const codeRaw =
      r.error && typeof r.error === "object" && r.error.code != null
        ? String(r.error.code)
        : "STRATEGY_FAILED";

    runtimeLogger.warn("runtime.strategy_failed", {
      runId,
      jobId,
      projectId,
      code: codeRaw,
      message: msg,
    });

    try {
      emitRuntimeEvent({
        type: "strategy_failed",
        jobId,
        runId,
        projectId,
        data: { code: codeRaw, message: msg },
      });
    } catch (_) {
      /* */
    }

    return {
      ok: false,
      code: codeRaw.toLowerCase().replace(/\s+/g, "_"),
      message: msg,
    };
  }

  runtimeLogger.info("runtime.strategy_completed", {
    runId,
    jobId,
    projectId,
    skipped: Boolean(r.skipped),
    artifactsCount: Array.isArray(r.artifacts) ? r.artifacts.length : 0,
  });

  try {
    emitRuntimeEvent({
      type: "strategy_completed",
      jobId,
      runId,
      projectId,
      data: {
        skipped: Boolean(r.skipped),
        artifactCount: Array.isArray(r.artifacts) ? r.artifacts.length : 0,
      },
    });
  } catch (_) {
    /* */
  }

  const bundle = collectStrategyForRun(runId);

  try {
    const wsSync = syncWorkspaceAfterPlanningStrategy({
      planningRunId: runId,
      outputDirAbs,
      loadWorkspaceRuns: () => loadWorkspaceRunsUnsafe(),
      getWorkspaceRun,
      updateWorkspaceRun,
      resolveProject: resolveProjectForWorkspaceStrategy,
      force,
    });
    emitProgress("workspace_after_strategy_sync", {
      ok: wsSync.ok,
      skipped: Boolean(wsSync.skipped),
      code: wsSync.code || null,
      workspaceRunId: wsSync.workspaceRunId || null,
      miniActivityCount: wsSync.miniActivityCount ?? null,
    });
    if (wsSync.ok && wsSync.workspaceRunId && !wsSync.skipped) {
      try {
        const { notifyWorkspaceRunSse } = require("./workspace-run-sse");
        notifyWorkspaceRunSse("workspace_run.updated", wsSync.workspaceRunId, {
          runId,
          message: `Materializadas ${wsSync.miniActivityCount ?? 0} mini-atividades`,
        });
      } catch (_) {
        /* */
      }
    }
  } catch (wsErr) {
    runtimeLogger.warn("runtime.workspace_after_strategy_sync_failed", {
      runId,
      message: wsErr && wsErr.message ? String(wsErr.message) : String(wsErr),
    });
  }

  try {
    promoteJobUiPhaseForRun(runId, "strategy", {
      uiState: "strategy_ready",
      jobId: input.jobId ?? null,
    });
  } catch (_) {
    /* */
  }

  return {
    ok: true,
    idempotent: Boolean(r.skipped),
    data: {
      skipped: Boolean(r.skipped),
      strategySummary: bundle.ok && bundle.data ? bundle.data.summary : null,
    },
  };
}

module.exports = {
  triggerStrategyRun,
  resolveProjectForWorkspaceStrategy,
};
