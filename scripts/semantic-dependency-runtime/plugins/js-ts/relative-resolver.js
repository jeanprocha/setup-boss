"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizePathPOSIX } = require("../../lib/path-normalize");

/** Ordem solicitada pela Fase 4.8.2 */
const TRY_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

/**
 * @param {string} projectRoot
 */
function normalizeRootAbs(projectRoot) {
  return path.resolve(String(projectRoot || ""));
}

function isPathInsideRoot(absPath, rootAbs) {
  const rel = path.relative(rootAbs, absPath);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * @param {string} rootAbs
 * @param {string} absFile
 */
function toProjectRelativePOSIX(rootAbs, absFile) {
  return normalizePathPOSIX(path.relative(rootAbs, absFile));
}

/**
 * Resolve `specifier` (./ ou ../ apenas) relativamente ao ficheiro `fromAbsFile`.
 * @param {{ projectRootAbs: string, fromAbsFile: string, specifier: string }} opts
 */
function resolveRelativeSpecifier(opts) {
  const projectRootAbs = opts.projectRootAbs;
  const fromAbsFile = path.resolve(opts.fromAbsFile);
  const specifier = String(opts.specifier || "").trim();
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }

  const baseDir = path.dirname(fromAbsFile);
  const resolvedWithoutExtBase = path.resolve(baseDir, specifier.replace(/\//g, path.sep));

  if (!isPathInsideRoot(resolvedWithoutExtBase, projectRootAbs)) {
    return { unresolved: true };
  }

  const tryAsFile = (absP) => {
    if (fs.existsSync(absP) && fs.statSync(absP).isFile()) return absP;
    return null;
  };

  const tryAsDirIndex = (dirAbs) => {
    if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) return null;
    for (const ext of TRY_EXTENSIONS) {
      const idx = path.join(dirAbs, `index${ext}`);
      const hit = tryAsFile(idx);
      if (hit) return hit;
    }
    return null;
  };

  const extname = path.posix.extname(specifier.replace(/\\/g, "/"));
  const hasKnownExt =
    extname &&
    [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(extname.toLowerCase());

  if (hasKnownExt) {
    const hit = tryAsFile(resolvedWithoutExtBase);
    if (hit) {
      return { resolved: hit, posixRel: toProjectRelativePOSIX(projectRootAbs, hit) };
    }
    return { unresolved: true };
  }

  const directFile = tryAsFile(resolvedWithoutExtBase);
  if (directFile) {
    return { resolved: directFile, posixRel: toProjectRelativePOSIX(projectRootAbs, directFile) };
  }

  for (const ext of TRY_EXTENSIONS) {
    const hit = tryAsFile(`${resolvedWithoutExtBase}${ext}`);
    if (hit) return { resolved: hit, posixRel: toProjectRelativePOSIX(projectRootAbs, hit) };
  }

  const asDirIndex = tryAsDirIndex(resolvedWithoutExtBase);
  if (asDirIndex) {
    return { resolved: asDirIndex, posixRel: toProjectRelativePOSIX(projectRootAbs, asDirIndex) };
  }

  return { unresolved: true };
}

/**
 * Deterministic node id pelo path relativo posix ao projeto.
 */
function stableNodeIdFromRelativePath(posixRel) {
  const h = crypto
    .createHash("sha256")
    .update(normalizePathPOSIX(posixRel), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `sdn-${h}`;
}

function unresolvedStubNodeId(specifierAttempt, fromPosixRel) {
  const h = crypto
    .createHash("sha256")
    .update(`${normalizePathPOSIX(fromPosixRel)}\u001f${specifierAttempt}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `uns-${h}`;
}

function inferLanguageFromPath(posixRel) {
  const ext = path.posix.extname(posixRel).toLowerCase();
  if (ext === ".ts" || ext === ".tsx") return "typescript";
  return "javascript";
}

module.exports = {
  TRY_EXTENSIONS,
  normalizeRootAbs,
  isPathInsideRoot,
  resolveRelativeSpecifier,
  stableNodeIdFromRelativePath,
  unresolvedStubNodeId,
  inferLanguageFromPath,
};
