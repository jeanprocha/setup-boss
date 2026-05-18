"use strict";

const fs = require("fs");
const path = require("path");

const { GIT_BRANCH_READY, isProtectedBranch } = require("./validate-git-execute-gate");
const {
  getCurrentBranch,
  getWorkingTreePorcelain,
  gitExecInRepoSync,
  isGitRepository,
} = require("./git-exec");
const { getAllowedFilesFromRunContext } = require("../scripts/shared-utils");
const { resolveProjectIaDir } = require("../scripts/shared/ia-path-resolver");

const GIT_COMMIT_STATUS = Object.freeze({
  COMMITTED: "committed",
  FAILED: "failed",
});

const GIT_COMMIT_ERROR = Object.freeze({
  BRANCH_REQUIRED: "git_commit_branch_required",
  BRANCH_MISMATCH: "git_commit_branch_mismatch",
  PROTECTED_BRANCH: "git_commit_protected_branch",
  NO_CHANGES: "git_commit_no_changes",
  OUT_OF_SCOPE: "git_commit_out_of_scope_changes",
  FAILED: "git_commit_failed",
});

const DOCS_EXECUTIONS_PREFIX = "docs/executions/";
const SETUP_BOSS_PREFIX = ".setup-boss/";

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
 * @param {string} raw
 */
function normalizePorcelainPath(raw) {
  let p = String(raw || "").trim();
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * @param {string} projectRoot
 * @returns {string[]}
 */
function listWorkingTreeChangedPaths(projectRoot) {
  const porcelain = getWorkingTreePorcelain(projectRoot);
  /** @type {string[]} */
  const out = [];
  for (const line of porcelain.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let filePath = normalizePorcelainPath(line.slice(3));
    if (filePath.includes(" -> ")) {
      filePath = normalizePorcelainPath(filePath.split(" -> ").pop());
    }
    if (filePath) out.push(filePath);
  }
  return [...new Set(out)];
}

/**
 * @param {string} runId
 */
function slugifyRunId(runId) {
  return String(runId || "run")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * @param {string} outputDir
 * @param {string} runId
 */
function resolveRunTitle(outputDir, runId) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (ctx && ctx.task && typeof ctx.task === "object" && !Array.isArray(ctx.task)) {
    const t = /** @type {Record<string, unknown>} */ (ctx.task).title;
    if (t != null && String(t).trim()) return String(t).trim();
  }
  if (ctx && ctx.activityTitle != null && String(ctx.activityTitle).trim()) {
    return String(ctx.activityTitle).trim();
  }
  const meta = safeReadJson(path.join(outputDir, "metadata.json"));
  if (meta && meta.taskTitle != null && String(meta.taskTitle).trim()) {
    return String(meta.taskTitle).trim();
  }
  return runId;
}

/**
 * @param {string} outputDir
 */
function resolveProjectId(outputDir) {
  const meta = safeReadJson(path.join(outputDir, "metadata.json"));
  if (meta && meta.projectId != null && String(meta.projectId).trim()) {
    return String(meta.projectId).trim();
  }
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (ctx && ctx.project_id != null && String(ctx.project_id).trim()) {
    return String(ctx.project_id).trim();
  }
  return "unknown";
}

/**
 * @param {string} projectRoot
 * @param {string} runId
 */
function buildExecutionCommitReportRelPath(projectRoot, runId) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .slice(0, 15);
  const slug = slugifyRunId(runId);
  return `${DOCS_EXECUTIONS_PREFIX}${stamp}-${slug}-commit-summary.md`;
}

/**
 * @param {string} projectRoot
 * @param {string} iaDirAbs
 */
