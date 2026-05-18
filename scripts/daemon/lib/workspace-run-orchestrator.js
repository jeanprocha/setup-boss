"use strict";

const fs = require("fs");
const path = require("path");
const { resolveRunIndexPath, writeRunIndex, resolveOutputDir } = require("../../../core/run-resolver");
const { resolveChildRunOrchestrationStatus } = require("../../../core/workspace-child-run-status");
const { getWorkspace } = require("./workspace-registry");
const {
  getWorkspaceRun,
  updateWorkspaceRun,
} = require("./workspace-run-registry");
const { createRunFromTask } = require("./run-intake-api");
const { findProjectRecord } = require("./project-registry");
const { getSetupBossRepoRoot } = require("./repo-root");
const { assertWorkspaceGitReadyForExecution } = require("./workspace-run-git-api");
const { runWithWorkspaceRunLock } = require("./workspace-run-lock");
const { reconcileWorkspaceRun } = require("./workspace-run-reconcile");

const TERMINAL_WORKSPACE = new Set(["completed", "failed", "cancelled"]);
const STARTABLE_WORKSPACE = new Set(["draft", "planned"]);
const RESUMABLE_WORKSPACE = new Set(["waiting_user_action", "failed", "running"]);

/** @typedef {import("../../../core/validate-mini-activity").MiniActivityRecord} MiniActivityRecord */

/**
 * @param {string} runId
 * @param {string} workspaceRunId
 * @param {string} miniActivityId
 */
