"use strict";

const fs = require("fs");
const path = require("path");

const { resolveOutputDir, resolveRunIndexPath } = require("../../../core/run-resolver");
const {
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  getWorkingTreePorcelain,
  gitExecInRepoSync,
  gitSpawn,
  branchExistsLocal,
  hasGitRemote,
  resolveBaseBranchName,
} = require("../../../core/git-exec");
const { suggestActivityBranchName } = require("../../../core/suggest-activity-branch");
const { collectStrategyForRun } = require("./run-strategy");
const { emitRuntimeEvent } = require("./runtime-events");
const { promoteJobUiPhaseForRun } = require("./promote-job-ui-phase");

const GIT_BRANCH_STATUS = Object.freeze({
  PENDING: "git_branch_pending",
  READY: "git_branch_ready",
  FAILED: "git_branch_failed",
});

const BASE_BRANCH_CANDIDATES = ["main", "master"];

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} runId
 * @returns {string|null}
 */
function resolveProjectRootForRun(runId) {
  const indexPath = resolveRunIndexPath(runId);
  if (fs.existsSync(indexPath)) {
    const idx = safeReadJson(indexPath);
    if (idx && idx.project_root) {
      return path.resolve(String(idx.project_root));
    }
  }
  return null;
}

/**
 * @param {string} outputDir
 * @returns {Record<string, unknown>|null}
 */
function readRunGitState(outputDir) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (!ctx || !ctx.git || typeof ctx.git !== "object" || Array.isArray(ctx.git)) {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (ctx.git);
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} gitPatch
 */
function persistRunGitState(outputDir, gitPatch) {
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = safeReadJson(ctxPath) || {};
  const prev =
    doc.git && typeof doc.git === "object" && !Array.isArray(doc.git)
      ? { .../** @type {Record<string, unknown>} */ (doc.git) }
      : {};
  doc.git = {
    enabled: true,
    ...prev,
    ...gitPatch,
    updatedAt: new Date().toISOString(),
  };
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
  return /** @type {Record<string, unknown>} */ (doc.git);
}

/**
 * @param {string|undefined|null} branch
 * @returns {{ ok: true, branch: string } | { ok: false, code: string, message: string }}
 */
