"use strict";

const fs = require("fs");
const path = require("path");

/** @typedef {{ code: string, message: string }} IaPathWarning */

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveProjectRootAbs(projectRoot) {
  if (projectRoot == null || typeof projectRoot !== "string") {
    throw new TypeError("projectRoot must be a non-empty string");
  }
  const trimmed = projectRoot.trim();
  if (trimmed === "") {
    throw new TypeError("projectRoot must be a non-empty string");
  }
  return path.resolve(trimmed);
}

/**
 * @param {string} dirPath
 * @returns {boolean}
 */
function isExistingDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Verifica se childAbs está dentro de parentAbs (inclui igualdade).
 * Usa path.resolve + prefixo com path.sep (sem parsing frágil de ".IA").
 *
 * @param {string} parentAbs
 * @param {string} childAbs
 * @returns {boolean}
 */
function isPathInsideParent(parentAbs, childAbs) {
  const parentResolved = path.normalize(path.resolve(parentAbs));
  const childResolved = path.normalize(path.resolve(childAbs));
  if (parentResolved === childResolved) {
    return true;
  }
  const prefix =
    parentResolved.endsWith(path.sep) ? parentResolved : parentResolved + path.sep;
  return childResolved.startsWith(prefix);
}

/**
 * @param {string} projectRoot
 * @param {string} targetPath
 * @returns {{ ok: true, targetAbs: string } | { ok: false, targetAbs: null }}
 */
function resolveTargetUnderProject(projectRootAbs, targetPath) {
  if (targetPath == null || typeof targetPath !== "string") {
    throw new TypeError("targetPath must be a string");
  }
  const rootAbs = path.normalize(path.resolve(projectRootAbs));
  const targetAbs = path.isAbsolute(targetPath)
    ? path.normalize(path.resolve(targetPath))
    : path.normalize(path.resolve(rootAbs, targetPath));

  if (!isPathInsideParent(rootAbs, targetAbs)) {
    return { ok: false, targetAbs: null };
  }
  return { ok: true, targetAbs };
}

/**
 * @param {string} projectRoot
 * @returns {{
 *   iaDir: string,
 *   source: "preferred" | "legacy" | "preferred-missing",
 *   isLegacy: boolean,
 *   warnings: IaPathWarning[],
 *   preferredDir: string,
 *   legacyDir: string
 * }}
 */
function resolveProjectIaDir(projectRoot) {
  const projectRootAbs = resolveProjectRootAbs(projectRoot);
  const preferredDir = path.normalize(path.resolve(projectRootAbs, "docs", ".IA"));
  const legacyDir = path.normalize(path.resolve(projectRootAbs, ".IA"));

  const preferredExists = isExistingDirectory(preferredDir);
  const legacyExists = isExistingDirectory(legacyDir);

  /** @type {IaPathWarning[]} */
  const warnings = [];

  /** @type {string} */
  let iaDir;
  /** @type {"preferred" | "legacy" | "preferred-missing"} */
  let source;
  /** @type {boolean} */
  let isLegacy;

  if (preferredExists) {
    iaDir = preferredDir;
    source = "preferred";
    isLegacy = false;
    if (legacyExists) {
      warnings.push({
        code: "IA_LEGACY_COEXIST",
        message:
          "Encontrados docs/.IA e .IA na raiz; docs/.IA tem prioridade. Planeje remover ou migrar o legado.",
      });
    }
  } else if (legacyExists) {
    iaDir = legacyDir;
    source = "legacy";
    isLegacy = true;
    warnings.push({
      code: "IA_LEGACY_FALLBACK",
      message:
        "docs/.IA ausente; em uso a pasta .IA na raiz (legado). O padrão oficial é docs/.IA.",
    });
  } else {
    iaDir = preferredDir;
    source = "preferred-missing";
    isLegacy = false;
  }

  return {
    iaDir,
    source,
    isLegacy,
    warnings,
    preferredDir,
    legacyDir,
  };
}

/**
 * @param {string} projectRoot
 * @returns {string}
 */
function resolveProjectIaOutputsDir(projectRoot) {
  const { iaDir } = resolveProjectIaDir(projectRoot);
  return path.normalize(path.resolve(iaDir, "outputs"));
}

const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

/**
 * @param {string} projectRoot
 * @param {string} runId
 * @returns {string}
 */
function resolveProjectIaOutputDir(projectRoot, runId) {
  if (runId == null || typeof runId !== "string") {
    throw new TypeError("runId must be a non-empty string");
  }
  const trimmed = runId.trim();
  if (trimmed === "") {
    throw new TypeError("runId must be a non-empty string");
  }
  if (trimmed !== runId) {
    throw new TypeError("runId must not have leading or trailing whitespace");
  }
  if (!SAFE_RUN_ID.test(trimmed)) {
    throw new Error(
      "runId inválido: use apenas um segmento com [A-Za-z0-9._-], sem separadores de path.",
    );
  }
  if (trimmed === "." || trimmed === "..") {
    throw new Error("runId inválido: '.' e '..' não são permitidos.");
  }
  const outputsDir = resolveProjectIaOutputsDir(projectRoot);
  return path.normalize(path.resolve(outputsDir, trimmed));
}

/**
 * Aceita paths sob docs/.IA ou sob .IA legado; bloqueia fora do projectRoot e traversal.
 *
 * @param {string} projectRoot
 * @param {string} targetPath
 * @returns {boolean}
 */
function isInsideProjectIa(projectRoot, targetPath) {
  const projectRootAbs = resolveProjectRootAbs(projectRoot);
  const preferredDir = path.normalize(path.resolve(projectRootAbs, "docs", ".IA"));
  const legacyDir = path.normalize(path.resolve(projectRootAbs, ".IA"));

  const resolved = resolveTargetUnderProject(projectRootAbs, targetPath);
  if (!resolved.ok || resolved.targetAbs == null) {
    return false;
  }
  const { targetAbs } = resolved;
  return (
    isPathInsideParent(preferredDir, targetAbs) || isPathInsideParent(legacyDir, targetAbs)
  );
}

/**
 * Aceita paths sob <iaDir>/outputs para preferred ou legacy; bloqueia externos e traversal.
 *
 * @param {string} projectRoot
 * @param {string} targetPath
 * @returns {boolean}
 */
function isInsideProjectIaOutputs(projectRoot, targetPath) {
  const projectRootAbs = resolveProjectRootAbs(projectRoot);
  const preferredDir = path.normalize(path.resolve(projectRootAbs, "docs", ".IA"));
  const legacyDir = path.normalize(path.resolve(projectRootAbs, ".IA"));
  const preferredOutputs = path.normalize(path.resolve(preferredDir, "outputs"));
  const legacyOutputs = path.normalize(path.resolve(legacyDir, "outputs"));

  const resolved = resolveTargetUnderProject(projectRootAbs, targetPath);
  if (!resolved.ok || resolved.targetAbs == null) {
    return false;
  }
  const { targetAbs } = resolved;
  return (
    isPathInsideParent(preferredOutputs, targetAbs) ||
    isPathInsideParent(legacyOutputs, targetAbs)
  );
}

module.exports = {
  resolveProjectIaDir,
  resolveProjectIaOutputsDir,
  resolveProjectIaOutputDir,
  isInsideProjectIa,
  isInsideProjectIaOutputs,
};
