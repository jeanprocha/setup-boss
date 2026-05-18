"use strict";

const fs = require("fs");
const path = require("path");

const {
  resolveTargetProjectRoot,
  resolveSetupBossRepoRoot,
} = require("./resolve-target-project-root");
const { gitExecFileSync, isGitRepository } = require("./git-exec");
const { buildIaGovernanceValidationContext } = require("./ia-governance-validation-context");
const {
  runIaGovernanceValidationPipeline,
  enrichResultWithDiagnostics,
} = require("./ia-governance-validation-pipeline");

const DOCS_IA_REL = path.join("docs", ".IA");
const DOCS_IA_GIT_PREFIX = "docs/.IA";

/** Segmentos sob `docs/` que não substituem `docs/.IA` (match exacto por path.join). */
const DOCS_WRONG_IA_SEGMENTS = ["IA", "ia", "Ia"];

const ERROR_TITLE = "Base de conhecimento não encontrada";
const ERROR_TITLE_UNTRACKED = "Base de conhecimento não versionada";
const ERROR_TITLE_WRONG_PATH = "Base de conhecimento no caminho incorreto";
const ERROR_TITLE_IGNORED = "Base de conhecimento ignorada pelo Git";
const ERROR_TITLE_NOT_GIT = "Repositório Git obrigatório";

/** Mensagem curta (contrato API / UI). */
const ERROR_MESSAGE_MISSING =
  "Base de conhecimento obrigatória não encontrada.";
const ERROR_MESSAGE_UNTRACKED =
  "A base de conhecimento existe localmente, mas ainda não está versionada no Git.";
const ERROR_MESSAGE_IGNORED = "A base de conhecimento está ignorada pelo Git.";

const ERROR_DESCRIPTION =
  "A pasta obrigatória `docs/.IA` não foi encontrada na raiz do projeto.\n\n" +
  "O Setup-Boss depende desta base de conhecimento para compreender o projeto, " +
  "carregar contexto, gerar especificações correctamente e executar tarefas com segurança.";

const ERROR_UNTRACKED_DESCRIPTION =
  "O projeto possui `docs/.IA`, mas ela ainda não foi adicionada ao Git.\n\n" +
  "Execute `git add docs/.IA`, faça commit e confirme com `git ls-files -- docs/.IA` antes de iniciar uma atividade.";

const ERROR_WRONG_DOCS_IA_DESCRIPTION =
  "Foi encontrada docs/IA, mas o Setup-Boss exige docs/.IA versionada no Git.\n\n" +
  "Renomeie docs/IA para docs/.IA e faça commit dos arquivos.";

const ERROR_IGNORED_DESCRIPTION =
  "Ficheiros reais em `docs/.IA` estão ignorados pelo `.gitignore` do projeto.\n\n" +
  "Remova a regra aplicável, confirme com `git check-ignore -v` e versione a base de conhecimento.";

const ERROR_NOT_GIT_DESCRIPTION =
  "Não foi possível validar o versionamento da base de conhecimento: o projeto-alvo não é um repositório Git.\n\n" +
  "Inicialize o Git no projeto e faça commit de `docs/.IA` antes de continuar.";

const ERROR_DOCS_IA_IS_FILE =
  "A pasta obrigatória `docs/.IA` existe como ficheiro, mas tem de ser um diretório.\n\n" +
  "Remova o ficheiro e crie a pasta `docs/.IA`.";

const ERROR_ROOT_IA_ONLY =
  "A pasta obrigatória docs/.IA não foi encontrada.";

const DOC_BOOTSTRAP_HINT =
  "docs/.IA/system/bootstrap-create.md (ou execute o bootstrap de documentação do projeto).";

/** SPEC v1.0 — seed mínimo obrigatório (paths POSIX relativos à raiz do repo). */
const REQUIRED_SEED_FILES = Object.freeze([
  "docs/.IA/index.md",
  "docs/.IA/system/seed-rules.md",
  "docs/.IA/system/bootstrap-discovery.md",
  "docs/.IA/system/bootstrap-create.md",
]);