function normalizeActivityBranchInput(branch) {
  const b = branch != null ? String(branch).trim() : "";
  if (!b) {
    return { ok: false, code: "git_invalid_branch", message: "Nome de branch inválido." };
  }
  if (b.length > 200) {
    return { ok: false, code: "git_invalid_branch", message: "Nome de branch demasiado longo." };
  }
  if (/[\s;|&$`<>\n\r]/.test(b)) {
    return { ok: false, code: "git_invalid_branch", message: "Nome de branch contém caracteres inválidos." };
  }
  if (b.includes("..") || b.startsWith("/") || b.endsWith("/") || b.endsWith(".lock")) {
    return { ok: false, code: "git_invalid_branch", message: "Nome de branch inválido." };
  }
  return { ok: true, branch: b };
}

/**
 * @param {unknown} err
 * @returns {{ code: string, message: string }}
 */
function mapPrepareGitError(err) {
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  const message =
    err && typeof err === "object" && "message" in err
      ? String(err.message)
      : "Erro Git desconhecido.";
  const stderr =
    err && typeof err === "object" && "stderr" in err && typeof err.stderr === "string"
      ? err.stderr
      : "";
  const blob = `${message}\n${stderr}`.toLowerCase();

  if (code === "git_timeout") {
    return { code: "git_timeout", message: message || "Operação Git excedeu o tempo limite." };
  }
  if (code === "GIT_NOT_A_REPOSITORY" || code === "GIT_PROJECT_ROOT_REQUIRED") {
    return { code: "git_not_repository", message: message || "O projeto não é um repositório Git." };
  }
  if (code === "GIT_BRANCH_EXISTS" || code === "git_branch_exists") {
    return { code: "git_branch_exists", message: message };
  }
  if (code === "GIT_DIRTY_WORKTREE" || code === "git_dirty_worktree") {
    return { code: "git_dirty_worktree", message: message };
  }
  if (code === "GIT_PULL_FAILED" || code === "git_pull_failed") {
    return { code: "git_pull_failed", message: message };
  }
  if (code === "git_failed" || blob.includes("conflict") || blob.includes("not something we can merge")) {
    return {
      code: "git_pull_failed",
      message: stderr.trim() || message || "git pull --ff-only falhou.",
    };
  }
  return { code: "git_unknown_error", message: message || "Erro Git desconhecido." };
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizePorcelainPath(raw) {
  let p = String(raw || "").trim();
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Alterações fora da pasta de output da corrida contam como dirty.
 *
 * @param {string} projectRoot
 * @param {string} outputDirAbs
 */
const DOCS_IA_OUTPUTS_PREFIX = "docs/.IA/outputs/";
const DOCS_IA_PREFIX = "docs/.IA/";
/** Inbox/estado Setup Boss no projeto-alvo — não bloqueia versionamento. */
const SETUP_BOSS_PROJECT_DIR = ".setup-boss";

/**
 * @param {string} filePath
 * @param {string} relOut
 */
function isAllowedDirtyPathForPrepare(filePath, relOut) {
  const n = normalizePorcelainPath(filePath);
  const out = normalizePorcelainPath(relOut);
  if (n === out || n.startsWith(`${out}/`)) return true;
  if (n === "docs" || n === "docs/.IA" || n.startsWith(DOCS_IA_PREFIX)) return true;
  if (n.startsWith(DOCS_IA_OUTPUTS_PREFIX)) return true;
  if (n === SETUP_BOSS_PROJECT_DIR || n.startsWith(`${SETUP_BOSS_PROJECT_DIR}/`)) {
    return true;
  }
  return false;
}

/**
 * @param {string} line
 * @returns {{ status: string, filePath: string } | null}
 */
function parsePorcelainStatusLine(line) {
  const raw = String(line || "");
  if (raw.length < 4) return null;
  const status = raw.slice(0, 2);
  let filePath = normalizePorcelainPath(raw.slice(3));
  if (filePath.includes(" -> ")) {
    filePath = normalizePorcelainPath(filePath.split(" -> ").pop());
  }
  if (!filePath) return null;
  return { status, filePath };
}

/**
 * @param {string} projectRoot
 * @param {string} outputDirAbs
 * @returns {{
 *   blocked: boolean,
 *   projectRoot: string,
 *   outputDirAbs: string,
 *   outputDirRelative: string,
 *   blockingRule: string,
 *   blockingEntries: Array<{ status: string, path: string }>,
 * }}
 */
function inspectWorkingTreeForGitPrepare(projectRoot, outputDirAbs) {
  const root = path.resolve(projectRoot);
  const out = path.resolve(outputDirAbs);
  const relOutRaw = path.relative(root, out).replace(/\\/g, "/");
  const relOut =
    relOutRaw && !relOutRaw.startsWith("..") ? relOutRaw : relOutRaw || "(fora do projectRoot)";

  /** @type {Array<{ status: string, path: string }>} */
  const blockingEntries = [];
  const porcelain = getWorkingTreePorcelain(root);
  for (const line of porcelain.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parsePorcelainStatusLine(line);
    if (!parsed) continue;
    if (isAllowedDirtyPathForPrepare(parsed.filePath, relOut)) continue;
    blockingEntries.push({ status: parsed.status, path: parsed.filePath });
  }

  return {
    blocked: blockingEntries.length > 0,
    projectRoot: root,
    outputDirAbs: out,
    outputDirRelative: relOut,
    blockingRule: "changes_outside_allowed_paths",
    blockingEntries,
  };
}

/**
 * @param {ReturnType<typeof inspectWorkingTreeForGitPrepare>} inspection
 */
function formatDirtyWorktreeBlockMessage(inspection) {
  const lines = [
    "Alterações locais fora das pastas permitidas para preparar a branch.",
    `Projeto: ${path.basename(inspection.projectRoot)}`,
    `Diretório validado (git -C): ${inspection.projectRoot}`,
    `Output da corrida (ignorado): ${inspection.outputDirRelative}`,
    "Regra: permitidos docs/.IA/, a pasta desta corrida em outputs/, e .setup-boss/.",
  ];
  if (inspection.blockingEntries.length === 0) {
    lines.push("Sugestão: verifique git status no diretório acima.");
    return lines.join("\n");
  }
  lines.push(`Ficheiros que bloqueiam (${inspection.blockingEntries.length}):`);
  for (const row of inspection.blockingEntries.slice(0, 15)) {
    const st = row.status.trim() || "??";
    lines.push(`  • [${st}] ${row.path}`);
  }
  if (inspection.blockingEntries.length > 15) {
    lines.push(`  … e mais ${inspection.blockingEntries.length - 15} ficheiro(s).`);
  }
  lines.push(
    "Sugestão: git add/commit, git stash -u, ou git restore nesses caminhos antes de confirmar o versionamento.",
  );
  return lines.join("\n");
}

/**
 * @param {string} projectRoot
 * @param {string} outputDirAbs
 */
function isWorkingTreeDirtyOutsideRunOutput(projectRoot, outputDirAbs) {
  return inspectWorkingTreeForGitPrepare(projectRoot, outputDirAbs).blocked;
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function resolveActivityTitle(outputDir, runId) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (ctx && ctx.task && typeof ctx.task === "object" && !Array.isArray(ctx.task)) {
    const t = /** @type {Record<string, unknown>} */ (ctx.task).title;
    if (t != null && String(t).trim()) return String(t).trim();
  }
  if (ctx && ctx.activityTitle != null && String(ctx.activityTitle).trim()) {
    return String(ctx.activityTitle).trim();
  }
  return runId;
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function validateStrategyReadyForGitBranch(outputDir, runId) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  const phase3 =
    ctx && ctx.phase3 && typeof ctx.phase3 === "object" && !Array.isArray(ctx.phase3)
      ? ctx.phase3
      : null;
  const p3st =
    phase3 && phase3.status != null
      ? String(phase3.status)
      : phase3 && phase3.phase_status != null
        ? String(phase3.phase_status)
        : "";
  const readiness =
    phase3 &&
    phase3.readiness &&
    typeof phase3.readiness === "object" &&
    phase3.readiness.status != null
      ? String(phase3.readiness.status)
      : "";

  if (
    p3st === "strategy_ready" ||
    p3st === "ready_for_execution" ||
    readiness === "strategy_ready"
  ) {
    return { ok: true };
  }

  const bundle = collectStrategyForRun(runId);
  if (bundle.ok && bundle.data) {
    const sum = bundle.data.summary;
    const phase3Status = sum && sum.phase3Status != null ? String(sum.phase3Status) : "";
    const op = sum && sum.operationalReadiness != null ? String(sum.operationalReadiness) : "";
    if (
      phase3Status === "strategy_ready" ||
      phase3Status === "ready_for_execution" ||
      (op === "ready" && (sum?.subtaskCount ?? 0) > 0)
    ) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    code: "strategy_not_ready",
    message: `Strategy não está pronta para preparar branch (phase3=${p3st || "—"}).`,
  };
}

/**
 * @param {string} projectRoot
 * @param {string} baseBranch
 */
async function pullFfOnlyFromOrigin(projectRoot, baseBranch) {
  const root = path.resolve(projectRoot);
  await gitSpawn(["-C", root, "fetch", "origin"], { timeoutMs: 120_000 });
  await gitSpawn(["-C", root, "checkout", baseBranch], { timeoutMs: 60_000 });
  await gitSpawn(["-C", root, "pull", "--ff-only", "origin", baseBranch], { timeoutMs: 120_000 });
}

/**
 * @param {{
 *   runId: string,
 *   activityBranch?: string|null,
 *   jobId?: string|null,
 *   projectId?: string|null,
 * }} input
 */
async function prepareRunGitBranch(input) {
  const runId = String(input.runId || "").trim();
  if (!runId) {
    return { ok: false, code: "run_id_required", message: "runId é obrigatório." };
  }

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e && e.message ? String(e.message) : "Output indisponível.",
    };
  }

  const strategyReady = validateStrategyReadyForGitBranch(outputDir, runId);
  if (!strategyReady.ok) {
    return strategyReady;
  }

  const projectRoot = resolveProjectRootForRun(runId);
  if (!projectRoot) {
    return {
      ok: false,
      code: "project_not_found",
      message: "Project root não resolvido para a corrida.",
    };
  }

  const existingGit = readRunGitState(outputDir);
  const requestedBranch =
    input.activityBranch != null && String(input.activityBranch).trim()
      ? String(input.activityBranch).trim()
      : null;

  if (
    existingGit &&
    String(existingGit.status || "") === GIT_BRANCH_STATUS.READY &&
    (!requestedBranch ||
      String(existingGit.activityBranch || "") === requestedBranch)
  ) {
    try {
      promoteJobUiPhaseForRun(runId, "execution", {
        uiState: "ready_for_execution",
        jobId: input.jobId ?? null,
      });
    } catch (_) {
      /* */
    }
    return {
      ok: true,
      idempotent: true,
      message: "Branch de atividade já preparada.",
      data: { git: existingGit, runId, projectRoot },
    };
  }

  persistRunGitState(outputDir, { status: GIT_BRANCH_STATUS.PENDING });

  /** @param {{ code: string, message: string }} mapped */
  const fail = (mapped) => {
    const git = persistRunGitState(outputDir, {
      status: GIT_BRANCH_STATUS.FAILED,
      errorCode: mapped.code,
      errorMessage: mapped.message,
    });
    return {
      ok: false,
      code: mapped.code,
      message: mapped.message,
      data: { git, runId, projectRoot },
    };
  };

  if (!isGitRepository(projectRoot)) {
    return fail({ code: "git_not_repository", message: "O projeto-alvo não é um repositório Git." });
  }

  try {
    const dirtyInspection = inspectWorkingTreeForGitPrepare(projectRoot, outputDir);
    if (dirtyInspection.blocked) {
      const e = new Error(formatDirtyWorktreeBlockMessage(dirtyInspection));
      e.code = "GIT_DIRTY_WORKTREE";
      e.dirtyWorktree = dirtyInspection;
      throw e;
    }
  } catch (err) {
    const mapped = mapPrepareGitError(err);
    const dirtyWorktree =
      err && typeof err === "object" && "dirtyWorktree" in err
        ? err.dirtyWorktree
        : null;
    if (mapped.code === "git_dirty_worktree" && dirtyWorktree) {
      const git = persistRunGitState(outputDir, {
        status: GIT_BRANCH_STATUS.FAILED,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      });
      return {
        ok: false,
        code: mapped.code,
        message: mapped.message,
        data: { git, runId, projectRoot, dirtyWorktree },
      };
    }
    return fail(mapped);
  }

  let activityBranch = requestedBranch;
  if (!activityBranch) {
    const title = resolveActivityTitle(outputDir, runId);
    const existing = [];
    for (const name of [getCurrentBranch(projectRoot), ...BASE_BRANCH_CANDIDATES]) {
      if (name) existing.push(name);
    }
    activityBranch = suggestActivityBranchName(title, { existingBranches: existing });
  } else {
    const norm = normalizeActivityBranchInput(activityBranch);
    if (!norm.ok) {
      return fail({ code: norm.code, message: norm.message });
    }
    activityBranch = norm.branch;
  }

  if (branchExistsLocal(projectRoot, activityBranch)) {
    if (requestedBranch && requestedBranch === activityBranch) {
      try {
        gitExecInRepoSync(projectRoot, ["checkout", activityBranch], { stdio: "ignore" });
        const baseBranch = resolveBaseBranchName(projectRoot) || getCurrentBranch(projectRoot);
        const headCommitAfterCreate = getHeadCommit(projectRoot);
        const git = persistRunGitState(outputDir, {
          status: GIT_BRANCH_STATUS.READY,
          baseBranch: baseBranch || activityBranch,
          activityBranch,
          baseCommit: headCommitAfterCreate,
          headCommitAfterCreate,
          createdAt: existingGit && existingGit.createdAt ? existingGit.createdAt : new Date().toISOString(),
          pullBeforeCreate: false,
          errorCode: null,
          errorMessage: null,
          workspaceBranchReused: true,
        });
        return {
          ok: true,
          idempotent: true,
          message: "Branch de atividade já existia — checkout reutilizado.",
          data: { git, runId, projectRoot, currentBranch: getCurrentBranch(projectRoot) },
        };
      } catch (err) {
        return fail(mapPrepareGitError(err));
      }
    }
    return fail({
      code: "git_branch_exists",
      message: `A branch "${activityBranch}" já existe localmente.`,
    });
  }

  const baseBranch = resolveBaseBranchName(projectRoot);
  if (!baseBranch) {
    return fail({
      code: "git_unknown_error",
      message: "Não foi possível detectar a branch base (main/master).",
    });
  }

  let pullBeforeCreate = false;
  let baseCommit;

  try {
    gitExecInRepoSync(projectRoot, ["checkout", baseBranch], {
      stdio: "ignore",
    });

    if (hasGitRemote(projectRoot, "origin")) {
      try {
        await pullFfOnlyFromOrigin(projectRoot, baseBranch);
        pullBeforeCreate = true;
      } catch (pullErr) {
        const mapped = mapPrepareGitError(pullErr);
        mapped.code = "git_pull_failed";
        if (!mapped.message) mapped.message = "git pull --ff-only falhou.";
        return fail(mapped);
      }
    }

    baseCommit = getHeadCommit(projectRoot);

    gitExecInRepoSync(projectRoot, ["checkout", "-b", activityBranch], {
      stdio: "ignore",
    });

    const headCommitAfterCreate = getHeadCommit(projectRoot);
    const createdAt = new Date().toISOString();

    const git = persistRunGitState(outputDir, {
      status: GIT_BRANCH_STATUS.READY,
      baseBranch,
      activityBranch,
      baseCommit,
      headCommitAfterCreate,
      createdAt,
      pullBeforeCreate,
      errorCode: null,
      errorMessage: null,
    });

    try {
      emitRuntimeEvent({
        type: "git_branch_prepared",
        jobId: input.jobId ?? null,
        runId,
        projectId: input.projectId ?? null,
        data: {
          activityBranch,
          baseBranch,
          baseCommit,
          headCommitAfterCreate,
          pullBeforeCreate,
        },
      });
    } catch (_) {
      /* */
    }

    try {
      promoteJobUiPhaseForRun(runId, "execution", {
        uiState: "ready_for_execution",
        jobId: input.jobId ?? null,
      });
    } catch (_) {
      /* */
    }

    return {
      ok: true,
      idempotent: false,
      message: "Branch de atividade preparada.",
      data: {
        runId,
        projectRoot,
        git,
        currentBranch: getCurrentBranch(projectRoot),
      },
    };
  } catch (err) {
    return fail(mapPrepareGitError(err));
  }
}

module.exports = {
  GIT_BRANCH_STATUS,
  safeReadJson,
  resolveProjectRootForRun,
  readRunGitState,
  persistRunGitState,
  normalizeActivityBranchInput,
  validateStrategyReadyForGitBranch,
  isAllowedDirtyPathForPrepare,
  inspectWorkingTreeForGitPrepare,
  formatDirtyWorktreeBlockMessage,
  isWorkingTreeDirtyOutsideRunOutput,
  prepareRunGitBranch,
};
