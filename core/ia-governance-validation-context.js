"use strict";

const fs = require("fs");
const path = require("path");

const DOCS_IA_PREFIX = "docs/.IA";
const INDEX_REL = "docs/.IA/index.md";
const MAX_PRELOAD_FILES = 48;
const MAX_FILE_BYTES = 512_000;

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
 * @returns {string|null}
 */
function readFileUtf8(projectRootAbs, relPosix) {
  const rel = normalizeRepoRelPath(relPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length > MAX_FILE_BYTES) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Contexto partilhado para validators `.IA` (um git ls-files, uma leitura por ficheiro).
 *
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @param {{
 *   docsIaPath?: string,
 *   gitMetadata?: Record<string, unknown>,
 *   maxPreload?: number,
 * }} [options]
 */
function buildIaGovernanceValidationContext(projectRootAbs, trackedFiles, options = {}) {
  const startedAt = Date.now();
  const normalized = trackedFiles
    .map(normalizeRepoRelPath)
    .filter((rel) => rel.startsWith(DOCS_IA_PREFIX) || rel === DOCS_IA_PREFIX)
    .filter((rel) => !rel.endsWith("/"));

  const markdownFiles = normalized.filter((rel) => rel.endsWith(".md"));
  const maxPreload = options.maxPreload ?? MAX_PRELOAD_FILES;

  /** @type {Record<string, string|null>} */
  const fileContents = Object.create(null);
  let contentLoadMs = 0;

  const preloadSet = new Set(normalized.slice(0, maxPreload));
  preloadSet.add(INDEX_REL);

  for (const rel of preloadSet) {
    if (!normalized.includes(rel) && rel !== INDEX_REL) continue;
    const t0 = Date.now();
    fileContents[rel] = readFileUtf8(projectRootAbs, rel);
    contentLoadMs += Date.now() - t0;
  }

  /**
   * @param {string} relPosix
   * @returns {string|null}
   */
  function getFileContent(relPosix) {
    const rel = normalizeRepoRelPath(relPosix);
    if (Object.prototype.hasOwnProperty.call(fileContents, rel)) {
      return fileContents[rel];
    }
    const t0 = Date.now();
    const content = readFileUtf8(projectRootAbs, rel);
    contentLoadMs += Date.now() - t0;
    fileContents[rel] = content;
    return content;
  }

  const docsIaPath =
    options.docsIaPath != null && String(options.docsIaPath).trim()
      ? String(options.docsIaPath).trim()
      : path.normalize(path.join(projectRootAbs, "docs", ".IA"));

  return {
    projectRootAbs,
    docsIaPath,
    trackedFiles: normalized,
    markdownFiles,
    fileContents,
    getFileContent,
    gitMetadata: {
      ...(options.gitMetadata && typeof options.gitMetadata === "object"
        ? options.gitMetadata
        : {}),
      trackedCount: normalized.length,
    },
    metrics: {
      fileCount: normalized.length,
      markdownCount: markdownFiles.length,
      preloadedFileCount: Object.keys(fileContents).length,
      contentLoadMs,
    },
    startedAt,
  };
}

module.exports = {
  DOCS_IA_PREFIX,
  INDEX_REL,
  MAX_PRELOAD_FILES,
  normalizeRepoRelPath,
  buildIaGovernanceValidationContext,
};
