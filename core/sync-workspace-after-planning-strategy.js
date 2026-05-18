"use strict";

const fs = require("fs");
const path = require("path");

const { loadOrBuildOperationalExecutableStrategy } = require("./load-operational-executable-strategy");
const { buildOperationalExecutableStrategy } = require("./build-operational-executable-strategy");
const {
  oesMiniTasksToWorkspaceMiniActivities,
} = require("./materialize-workspace-mini-activities-from-oes");
const { parseWorkspaceGlobalSpec } = require("./parse-workspace-global-spec");
const {
  findWorkspaceRunByPlanningRunId,
  buildWorkspaceStrategyContextFromRun,
} = require("./workspace-strategy-context");

/**
 * @param {string} fp
 */
function readJsonObject(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDirAbs
 */
function loadWorkspaceLinkFromRunContext(outputDirAbs) {
  const ctx = readJsonObject(path.join(outputDirAbs, "run-context.json"));
  if (!ctx || !ctx.workspace || typeof ctx.workspace !== "object") return null;
  const w = ctx.workspace;
  return {
    workspaceRunId: w.workspaceRunId != null ? String(w.workspaceRunId).trim() : "",
    workspaceId: w.workspaceId != null ? String(w.workspaceId).trim() : "",
  };
}

/**
 * @param {{
 *   planningRunId: string,
 *   outputDirAbs: string,
 *   loadWorkspaceRuns: () => { workspaceRuns: object[] },
 *   getWorkspaceRun: (id: string) => object|null,
 *   updateWorkspaceRun: (id: string, patch: object) => { ok: boolean, workspaceRun?: object, errors?: object[] },
 *   resolveProject?: (id: string) => object|null,
 *   force?: boolean,
 * }} deps
 */
function syncWorkspaceAfterPlanningStrategy(deps) {
  const planningRunId = String(deps.planningRunId || "").trim();
  const outputDirAbs = path.resolve(String(deps.outputDirAbs || ""));
  const force = Boolean(deps.force);

  if (!planningRunId) {
    return { ok: false, code: "planning_run_id_required", message: "planningRunId obrigatório." };
  }

  const link = loadWorkspaceLinkFromRunContext(outputDirAbs);
  let workspaceRunRow = null;

  if (link?.workspaceRunId) {
    workspaceRunRow = deps.getWorkspaceRun(link.workspaceRunId);
  }

  if (!workspaceRunRow) {
    const payload = deps.loadWorkspaceRuns();
    const found = findWorkspaceRunByPlanningRunId(
      payload.workspaceRuns || [],
      planningRunId,
    );
    if (found) {
      workspaceRunRow = {
        workspaceRunId: found.workspaceRun.workspaceRunId,
        workspaceId: found.workspaceRun.workspaceId,
        globalSpec: found.workspaceRun.globalSpec,
        miniActivities: found.workspaceRun.miniActivities,
        status: found.workspaceRun.status,
      };
    }
  }

  if (!workspaceRunRow) {
    return {
      ok: false,
      code: "workspace_run_not_linked",
      message: "Nenhum WorkspaceRun ligado a esta corrida de planeamento.",
      skipped: true,
    };
  }

  const wsCtx = buildWorkspaceStrategyContextFromRun(
    workspaceRunRow,
    deps.resolveProject || (() => null),
  );
  if (!wsCtx.ok) {
    return { ok: false, code: wsCtx.code, message: wsCtx.message };
  }

  if (
    !force &&
    Array.isArray(workspaceRunRow.miniActivities) &&
    workspaceRunRow.miniActivities.length > 0
  ) {
    return {
      ok: true,
      skipped: true,
      workspaceRunId: workspaceRunRow.workspaceRunId,
      miniActivityCount: workspaceRunRow.miniActivities.length,
      phase: "operational",
    };
  }

  let oesResult = loadOrBuildOperationalExecutableStrategy(outputDirAbs, {
    runId: planningRunId,
    writeIfBuilt: false,
  });

  if (!oesResult.artifact?.miniTasks?.length) {
    const rebuilt = buildOperationalExecutableStrategy({
      outputDirAbs,
      runId: planningRunId,
      write: true,
      workspaceContext: wsCtx,
    });
    if (!rebuilt.ok) {
      return {
        ok: false,
        code: "oes_build_failed",
        message: rebuilt.error?.message || "Falha ao gerar OES.",
      };
    }
    oesResult = { artifact: rebuilt.artifact, built: true };
  }

  const artifact = oesResult.artifact;
  if (!artifact?.miniTasks?.length) {
    return {
      ok: false,
      code: "oes_no_mini_tasks",
      message: "OES sem miniTasks para materializar no workspace.",
    };
  }

  const missingProject = artifact.miniTasks.some(
    (mt) => !mt.projectId || !String(mt.projectId).trim(),
  );
  if (missingProject && wsCtx.multiRepo) {
    return {
      ok: false,
      code: "oes_missing_project_id",
      message: "OES multi-repo exige projectId em cada miniTask.",
    };
  }

  let miniActivities;
  try {
    miniActivities = oesMiniTasksToWorkspaceMiniActivities({
      oesArtifact: artifact,
      workspaceProjectIds: wsCtx.projectIds,
    });
  } catch (e) {
    return {
      ok: false,
      code: "workspace_mini_materialize_failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  if (!miniActivities.length) {
    return {
      ok: false,
      code: "workspace_mini_empty",
      message: "Materialização gerou zero miniActivities.",
    };
  }

  const spec = parseWorkspaceGlobalSpec(workspaceRunRow.globalSpec);
  const globalSpec = {
    ...(spec || { schemaVersion: 1, task: wsCtx.task, projectIds: wsCtx.projectIds }),
    planningRunId,
    planningProjectId: wsCtx.planningProjectId,
    materializedAt: new Date().toISOString(),
    oesRunId: planningRunId,
    phase: "materialized",
  };

  const updated = deps.updateWorkspaceRun(workspaceRunRow.workspaceRunId, {
    miniActivities,
    status: "planned",
    globalSpec,
  });

  if (!updated.ok) {
    return {
      ok: false,
      code: "workspace_run_update_failed",
      message: "Falha ao persistir miniActivities no WorkspaceRun.",
      validation: updated.errors,
    };
  }

  return {
    ok: true,
    workspaceRunId: workspaceRunRow.workspaceRunId,
    miniActivityCount: miniActivities.length,
    phase: "operational",
    oesMiniTaskCount: artifact.miniTasks.length,
    multiRepo: wsCtx.multiRepo,
  };
}

module.exports = {
  loadWorkspaceLinkFromRunContext,
  syncWorkspaceAfterPlanningStrategy,
};