function iaDirRelativePrefix(projectRoot, iaDirAbs) {
  const rel = path.relative(path.resolve(projectRoot), path.resolve(iaDirAbs));
  return rel.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * @param {{
 *   runContext: Record<string, unknown>|null,
 *   outputDir: string,
 *   projectRoot: string,
 *   reportRelPath?: string|null,
 * }} input
 * @returns {string[]}
 */
function collectCommitAllowedPaths(input) {
  const projectRoot = path.resolve(String(input.projectRoot));
  const runContext =
    input.runContext && typeof input.runContext === "object" && !Array.isArray(input.runContext)
      ? input.runContext
      : null;

  /** @type {Set<string>} */
  const allowed = new Set(getAllowedFilesFromRunContext(runContext, { uniqueNormalized: true }));

  const { iaDir } = resolveProjectIaDir(projectRoot);
  const iaPrefix = iaDirRelativePrefix(projectRoot, iaDir);
  allowed.add(iaPrefix);
  if (iaPrefix !== "docs/.IA") {
    allowed.add("docs/.IA");
  }

  const reportRel =
    input.reportRelPath != null && String(input.reportRelPath).trim()
      ? normalizePorcelainPath(String(input.reportRelPath))
      : "";
  if (reportRel) allowed.add(reportRel);

  return [...allowed].filter(Boolean);
}

/**
 * Artefactos de runtime da corrida não entram no commit.
 *
 * @param {string} filePath
 * @param {string} projectRoot
 * @param {string} [outputDir]
 */
function isIgnorableDirtyForCommit(filePath, projectRoot, outputDir = "") {
  const n = normalizePorcelainPath(filePath);
  if (!n) return true;
  if (n === ".setup-boss" || n.startsWith(SETUP_BOSS_PREFIX)) return true;
  if (outputDir) {
    const relOut = path
      .relative(path.resolve(projectRoot), path.resolve(outputDir))
      .replace(/\\/g, "/");
    if (relOut && !relOut.startsWith("..") && (n === relOut || n.startsWith(`${relOut}/`))) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} filePath
 * @param {Set<string>} allowedExact
 * @param {string} iaPrefix
 * @param {string} reportRel
 */
function isPathAllowedForCommit(filePath, allowedExact, iaPrefix, reportRel) {
  const n = normalizePorcelainPath(filePath);
  if (!n) return false;
  if (reportRel && (n === reportRel || reportRel.startsWith(`${n}/`))) return true;
  if (allowedExact.has(n)) return true;
  for (const a of allowedExact) {
    if (a.startsWith(`${n}/`) || n.startsWith(`${a}/`)) return true;
  }
  const iaNorm = iaPrefix.replace(/\/+$/, "");
  if (n === iaNorm || n.startsWith(`${iaNorm}/`)) return true;
  if (n === "docs/.IA" || n.startsWith("docs/.IA/")) return true;
  return false;
}

/**
 * @param {string[]} dirty
 * @param {Set<string>} allowedExact
 * @param {string} iaPrefix
 * @param {string} reportRel
 * @param {string} projectRoot
 */
function resolveCommitStagePaths(dirty, allowedExact, iaPrefix, reportRel, projectRoot) {
  const root = path.resolve(projectRoot);
  /** @type {Set<string>} */
  const staged = new Set();

  for (const p of dirty) {
    if (!isPathAllowedForCommit(p, allowedExact, iaPrefix, reportRel)) continue;
    const abs = path.join(root, p);
    let isDir = false;
    try {
      isDir = fs.existsSync(abs) && fs.statSync(abs).isDirectory();
    } catch {
      isDir = false;
    }

    if (!isDir) {
      staged.add(p);
      continue;
    }

    for (const a of allowedExact) {
      if (a.startsWith(`${p}/`)) {
        const aAbs = path.join(root, a);
        if (fs.existsSync(aAbs)) staged.add(a);
      }
    }
    if (reportRel && reportRel.startsWith(`${p}/`)) staged.add(reportRel);
    const iaNorm = iaPrefix.replace(/\/+$/, "");
    if (p === iaNorm || p.startsWith(`${iaNorm}/`)) staged.add(p);
  }

  return [...staged];
}

/**
 * @param {string} projectRoot
 * @param {string[]} allowedPaths
 * @param {string} [reportRelPath]
 * @param {Record<string, unknown>|null} [runContext]
 * @param {string} [outputDir]
 * @returns {{ ok: true, pathsToStage: string[] } | { ok: false, code: string, message: string, outOfScope?: string[] }}
 */
function validateCommitScope(
  projectRoot,
  allowedPaths,
  reportRelPath = "",
  runContext = null,
  outputDir = "",
) {
  const root = path.resolve(projectRoot);
  const outDir = outputDir ? path.resolve(String(outputDir)) : "";
  const { iaDir } = resolveProjectIaDir(root);
  const iaPrefix = iaDirRelativePrefix(root, iaDir);
  const allowedExact = new Set(
    collectCommitAllowedPaths({
      runContext,
      outputDir: outDir,
      projectRoot: root,
      reportRelPath,
    }).concat(allowedPaths || []),
  );

  const dirty = listWorkingTreeChangedPaths(root).filter(
    (p) => !isIgnorableDirtyForCommit(p, root, outDir),
  );
  /** @type {string[]} */
  const outOfScope = [];
  for (const p of dirty) {
    if (!isPathAllowedForCommit(p, allowedExact, iaPrefix, reportRelPath || "")) {
      outOfScope.push(p);
    }
  }
  if (outOfScope.length > 0) {
    return {
      ok: false,
      code: GIT_COMMIT_ERROR.OUT_OF_SCOPE,
      message: "Existem alterações fora do escopo permitido para commit automático.",
      outOfScope,
    };
  }

  const pathsToStage = resolveCommitStagePaths(
    dirty,
    allowedExact,
    iaPrefix,
    reportRelPath || "",
    root,
  );
  return { ok: true, pathsToStage };
}

/**
 * @param {string} outputDir
 * @param {Record<string, unknown>} commitPatch
 */
function persistGitCommitState(outputDir, commitPatch) {
  const ctxPath = path.join(outputDir, "run-context.json");
  /** @type {Record<string, unknown>} */
  let doc = safeReadJson(ctxPath) || {};
  const prevGit =
    doc.git && typeof doc.git === "object" && !Array.isArray(doc.git)
      ? { .../** @type {Record<string, unknown>} */ (doc.git) }
      : {};
  const prevCommit =
    prevGit.commit && typeof prevGit.commit === "object" && !Array.isArray(prevGit.commit)
      ? { .../** @type {Record<string, unknown>} */ (prevGit.commit) }
      : {};
  doc.git = {
    enabled: prevGit.enabled !== false,
    ...prevGit,
    commit: {
      ...prevCommit,
      ...commitPatch,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  doc.updated_at = new Date().toISOString();
  fs.writeFileSync(ctxPath, JSON.stringify(doc, null, 2), "utf-8");
  return /** @type {Record<string, unknown>} */ (doc.git);
}

/**
 * @param {{
 *   runId: string,
 *   title: string,
 *   projectId: string,
 * }} input
 */
function buildApprovedRunCommitMessage(input) {
  const title = String(input.title || "").trim() || String(input.runId);
  const subject = `setup-boss: ${title}`.slice(0, 200);
  const body = [
    `Run: ${input.runId}`,
    `Project: ${input.projectId}`,
    "Review: APPROVED",
  ].join("\n");
  return { subject, body };
}

/**
 * @param {{
 *   projectRoot: string,
 *   outputDir: string,
 *   runId: string,
 *   runContext: Record<string, unknown>|null,
 *   reportAbsPath: string,
 *   reportRelPath: string,
 *   executorSummary?: Record<string, unknown>|null,
 *   reviewOutput?: Record<string, unknown>|null,
 * }} input
 */
function writeExecutionCommitReport(input) {
  const root = path.resolve(input.projectRoot);
  const reportAbs = path.resolve(input.reportAbsPath);
  const rel = input.reportRelPath.replace(/\\/g, "/");
  const dir = path.dirname(reportAbs);
  fs.mkdirSync(dir, { recursive: true });

  const allowed = getAllowedFilesFromRunContext(input.runContext, { uniqueNormalized: true });
  const changes = safeReadJson(path.join(input.outputDir, "executor-changes.json"));
  const modified =
    changes && Array.isArray(changes.changes)
      ? changes.changes
          .map((c) => (c && c.path != null ? String(c.path) : ""))
          .filter(Boolean)
      : allowed;

  const reviewStatus =
    input.reviewOutput && input.reviewOutput.status != null
      ? String(input.reviewOutput.status)
      : "unknown";

  const now = new Date().toISOString();
  const lines = [
    `# Resumo de execução — commit automático`,
    "",
    `**Run:** ${input.runId}`,
    `**Gerado em:** ${now}`,
    "",
    "## Alterações realizadas",
    "",
    input.executorSummary && input.executorSummary.summary != null
      ? String(input.executorSummary.summary)
      : "_Ver executor-output.md e executor-changes.json na pasta da corrida._",
    "",
    "## Arquivos alterados",
    "",
    ...modified.map((f) => `- \`${f}\``),
    "",
    "## Decisões técnicas",
    "",
    "- Commit automático pós-review APPROVED (Fase 6).",
    "- Escopo limitado a `allowed_files`, `docs/.IA` e este relatório.",
    "",
    "## Testes executados",
    "",
    "_Registar na corrida: review-output.json e artefatos de execução._",
    "",
    "## Riscos",
    "",
    "- Alterações fora do escopo bloqueiam o commit (`git_commit_out_of_scope_changes`).",
    "- Sem push automático nesta fase.",
    "",
    "## Próximos passos",
    "",
    "- Revisar diff localmente.",
    "- Abrir PR manualmente quando aplicável.",
    "",
    `**Review:** ${reviewStatus}`,
    "",
  ];

  fs.writeFileSync(reportAbs, lines.join("\n"), "utf-8");
  return { rel, abs: reportAbs };
}

/**
 * @param {{
 *   projectRoot: string,
 *   pathsToStage: string[],
 *   subject: string,
 *   body: string,
 * }} input
 * @returns {{ sha: string }}
 */
function createApprovedRunCommit(input) {
  const root = path.resolve(input.projectRoot);
  const paths = [...new Set(input.pathsToStage.map(normalizePorcelainPath).filter(Boolean))];
  if (paths.length === 0) {
    const e = new Error("Nenhum ficheiro para stage.");
    e.code = GIT_COMMIT_ERROR.NO_CHANGES;
    throw e;
  }

  for (const rel of paths) {
    gitExecInRepoSync(root, ["add", "--", rel], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  const diffCached = gitExecInRepoSync(root, ["diff", "--cached", "--name-only"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const staged = String(diffCached)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (staged.length === 0) {
    const e = new Error("Nenhuma alteração em stage após git add.");
    e.code = GIT_COMMIT_ERROR.NO_CHANGES;
    throw e;
  }

  try {
    gitExecInRepoSync(
      root,
      ["commit", "-m", input.subject, "-m", input.body],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    const e = new Error(err && err.message ? String(err.message) : "git commit falhou.");
    e.code = GIT_COMMIT_ERROR.FAILED;
    throw e;
  }

  const sha = String(
    gitExecInRepoSync(root, ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  ).trim();

  return { sha };
}

/**
 * @param {string} outputDir
 * @returns {Record<string, unknown>|null}
 */
function readRunGitStateFromOutput(outputDir) {
  const ctx = safeReadJson(path.join(outputDir, "run-context.json"));
  if (!ctx || !ctx.git || typeof ctx.git !== "object" || Array.isArray(ctx.git)) {
    return null;
  }
  return /** @type {Record<string, unknown>} */ (ctx.git);
}

/**
 * @param {string} outputDir
 */
function readReviewOutput(outputDir) {
  return safeReadJson(path.join(outputDir, "review-output.json"));
}

/**
 * @param {{
 *   projectRoot: string,
 *   outputDir: string,
 *   runId: string,
 *   dryRun?: boolean,
 * }} input
 * @returns {Promise<Record<string, unknown>>}
 */
async function tryGitCommitAfterApprovedRun(input) {
  const projectRoot = path.resolve(String(input.projectRoot || ""));
  const outputDir = path.resolve(String(input.outputDir || ""));
  const runId = String(input.runId || "").trim();

  if (input.dryRun === true) {
    return { skipped: true, reason: "dry_run" };
  }

  if (!projectRoot || !outputDir || !runId) {
    return { skipped: true, reason: "missing_params" };
  }

  if (!isGitRepository(projectRoot)) {
    return { skipped: true, reason: "not_git_repository" };
  }

  const gitState = readRunGitStateFromOutput(outputDir);
  const existingCommit =
    gitState &&
    gitState.commit &&
    typeof gitState.commit === "object" &&
    !Array.isArray(gitState.commit)
      ? /** @type {Record<string, unknown>} */ (gitState.commit)
      : null;
  if (existingCommit && String(existingCommit.status) === GIT_COMMIT_STATUS.COMMITTED) {
    return { skipped: true, reason: "already_committed", sha: existingCommit.sha };
  }

  const reviewOutput = readReviewOutput(outputDir);
  const reviewStatus =
    reviewOutput && reviewOutput.status != null ? String(reviewOutput.status).toLowerCase() : "";
  if (reviewStatus !== "approved") {
    return {
      skipped: true,
      reason: "review_not_approved",
      reviewStatus: reviewStatus || "missing",
    };
  }

  const status = gitState && gitState.status != null ? String(gitState.status).trim() : "";
  if (status !== GIT_BRANCH_READY) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.BRANCH_REQUIRED,
      errorMessage: "Commit automático exige git.status === git_branch_ready.",
    });
    return {
      ok: false,
      code: GIT_COMMIT_ERROR.BRANCH_REQUIRED,
    };
  }

  const activityBranch =
    gitState && gitState.activityBranch != null ? String(gitState.activityBranch).trim() : "";
  if (!activityBranch) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.BRANCH_REQUIRED,
      errorMessage: "activityBranch em falta.",
    });
    return { ok: false, code: GIT_COMMIT_ERROR.BRANCH_REQUIRED };
  }

  let currentBranch = null;
  try {
    currentBranch = getCurrentBranch(projectRoot);
  } catch (err) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.FAILED,
      errorMessage: err && err.message ? String(err.message) : "Falha ao ler branch.",
    });
    return { ok: false, code: GIT_COMMIT_ERROR.FAILED };
  }

  if (!currentBranch) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.BRANCH_MISMATCH,
      errorMessage: "Branch actual desconhecida.",
    });
    return { ok: false, code: GIT_COMMIT_ERROR.BRANCH_MISMATCH };
  }

  if (isProtectedBranch(currentBranch)) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.PROTECTED_BRANCH,
      errorMessage: `Commit bloqueado em branch protegida (${currentBranch}).`,
    });
    return { ok: false, code: GIT_COMMIT_ERROR.PROTECTED_BRANCH };
  }

  if (currentBranch !== activityBranch) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.BRANCH_MISMATCH,
      errorMessage: `HEAD (${currentBranch}) ≠ activityBranch (${activityBranch}).`,
    });
    return { ok: false, code: GIT_COMMIT_ERROR.BRANCH_MISMATCH };
  }

  const runContext = safeReadJson(path.join(outputDir, "run-context.json"));
  const reportRelPath = buildExecutionCommitReportRelPath(projectRoot, runId);
  const reportAbsPath = path.join(projectRoot, reportRelPath);

  const preReportScope = validateCommitScope(
    projectRoot,
    collectCommitAllowedPaths({
      runContext,
      outputDir,
      projectRoot,
      reportRelPath: "",
    }),
    "",
    runContext,
    outputDir,
  );
  if (!preReportScope.ok) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: preReportScope.code,
      errorMessage: preReportScope.message,
      ...(preReportScope.outOfScope ? { outOfScope: preReportScope.outOfScope } : {}),
    });
    return { ok: false, code: preReportScope.code, outOfScope: preReportScope.outOfScope };
  }
  if (preReportScope.pathsToStage.length === 0) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.NO_CHANGES,
      errorMessage: "Working tree sem alterações no escopo permitido.",
    });
    return { ok: false, code: GIT_COMMIT_ERROR.NO_CHANGES };
  }

  const executorSummary = safeReadJson(path.join(outputDir, "executor-result.json"));

  writeExecutionCommitReport({
    projectRoot,
    outputDir,
    runId,
    runContext,
    reportAbsPath,
    reportRelPath,
    executorSummary,
    reviewOutput,
  });

  const allowedPaths = collectCommitAllowedPaths({
    runContext,
    outputDir,
    projectRoot,
    reportRelPath,
  });

  const scope = validateCommitScope(
    projectRoot,
    allowedPaths,
    reportRelPath,
    runContext,
    outputDir,
  );
  if (!scope.ok) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: scope.code,
      errorMessage: scope.message,
      ...(scope.outOfScope ? { outOfScope: scope.outOfScope } : {}),
    });
    return { ok: false, code: scope.code, outOfScope: scope.outOfScope };
  }

  if (scope.pathsToStage.length === 0) {
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: GIT_COMMIT_ERROR.NO_CHANGES,
      errorMessage: "Nenhum ficheiro elegível para stage após gerar relatório.",
    });
    return { ok: false, code: GIT_COMMIT_ERROR.NO_CHANGES };
  }

  const title = resolveRunTitle(outputDir, runId);
  const projectId = resolveProjectId(outputDir);
  const { subject, body } = buildApprovedRunCommitMessage({ runId, title, projectId });

  try {
    const { sha } = createApprovedRunCommit({
      projectRoot,
      pathsToStage: scope.pathsToStage,
      subject,
      body,
    });
    const createdAt = new Date().toISOString();
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.COMMITTED,
      sha,
      message: subject,
      body,
      createdAt,
      reportPath: reportRelPath,
    });
    return {
      ok: true,
      sha,
      message: subject,
      reportPath: reportRelPath,
    };
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err && err.code
        ? String(err.code)
        : GIT_COMMIT_ERROR.FAILED;
    persistGitCommitState(outputDir, {
      status: GIT_COMMIT_STATUS.FAILED,
      errorCode: code,
      errorMessage: err && err.message ? String(err.message) : "git commit falhou.",
    });
    return { ok: false, code };
  }
}

module.exports = {
  GIT_COMMIT_STATUS,
  GIT_COMMIT_ERROR,
  GIT_BRANCH_READY,
  collectCommitAllowedPaths,
  validateCommitScope,
  buildApprovedRunCommitMessage,
  buildExecutionCommitReportRelPath,
  writeExecutionCommitReport,
  createApprovedRunCommit,
  persistGitCommitState,
  tryGitCommitAfterApprovedRun,
  listWorkingTreeChangedPaths,
  resolveCommitStagePaths,
  isPathAllowedForCommit,
  isIgnorableDirtyForCommit,
};