const ERROR_TITLE_INVALID_SEED = "Estrutura mínima da `.IA` incompleta";
const ERROR_MESSAGE_INVALID_SEED =
  "A estrutura mínima obrigatória da `.IA` está incompleta.";
const ERROR_INVALID_SEED_DESCRIPTION =
  "O projeto não possui todos os ficheiros obrigatórios do seed `.IA` v1.0.\n\n" +
  "Crie os ficheiros em falta, siga `docs/.IA/system/seed-rules.md` ou execute o bootstrap em `docs/.IA/system/bootstrap-create.md`.";

/**
 * @param {string} p
 * @returns {string}
 */
function normalizeGitPath(p) {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/");
}

/**
 * Ficheiros tracked sob `docs/.IA` no repo do projeto-alvo.
 *
 * @param {string} projectRootAbs
 * @returns {string[]}
 */
function gitLsFilesDocsIa(projectRootAbs) {
  try {
    const out = gitExecFileSync(
      ["-C", projectRootAbs, "ls-files", "--", DOCS_IA_GIT_PREFIX],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return String(out)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Paths ignorados pelo Git (uma chamada `check-ignore` em lote).
 *
 * @param {string} projectRootAbs
 * @param {string[]} relPosixList
 * @returns {Set<string>}
 */
function gitCheckIgnoredPathsSet(projectRootAbs, relPosixList) {
  const paths = relPosixList.map(normalizeGitPath).filter(Boolean);
  if (paths.length === 0) return new Set();

  try {
    const out = gitExecFileSync(
      ["-C", projectRootAbs, "check-ignore", "--", ...paths],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const ignored = new Set();
    for (const line of String(out).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const pathPart = trimmed.includes("\t")
        ? trimmed.split("\t").pop()
        : trimmed;
      if (pathPart) ignored.add(normalizeGitPath(pathPart));
    }
    return ignored;
  } catch (err) {
    const code =
      err && typeof err === "object" && "status" in err
        ? /** @type {{ status?: number }} */ (err).status
        : undefined;
    if (code === 1) return new Set();
    return new Set();
  }
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveProjectRootAbs(projectRoot) {
  return path.resolve(String(projectRoot || "").trim());
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveDocsIaPath(projectRoot) {
  const root = resolveProjectRootAbs(projectRoot);
  return path.normalize(path.join(root, DOCS_IA_REL));
}

/**
 * @param {string} absPath
 * @returns {boolean}
 */
function isExistingDirectory(absPath) {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} absPath
 * @returns {boolean}
 */
function isExistingFile(absPath) {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Ficheiros concretos sob docs/.IA (paths POSIX relativos à raiz do repo).
 *
 * @param {string} projectRootAbs
 * @param {number} [limit]
 * @returns {string[]}
 */
function listDocsIaFilePaths(projectRootAbs, limit = 24) {
  const docsIaAbs = path.join(projectRootAbs, "docs", ".IA");
  /** @type {string[]} */
  const out = [];

  /**
   * @param {string} relInside
   * @param {number} depth
   */
  function walk(relInside, depth) {
    if (out.length >= limit) return;
    const absDir = relInside ? path.join(docsIaAbs, relInside) : docsIaAbs;
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (out.length >= limit) break;
      if (!name || name === "." || name === "..") continue;
      const relSeg = relInside ? path.join(relInside, name) : name;
      const abs = path.join(docsIaAbs, relSeg);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (depth < 5) walk(relSeg, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      const posixRel = path.posix.join(
        "docs",
        ".IA",
        ...relSeg.split(/[/\\]/).filter(Boolean),
      );
      out.push(posixRel);
    }
  }

  walk("", 0);
  return out;
}

/**
 * @param {string} projectRootAbs
 * @param {string} relPosix
 * @returns {boolean}
 */
function isGitPathIgnored(projectRootAbs, relPosix) {
  const rel = normalizeGitPath(relPosix);
  return gitCheckIgnoredPathsSet(projectRootAbs, [rel]).has(rel);
}

/**
 * Verifica se ficheiros reais em docs/.IA estão ignorados (não usa só o path do diretório).
 *
 * @param {string} projectRootAbs
 * @returns {{ ignored: boolean, sampleFiles: string[], ignoredFiles: string[], addableFiles: string[] }}
 */
function classifyDocsIaGitIgnoreState(projectRootAbs) {
  const sampleFiles = listDocsIaFilePaths(projectRootAbs);
  if (sampleFiles.length === 0) {
    return { ignored: false, sampleFiles, ignoredFiles: [], addableFiles: [] };
  }
  const ignoredSet = gitCheckIgnoredPathsSet(projectRootAbs, sampleFiles);
  const ignoredFiles = sampleFiles.filter((rel) => ignoredSet.has(normalizeGitPath(rel)));
  const addableFiles = sampleFiles.filter((rel) => !ignoredSet.has(normalizeGitPath(rel)));
  const ignored = ignoredFiles.length > 0 && addableFiles.length === 0;
  return { ignored, sampleFiles, ignoredFiles, addableFiles };
}

/**
 * @param {string} projectRootAbs
 * @returns {boolean}
 */
function isDocsIaIgnoredByGit(projectRootAbs) {
  return classifyDocsIaGitIgnoreState(projectRootAbs).ignored;
}

/**
 * @param {string} projectRootAbs
 * @returns {{ segment: string, relativePath: string, absPath: string } | null}
 */
function findWrongDocsIaDirectory(projectRootAbs) {
  const docsDir = path.join(projectRootAbs, "docs");
  const wrongNames = new Set(DOCS_WRONG_IA_SEGMENTS);
  /** @type {string[]} */
  let entries;
  try {
    entries = fs.readdirSync(docsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry === ".IA" || !wrongNames.has(entry)) {
      continue;
    }
    const candidate = path.normalize(path.join(docsDir, entry));
    if (isExistingDirectory(candidate)) {
      return {
        segment: entry,
        relativePath: path.posix.join("docs", entry),
        absPath: candidate,
      };
    }
  }
  return null;
}

/**
 * @param {string} segment
 * @returns {string}
 */
function buildWrongDocsIaDescription(segment) {
  if (segment === "IA") {
    return ERROR_WRONG_DOCS_IA_DESCRIPTION;
  }
  const rel = `docs/${segment}`;
  return (
    `Foi encontrada ${rel}, mas o Setup-Boss exige docs/.IA versionada no Git.\n\n` +
    `Renomeie ${rel} para docs/.IA e faça commit dos arquivos.`
  );
}

/**
 * @param {string} relPosix
 * @returns {string}
 */
function normalizeRepoRelPath(relPosix) {
  return String(relPosix || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

/**
 * @param {string} projectRootAbs
 * @param {string} relPosix
 * @returns {boolean}
 */
function isRequiredSeedFilePresent(projectRootAbs, relPosix) {
  const rel = normalizeRepoRelPath(relPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  return isExistingFile(abs);
}

/**
 * Valida seed mínimo SPEC v1.0 (ficheiros tracked + existentes no disco).
 *
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @returns {{
 *   valid: boolean,
 *   seedValid: boolean,
 *   missingFiles: string[],
 *   requiredFiles: string[],
 *   existingFiles: string[],
 * }}
 */
function validateRequiredKnowledgeSeed(projectRootAbs, trackedFiles) {
  const trackedSet = new Set(trackedFiles.map(normalizeRepoRelPath));
  /** @type {string[]} */
  const existingFiles = [];
  /** @type {string[]} */
  const missingFiles = [];

  for (const rel of REQUIRED_SEED_FILES) {
    const normalized = normalizeRepoRelPath(rel);
    const tracked = trackedSet.has(normalized);
    const onDisk = isRequiredSeedFilePresent(projectRootAbs, normalized);
    if (tracked && onDisk) {
      existingFiles.push(normalized);
    } else {
      missingFiles.push(normalized);
    }
  }

  const seedValid = missingFiles.length === 0;
  return {
    valid: seedValid,
    seedValid,
    missingFiles,
    requiredFiles: [...REQUIRED_SEED_FILES],
    existingFiles,
  };
}

/**
 * @param {{
 *   code: string,
 *   phase: string,
 *   title: string,
 *   message: string,
 *   description: string,
 *   docsIaPath: string,
 *   wrongFolder?: string,
 *   missingFiles?: string[],
 *   requiredFiles?: string[],
 *   existingFiles?: string[],
 *   details?: Record<string, unknown>,
 * }} fields
 */
function buildFailure(fields) {
  return {
    ok: false,
    code: fields.code,
    phase: fields.phase,
    title: fields.title,
    message: fields.message,
    description: fields.description,
    docsIaPath: fields.docsIaPath,
    relativePath: "docs/.IA",
    documentationHint: DOC_BOOTSTRAP_HINT,
    ...(fields.wrongFolder ? { wrongFolder: fields.wrongFolder } : {}),
    ...(Array.isArray(fields.missingFiles) ? { missingFiles: fields.missingFiles } : {}),
    ...(Array.isArray(fields.requiredFiles) ? { requiredFiles: fields.requiredFiles } : {}),
    ...(Array.isArray(fields.existingFiles) ? { existingFiles: fields.existingFiles } : {}),
    ...(fields.details && typeof fields.details === "object"
      ? { details: fields.details }
      : {}),
  };
}

/**
 * @param {ReturnType<typeof validateRequiredKnowledgeSeed>} seed
 * @param {string} docsIaPath
 */
function buildInvalidSeedFailure(seed, docsIaPath) {
  const missingBullets = seed.missingFiles.map((f) => `- ${f}`).join("\n");
  return buildFailure({
    code: "KNOWLEDGE_BASE_INVALID_SEED",
    phase: "knowledge_seed_invalid",
    title: ERROR_TITLE_INVALID_SEED,
    message: ERROR_MESSAGE_INVALID_SEED,
    description: `${ERROR_INVALID_SEED_DESCRIPTION}\n\nEm falta:\n${missingBullets}`,
    docsIaPath,
    missingFiles: seed.missingFiles,
    requiredFiles: seed.requiredFiles,
    existingFiles: seed.existingFiles,
    details: {
      seedValidation: {
        valid: false,
        seedValid: false,
        missingFiles: seed.missingFiles,
        requiredFiles: seed.requiredFiles,
        existingFiles: seed.existingFiles,
      },
    },
  });
}

/**
 * @param {import("./resolve-target-project-root").resolveTargetProjectRoot} resolved
 */
function failureFromUnresolvedTarget(resolved) {
  return buildFailure({
    code: resolved.code,
    phase: "knowledge_bootstrap_missing",
    title: resolved.title,
    message: resolved.message,
    description: resolved.description,
    docsIaPath: DOCS_IA_REL,
  });
}

/**
 * Valida `docs/.IA` no repositório do projeto-alvo (nunca no Setup-Boss por engano).
 *
 * @param {string} projectRoot
 * @param {{
 *   setupBossRoot?: string,
 *   forbidSetupBossRoot?: boolean,
 *   skipTargetRootGuard?: boolean,
 * }} [options]
 */
function validateProjectKnowledgeBase(projectRoot, options = {}) {
  if (projectRoot == null || String(projectRoot).trim() === "") {
    return buildFailure({
      code: "KNOWLEDGE_BASE_MISSING",
      phase: "knowledge_bootstrap_missing",
      title: ERROR_TITLE,
      message: ERROR_MESSAGE_MISSING,
      description: "projectRoot em falta para validar a base de conhecimento.",
      docsIaPath: DOCS_IA_REL,
    });
  }

  let projectRootAbs = resolveProjectRootAbs(projectRoot);

  if (!options.skipTargetRootGuard) {
    const target = resolveTargetProjectRoot(projectRootAbs, {
      setupBossRoot: options.setupBossRoot,
      forbidSetupBossRoot: options.forbidSetupBossRoot,
    });
    if (!target.ok) {
      return failureFromUnresolvedTarget(target);
    }
    projectRootAbs = target.targetProjectRoot;
  }

  const docsIaPath = resolveDocsIaPath(projectRootAbs);
  const docsIaLocal = isExistingDirectory(docsIaPath);
  const gitT0 = Date.now();
  const trackedFiles = isGitRepository(projectRootAbs)
    ? gitLsFilesDocsIa(projectRootAbs)
    : [];
  const gitListMs = Date.now() - gitT0;

  if (trackedFiles.length > 0) {
    const ctx = buildIaGovernanceValidationContext(projectRootAbs, trackedFiles, {
      docsIaPath,
      gitMetadata: {
        isGit: true,
        gitListMs,
      },
    });

    const pipeline = runIaGovernanceValidationPipeline(ctx, docsIaPath);
    if (!pipeline.ok) {
      return enrichResultWithDiagnostics(pipeline.failure);
    }

    const { seed, specVersion, drift, policy, validationSnapshot } = pipeline;

    return enrichResultWithDiagnostics({
      ok: true,
      iaDir: docsIaPath,
      docsIaPath,
      phase: "knowledge_bootstrap_ready",
      targetProjectRoot: projectRootAbs,
      seedValid: true,
      specVersionValid: true,
      specVersion: specVersion.specVersion,
      structureValid: true,
      driftValid: true,
      driftWarnings: drift.warnings,
      policyValid: true,
      policyWarnings: policy.policyWarnings,
      secretScan: policy.secretScan,
      languageScan: policy.languageScan,
      requiredFiles: seed.requiredFiles,
      existingFiles: seed.existingFiles,
      validationSnapshot,
      details: {
        driftValidation: {
          driftValid: true,
          criticalDrift: [],
          warnings: drift.warnings,
          unknownFolders: drift.unknownFolders,
          unexpectedRootFiles: drift.unexpectedRootFiles,
          legacyIaPath: drift.legacyIaPath,
          duplicatedBootstrapPrompts: [],
        },
        policyValidation: {
          policyValid: true,
          secretScan: policy.secretScan,
          languageScan: policy.languageScan,
        },
      },
    });
  }

  if (isExistingFile(docsIaPath)) {
    return buildFailure({
      code: "KNOWLEDGE_BASE_MISSING",
      phase: "knowledge_bootstrap_missing",
      title: ERROR_TITLE,
      message: ERROR_MESSAGE_MISSING,
      description: ERROR_DOCS_IA_IS_FILE,
      docsIaPath,
    });
  }

  if (docsIaLocal) {
    if (!isGitRepository(projectRootAbs)) {
      return buildFailure({
        code: "KNOWLEDGE_BASE_NOT_GIT",
        phase: "knowledge_bootstrap_missing",
        title: ERROR_TITLE_NOT_GIT,
        message: ERROR_TITLE_NOT_GIT,
        description: ERROR_NOT_GIT_DESCRIPTION,
        docsIaPath,
      });
    }
    const gitIgnoreState = classifyDocsIaGitIgnoreState(projectRootAbs);
    if (gitIgnoreState.ignored) {
      return buildFailure({
        code: "KNOWLEDGE_BASE_IGNORED",
        phase: "knowledge_bootstrap_ignored",
        title: ERROR_TITLE_IGNORED,
        message: ERROR_MESSAGE_IGNORED,
        description: ERROR_IGNORED_DESCRIPTION,
        docsIaPath,
        details: {
          ignoredFiles: gitIgnoreState.ignoredFiles.slice(0, 8),
          sampleFiles: gitIgnoreState.sampleFiles.slice(0, 8),
        },
      });
    }
    return buildFailure({
      code: "KNOWLEDGE_BASE_UNTRACKED",
      phase: "knowledge_bootstrap_untracked",
      title: ERROR_TITLE_UNTRACKED,
      message: ERROR_MESSAGE_UNTRACKED,
      description: ERROR_UNTRACKED_DESCRIPTION,
      docsIaPath,
      details: {
        addableFiles: gitIgnoreState.addableFiles.slice(0, 8),
        sampleFiles: gitIgnoreState.sampleFiles.slice(0, 8),
      },
    });
  }

  const wrongDocsIa = findWrongDocsIaDirectory(projectRootAbs);
  if (wrongDocsIa) {
    return buildFailure({
      code: "KNOWLEDGE_BASE_WRONG_PATH",
      phase: "knowledge_bootstrap_wrong_path",
      title: ERROR_TITLE_WRONG_PATH,
      message: ERROR_TITLE_WRONG_PATH,
      description: buildWrongDocsIaDescription(wrongDocsIa.segment),
      docsIaPath,
      wrongFolder: wrongDocsIa.relativePath,
    });
  }

  const rootLegacyIa = path.normalize(path.join(projectRootAbs, ".IA"));
  if (isExistingDirectory(rootLegacyIa)) {
    return buildFailure({
      code: "KNOWLEDGE_BASE_MISSING",
      phase: "knowledge_bootstrap_missing",
      title: ERROR_TITLE,
      message: ERROR_MESSAGE_MISSING,
      description: ERROR_ROOT_IA_ONLY,
      docsIaPath,
    });
  }

  return buildFailure({
    code: "KNOWLEDGE_BASE_MISSING",
    phase: "knowledge_bootstrap_missing",
    title: ERROR_TITLE,
    message: ERROR_MESSAGE_MISSING,
    description: ERROR_DESCRIPTION,
    docsIaPath,
  });
}

/**
 * @param {string} projectRoot
 * @param {Parameters<typeof validateProjectKnowledgeBase>[1]} [options]
 */
function bootstrapProjectKnowledgeBase(projectRoot, options) {
  const result = validateProjectKnowledgeBase(projectRoot, options);
  if (!result.ok) {
    return result;
  }
  return { ...result, phase: "knowledge_bootstrap_ready" };
}

module.exports = {
  DOCS_IA_REL,
  DOCS_IA_GIT_PREFIX,
  DOCS_WRONG_IA_SEGMENTS,
  ERROR_TITLE,
  ERROR_TITLE_UNTRACKED,
  ERROR_TITLE_WRONG_PATH,
  ERROR_MESSAGE_MISSING,
  ERROR_MESSAGE_UNTRACKED,
  ERROR_MESSAGE_IGNORED,
  ERROR_DESCRIPTION,
  ERROR_UNTRACKED_DESCRIPTION,
  ERROR_WRONG_DOCS_IA_DESCRIPTION,
  DOC_BOOTSTRAP_HINT,
  REQUIRED_SEED_FILES,
  ERROR_TITLE_INVALID_SEED,
  ERROR_MESSAGE_INVALID_SEED,
  validateRequiredKnowledgeSeed,
  buildInvalidSeedFailure,
  resolveDocsIaPath,
  resolveSetupBossRepoRoot,
  gitExecFileSync,
  gitCheckIgnoredPathsSet,
  isGitRepository,
  gitLsFilesDocsIa,
  listDocsIaFilePaths,
  classifyDocsIaGitIgnoreState,
  isDocsIaIgnoredByGit,
  validateProjectKnowledgeBase,
  bootstrapProjectKnowledgeBase,
  buildIaGovernanceValidationContext,
  runIaGovernanceValidationPipeline,
};