function patchRunIndexWorkspaceLink(runId, workspaceRunId, miniActivityId) {
  const indexPath = resolveRunIndexPath(runId);
  if (!fs.existsSync(indexPath)) return false;
  try {
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const projectRoot = idx.project_root ? path.resolve(String(idx.project_root)) : null;
    const outputDir = idx.output_dir ? path.resolve(String(idx.output_dir)) : null;
    if (!projectRoot || !outputDir) return false;
    writeRunIndex({
      runId,
      projectRoot,
      outputDir,
      run_type: idx.run_type,
      workspaceRunId,
      miniActivityId,
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {MiniActivityRecord} mini
 * @param {{ title: string, workspaceRunId: string, description?: string|null }} wsRun
 */
function buildMiniActivityTaskText(mini, wsRun) {
  const parts = [
    `[WorkspaceRun ${wsRun.workspaceRunId}] ${wsRun.title}`,
    "",
    `Mini-atividade: ${mini.title}`,
  ];
  if (mini.description) parts.push("", String(mini.description));
  if (wsRun.description) parts.push("", `Contexto global: ${wsRun.description}`);
  parts.push(
    "",
    "Executar esta fatia no projeto alvo seguindo o fluxo padrão Setup Boss (intake, clarificação, strategy, execução).",
  );
  return parts.join("\n");
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 */
function indexMiniActivities(miniActivities) {
  /** @type {Map<string, MiniActivityRecord>} */
  const byId = new Map();
  for (const m of miniActivities || []) {
    if (m && m.miniActivityId) byId.set(m.miniActivityId, m);
  }
  return byId;
}

/**
 * @param {MiniActivityRecord} mini
 * @param {Map<string, MiniActivityRecord>} byId
 */
function dependenciesSatisfied(mini, byId) {
  for (const dep of mini.dependsOnMiniActivityIds || []) {
    const d = byId.get(dep);
    if (!d) return false;
    const st = String(d.status || "");
    if (st !== "completed" && st !== "skipped") return false;
  }
  return true;
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 * @returns {MiniActivityRecord|null}
 */
/** MiniActivity com run filho activo para polling de estado. */
function findActiveMiniForPoll(miniActivities) {
  for (const m of miniActivities || []) {
    if (!m || !m.runId) continue;
    const st = String(m.status || "");
    if (st === "running" || st === "waiting_user_action") return m;
  }
  return null;
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 * @returns {MiniActivityRecord|null}
 */
function pickNextEligibleMiniActivity(miniActivities) {
  const byId = indexMiniActivities(miniActivities);
  const candidates = (miniActivities || [])
    .filter((m) => {
      if (!m) return false;
      const st = String(m.status || "");
      if (st !== "pending" && st !== "ready") return false;
      if (m.runId) return false;
      return dependenciesSatisfied(m, byId);
    })
    .sort((a, b) => a.order - b.order);
  return candidates[0] || null;
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 */
function allMiniActivitiesTerminal(miniActivities) {
  if (!miniActivities || miniActivities.length === 0) return false;
  return miniActivities.every((m) => {
    const st = String(m && m.status);
    return st === "completed" || st === "skipped";
  });
}

/**
 * @param {MiniActivityRecord[]} miniActivities
 * @param {string} miniActivityId
 * @param {Partial<MiniActivityRecord>} patch
 */
function patchMiniActivityList(miniActivities, miniActivityId, patch) {
  const now = new Date().toISOString();
  return miniActivities.map((m) => {
    if (!m || m.miniActivityId !== miniActivityId) return m;
    return {
      ...m,
      ...patch,
      miniActivityId: m.miniActivityId,
      updatedAt: now,
    };
  });
}

/**
 * @param {string} workspaceRunId
 * @param {{ repoRoot?: string, createRunFromTaskFn?: typeof createRunFromTask, resolveChildStatusFn?: typeof resolveChildRunOrchestrationStatus }} [opts]
 */
async function advanceWorkspaceRunOrchestration(workspaceRunId, opts = {}) {
  const depth = Number(opts._depth) || 0;
  const repoRoot = opts.repoRoot ? path.resolve(String(opts.repoRoot)) : getSetupBossRepoRoot();
  const createRun = opts.createRunFromTaskFn || createRunFromTask;
  const resolveChild = opts.resolveChildStatusFn || resolveChildRunOrchestrationStatus;

  const row = getWorkspaceRun(workspaceRunId);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
  }

  if (TERMINAL_WORKSPACE.has(String(row.status))) {
    return { ok: true, workspaceRun: row, noop: true };
  }

  let miniActivities = row.miniActivities.map((m) => ({ ...m }));

  const active = findActiveMiniForPoll(miniActivities);
  if (active && active.runId) {
    const child = resolveChild(active.runId, opts);
    if (child.phase === "completed") {
      miniActivities = patchMiniActivityList(miniActivities, active.miniActivityId, {
        status: "completed",
      });
    } else if (child.phase === "failed") {
      const updated = updateWorkspaceRun(workspaceRunId, {
        status: "failed",
        miniActivities: patchMiniActivityList(miniActivities, active.miniActivityId, {
          status: "failed",
        }),
      });
      return updated.ok
        ? { ok: true, workspaceRun: updated.workspaceRun, stopped: "child_failed" }
        : updated;
    } else if (child.phase === "waiting_user_action") {
      const updated = updateWorkspaceRun(workspaceRunId, {
        status: "waiting_user_action",
        miniActivities: patchMiniActivityList(miniActivities, active.miniActivityId, {
          status: "waiting_user_action",
        }),
      });
      return updated.ok
        ? { ok: true, workspaceRun: updated.workspaceRun, stopped: "waiting_user_action" }
        : updated;
    } else {
      return { ok: true, workspaceRun: row, inProgress: true, activeMiniActivityId: active.miniActivityId };
    }
  }

  if (allMiniActivitiesTerminal(miniActivities)) {
    const updated = updateWorkspaceRun(workspaceRunId, {
      status: "completed",
      miniActivities,
    });
    return updated.ok
      ? { ok: true, workspaceRun: updated.workspaceRun, completed: true }
      : updated;
  }

  const next = pickNextEligibleMiniActivity(miniActivities);
  if (!next) {
    const anyFailed = miniActivities.some((m) => m && m.status === "failed");
    const anyWaiting = miniActivities.some((m) => m && m.status === "waiting_user_action");
    if (anyWaiting) {
      return { ok: true, workspaceRun: getWorkspaceRun(workspaceRunId), waiting: true };
    }
    if (anyFailed) {
      const updated = updateWorkspaceRun(workspaceRunId, { status: "failed", miniActivities });
      return updated.ok ? { ok: true, workspaceRun: updated.workspaceRun, failed: true } : updated;
    }
    return { ok: true, workspaceRun: getWorkspaceRun(workspaceRunId), idle: true };
  }

  const ws = getWorkspace(row.workspaceId);
  if (!ws) {
    return { ok: false, code: "workspace_not_found", message: "Workspace não encontrado." };
  }
  if (!findProjectRecord(next.targetProjectId)) {
    return {
      ok: false,
      code: "project_not_found",
      message: `Projeto alvo inexistente: ${next.targetProjectId}`,
    };
  }

  if (next.runId) {
    return { ok: true, workspaceRun: row, inProgress: true, activeMiniActivityId: next.miniActivityId };
  }

  const task = buildMiniActivityTaskText(next, {
    title: row.title,
    workspaceRunId: row.workspaceRunId,
    description: row.description,
  });

  const gitGate = assertWorkspaceGitReadyForExecution(row);
  const workspaceActivityBranch = gitGate.ok ? gitGate.activityBranch : null;

  const created = await createRun({
    repoRoot,
    projectId: next.targetProjectId,
    task,
    metadata: {
      source: "workspace_orchestrator",
      workspaceRunId: row.workspaceRunId,
      miniActivityId: next.miniActivityId,
      skipLlm: true,
      ...(workspaceActivityBranch ? { workspaceActivityBranch } : {}),
    },
  });

  if (!created.ok) {
    const failedMinis = patchMiniActivityList(miniActivities, next.miniActivityId, {
      status: "failed",
    });
    const updated = updateWorkspaceRun(workspaceRunId, {
      status: "failed",
      miniActivities: failedMinis,
    });
    return {
      ok: false,
      code: created.error?.code || "child_run_create_failed",
      message: created.error?.message || "Falha ao criar run filho.",
      workspaceRun: updated.ok ? updated.workspaceRun : undefined,
    };
  }

  const childRunId = created.data.runId;
  patchRunIndexWorkspaceLink(childRunId, row.workspaceRunId, next.miniActivityId);

  try {
    const outDir = resolveOutputDir(childRunId, { warnLegacy: false });
    const ctxPath = path.join(outDir, "run-context.json");
    if (fs.existsSync(ctxPath)) {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
      ctx.workspace_run_id = row.workspaceRunId;
      ctx.mini_activity_id = next.miniActivityId;
      if (workspaceActivityBranch) {
        ctx.workspace_activity_branch = workspaceActivityBranch;
        const prevGit =
          ctx.git && typeof ctx.git === "object" && !Array.isArray(ctx.git)
            ? { .../** @type {Record<string, unknown>} */ (ctx.git) }
            : {};
        ctx.git = {
          ...prevGit,
          enabled: true,
          activityBranch: workspaceActivityBranch,
          workspaceGitPrepared: true,
        };
      }
      fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), "utf-8");
    }
  } catch (_) {
    /* opcional */
  }

  miniActivities = patchMiniActivityList(miniActivities, next.miniActivityId, {
    status: "running",
    runId: childRunId,
  });

  const updated = updateWorkspaceRun(workspaceRunId, {
    status: "running",
    miniActivities,
  });

  if (!updated.ok) return updated;

  if (depth < 8) {
    return advanceWorkspaceRunOrchestration(workspaceRunId, {
      ...opts,
      _depth: depth + 1,
    });
  }

  return {
    ok: true,
    workspaceRun: updated.workspaceRun,
    startedMiniActivityId: next.miniActivityId,
    childRunId,
  };
}

/**
 * @param {string} workspaceRunId
 * @param {{ repoRoot?: string, createRunFromTaskFn?: typeof createRunFromTask, resolveChildStatusFn?: typeof resolveChildRunOrchestrationStatus }} [opts]
 */
async function startWorkspaceRun(workspaceRunId, opts = {}) {
  return runWithWorkspaceRunLock(workspaceRunId, { label: "start" }, async () => {
    reconcileWorkspaceRun(workspaceRunId);
    const row = getWorkspaceRun(workspaceRunId);
    if (!row) {
      return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
    }
    if (!row.miniActivities || row.miniActivities.length === 0) {
      return {
        ok: false,
        code: "workspace_run_no_mini_activities",
        message: "WorkspaceRun não tem miniActivities para orquestrar.",
      };
    }

    const gitGate = assertWorkspaceGitReadyForExecution(row);
    if (!gitGate.ok) {
      return gitGate;
    }

    if (String(row.status) === "running") {
      return {
        ok: false,
        code: "workspace_run_already_running",
        message: "WorkspaceRun já está em execução.",
      };
    }
    if (!STARTABLE_WORKSPACE.has(String(row.status))) {
      return {
        ok: false,
        code: "workspace_run_not_startable",
        message: `Status não permite start: ${row.status}`,
      };
    }

    const primed = updateWorkspaceRun(workspaceRunId, { status: "running" });
    if (!primed.ok) return primed;

    return advanceWorkspaceRunOrchestration(workspaceRunId, opts);
  });
}

/**
 * @param {string} workspaceRunId
 * @param {{ repoRoot?: string, createRunFromTaskFn?: typeof createRunFromTask, resolveChildStatusFn?: typeof resolveChildRunOrchestrationStatus }} [opts]
 */
async function resumeWorkspaceRun(workspaceRunId, opts = {}) {
  return runWithWorkspaceRunLock(workspaceRunId, { label: "resume" }, async () => {
    reconcileWorkspaceRun(workspaceRunId);
    const row = getWorkspaceRun(workspaceRunId);
    if (!row) {
      return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
    }
    if (!RESUMABLE_WORKSPACE.has(String(row.status))) {
      return {
        ok: false,
        code: "workspace_run_not_resumable",
        message: `Status não permite resume: ${row.status}`,
      };
    }

    if (String(row.status) !== "running") {
      const primed = updateWorkspaceRun(workspaceRunId, { status: "running" });
      if (!primed.ok) return primed;
    }

    return advanceWorkspaceRunOrchestration(workspaceRunId, opts);
  });
}

/**
 * @param {string} workspaceRunId
 * @param {string} miniActivityId
 * @param {{ repoRoot?: string, resetRunId?: boolean }} [opts]
 */
async function retryMiniActivity(workspaceRunId, miniActivityId, opts = {}) {
  return runWithWorkspaceRunLock(workspaceRunId, { label: "retry_mini" }, async () => {
    reconcileWorkspaceRun(workspaceRunId);
    const row = getWorkspaceRun(workspaceRunId);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
  }
  const ma = row.miniActivities.find((m) => m && m.miniActivityId === miniActivityId);
  if (!ma) {
    return { ok: false, code: "not_found", message: `miniActivity não encontrada: ${miniActivityId}` };
  }
  if (!["failed", "waiting_user_action", "cancelled"].includes(String(ma.status))) {
    return {
      ok: false,
      code: "mini_activity_not_retryable",
      message: `miniActivity em status não retentável: ${ma.status}`,
    };
  }

  const resetRunId = opts.resetRunId !== false;
  const miniActivities = patchMiniActivityList(row.miniActivities, miniActivityId, {
    status: "ready",
    ...(resetRunId ? { runId: null } : {}),
  });

  const primed = updateWorkspaceRun(workspaceRunId, {
    status: "running",
    miniActivities,
  });
  if (!primed.ok) return primed;

    return advanceWorkspaceRunOrchestration(workspaceRunId, opts);
  });
}

/**
 * @param {string} workspaceRunId
 * @param {string} miniActivityId
 * @param {{ repoRoot?: string }} [opts]
 */
async function skipMiniActivity(workspaceRunId, miniActivityId, opts = {}) {
  return runWithWorkspaceRunLock(workspaceRunId, { label: "skip_mini" }, async () => {
    reconcileWorkspaceRun(workspaceRunId);
    const row = getWorkspaceRun(workspaceRunId);
  if (!row) {
    return { ok: false, code: "not_found", message: `WorkspaceRun não encontrado: ${workspaceRunId}` };
  }
  const ma = row.miniActivities.find((m) => m && m.miniActivityId === miniActivityId);
  if (!ma) {
    return { ok: false, code: "not_found", message: `miniActivity não encontrada: ${miniActivityId}` };
  }
  if (["completed", "skipped"].includes(String(ma.status))) {
    return {
      ok: false,
      code: "mini_activity_not_skippable",
      message: `miniActivity já terminal: ${ma.status}`,
    };
  }

  const miniActivities = patchMiniActivityList(row.miniActivities, miniActivityId, {
    status: "skipped",
  });

  const primed = updateWorkspaceRun(workspaceRunId, {
    status: "running",
    miniActivities,
  });
  if (!primed.ok) return primed;

    return advanceWorkspaceRunOrchestration(workspaceRunId, opts);
  });
}

module.exports = {
  startWorkspaceRun,
  resumeWorkspaceRun,
  advanceWorkspaceRunOrchestration,
  retryMiniActivity,
  skipMiniActivity,
  patchRunIndexWorkspaceLink,
  buildMiniActivityTaskText,
  pickNextEligibleMiniActivity,
  findActiveMiniForPoll,
};
