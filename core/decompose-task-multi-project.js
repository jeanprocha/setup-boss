"use strict";

const fs = require("fs");
const path = require("path");

const { PLAN_REFINED } = require("../scripts/runtime/strategy-runtime/analyze-complexity");
const {
  parseMarkdownSections,
  extractFilePaths,
  MAX_SUBTASKS,
} = require("../scripts/runtime/strategy-runtime/decompose-task");
const {
  inferProjectForTask,
  looksLikeIntegrationStep,
  looksLikeBackendStep,
} = require("./infer-mini-task-project");

/**
 * Reutiliza helpers do decompose single-project.
 * @param {string} md
 */
function parsePlanSections(md) {
  return parseMarkdownSections(md);
}

/**
 * @param {string} body
 */
function bulletsFromBody(body) {
  return String(body || "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((l) => l.length >= 8)
    .slice(0, 12);
}

/**
 * @param {number} n
 */
function padSubtaskId(n) {
  return String(Math.max(1, Math.floor(n))).padStart(3, "0");
}

/**
 * @param {Record<string, unknown>} aiDoc
 * @returns {"basic"|"standard"|"expert"}
 */
function aiModeFromStrategy(aiDoc) {
  const m = String(
    aiDoc && typeof aiDoc === "object" && !Array.isArray(aiDoc)
      ? aiDoc.recommended_mode || ""
      : "",
  );
  if (m === "basic" || m === "standard" || m === "expert") return m;
  return "standard";
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   complexityDoc: Record<string, unknown>,
 *   aiDoc: Record<string, unknown>,
 *   workspaceContext: import("./workspace-strategy-context").WorkspaceStrategyContextOk,
 * }} p
 */
function decomposeTaskMultiProject(p) {
  const root = path.resolve(String(p.outputDirAbs || ""));
  const ws = p.workspaceContext;
  const catalog = ws.catalog;
  const fallbackPid = ws.planningProjectId || catalog[0].projectId;
  const aiMode = aiModeFromStrategy(p.aiDoc);

  let plan = "";
  try {
    const planPath = path.join(root, PLAN_REFINED);
    if (fs.existsSync(planPath)) plan = fs.readFileSync(planPath, "utf-8");
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "DECOPLAN",
        message: e && e.message ? String(e.message) : "Falha ao ler plano.",
      },
    };
  }

  if (!String(plan).trim()) {
    return {
      ok: false,
      error: { code: "DECOEMPTY_PLAN", message: "Plano refinado vazio." },
    };
  }

  /** @type {{ title: string, goal: string, body: string, files: string[], domains: string[] }[]} */
  let rawTasks = [];
  const sections = parsePlanSections(plan);
  const bullets = [];
  for (const sec of sections) {
    bullets.push(...bulletsFromBody(sec.body));
  }
  if (!bullets.length) {
    bullets.push(ws.task);
  }

  const planFiles = extractFilePaths(plan);

  for (const line of bullets.slice(0, MAX_SUBTASKS)) {
    const files = extractFilePaths(line);
    const mergedFiles = files.length ? files : planFiles.slice(0, 8);
    const entry = inferProjectForTask(
      { title: line, goal: line, body: line, files: mergedFiles },
      catalog,
      fallbackPid,
    );
    rawTasks.push({
      title: line.slice(0, 200),
      goal: line,
      body: line,
      files: mergedFiles,
      domains: [entry.repositorySlug],
      _projectId: entry.projectId,
    });
  }

  if (!rawTasks.length) {
    return {
      ok: false,
      error: { code: "DECOEMPTY", message: "Decomposição multi-repo sem tarefas." },
    };
  }

  /** @type {Map<string, string>} */
  const subtaskIdByProjectFirst = new Map();

  /** @type {Record<string, unknown>[]} */
  const decompositionSubtasks = [];
  /** @type {{ id: string, relPath: string, doc: Record<string, unknown> }[]} */
  const subtaskFiles = [];

  let idx = 0;
  /** @type {string[]} */
  const rationale = [
    `multi_repo: ${catalog.length} repositórios no workspace.`,
    `projectIds: ${catalog.map((c) => c.projectId).join(", ")}`,
  ];

  for (const t of rawTasks) {
    idx += 1;
    const id = padSubtaskId(idx);
    let projectId = t._projectId || fallbackPid;
    if (looksLikeIntegrationStep(t.title) || looksLikeIntegrationStep(t.goal)) {
      const frontEntry = catalog.find(
        (c) =>
          c.repositorySlug.includes("front") ||
          c.repositoryName.toLowerCase().includes("front"),
      );
      if (frontEntry) {
        projectId = frontEntry.projectId;
      }
    }
    const entry =
      catalog.find((c) => c.projectId === projectId) || catalog[0];

    /** @type {string[]} */
    let dependencies = [];
    if (looksLikeIntegrationStep(t.title) || looksLikeIntegrationStep(t.goal)) {
      const apiEntry = catalog.find(
        (c) =>
          c.repositorySlug.includes("api") ||
          c.repositoryName.toLowerCase().includes("api"),
      );
      if (apiEntry && apiEntry.projectId !== projectId) {
        const prevFromBuilt = [...decompositionSubtasks]
          .reverse()
          .find((s) => s.projectId === apiEntry.projectId);
        if (prevFromBuilt) {
          dependencies = [String(prevFromBuilt.id)];
        } else {
          const prev = subtaskIdByProjectFirst.get(apiEntry.projectId);
          if (prev) dependencies = [prev];
        }
      }
      if (!dependencies.length) {
        for (const [pid, prevId] of subtaskIdByProjectFirst) {
          if (
            pid !== projectId &&
            looksLikeBackendStep(
              rawTasks.find((x) => x._projectId === pid)?.title || "",
            )
          ) {
            dependencies = [prevId];
            break;
          }
        }
      }
    }

    if (!subtaskIdByProjectFirst.has(projectId)) {
      subtaskIdByProjectFirst.set(projectId, id);
    }

    const integrationPoints = [];
    if (dependencies.length) {
      integrationPoints.push("Consome entrega do repositório dependente.");
    }
    if (looksLikeBackendStep(t.title)) {
      integrationPoints.push("Expõe contrato para o frontend.");
    }

    const doc = {
      version: 1,
      id,
      title: t.title,
      goal: t.goal,
      projectId: entry.projectId,
      repositoryName: entry.repositoryName,
      repositorySlug: entry.repositorySlug,
      scope: {
        files: t.files,
        domains: t.domains,
        summary: t.goal.slice(0, 280),
      },
      dependencies,
      integrationPoints,
      complexity: {
        estimated_score: 5,
        risk: 4,
      },
      ai_mode: aiMode,
      acceptance_criteria: [
        `Entrega concluída em ${entry.repositoryName}.`,
        "Alinhado ao plano multi-projeto aprovado.",
      ],
      status: "planned",
    };

    decompositionSubtasks.push({ id, title: t.title, projectId: entry.projectId });
    subtaskFiles.push({
      id,
      relPath: `strategy/subtasks/${id}.json`,
      doc,
    });
  }

  const decomposition = {
    version: 1,
    phase: "3.4",
    status: "decomposition_completed",
    subtask_count: subtaskFiles.length,
    strategy: "multi_repo_workspace",
    multi_repo: true,
    workspace_run_id: ws.workspaceRunId,
    project_ids: catalog.map((c) => c.projectId),
    rationale,
    subtasks: decompositionSubtasks,
  };

  return { ok: true, decomposition, subtaskFiles };
}

module.exports = {
  decomposeTaskMultiProject,
};
