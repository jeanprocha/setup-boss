"use strict";

const fs = require("fs");
const path = require("path");

/** Domínios core SPEC v1.0 → ficheiro index obrigatório. */
const CORE_DOMAIN_INDEX_SPECS = Object.freeze([
  { directory: "docs/.IA/system", indexFile: "docs/.IA/system/index-system.md" },
  {
    directory: "docs/.IA/architecture",
    indexFile: "docs/.IA/architecture/index-architecture.md",
  },
  {
    directory: "docs/.IA/environment",
    indexFile: "docs/.IA/environment/index-environment.md",
  },
  {
    directory: "docs/.IA/standards",
    indexFile: "docs/.IA/standards/index-standards.md",
  },
  { directory: "docs/.IA/prompts", indexFile: "docs/.IA/prompts/index-prompts.md" },
]);

const REQUIRED_DIRECTORIES = Object.freeze(
  CORE_DOMAIN_INDEX_SPECS.map((s) => s.directory),
);
const REQUIRED_INDEX_FILES = Object.freeze(
  CORE_DOMAIN_INDEX_SPECS.map((s) => s.indexFile),
);

const ALLOWED_BOOTSTRAP_FILES = Object.freeze([
  "docs/.IA/system/bootstrap-discovery.md",
  "docs/.IA/system/bootstrap-create.md",
]);

const BOOTSTRAP_BASENAMES = Object.freeze([
  "bootstrap-discovery.md",
  "bootstrap-create.md",
]);

const ERROR_TITLE_INVALID_STRUCTURE = "Estrutura governada da `.IA` incompleta";
const ERROR_MESSAGE_INVALID_STRUCTURE =
  "A estrutura governada da `.IA` está incompleta.";
const ERROR_INVALID_STRUCTURE_DESCRIPTION =
  "O projeto possui o seed obrigatório, mas ainda não possui a estrutura core da SPEC v1.0.\n\n" +
  "Crie os domínios core e os ficheiros index-<folder>.md em falta.";

const ERROR_TITLE_BOOTSTRAP_OWNERSHIP = "Bootstrap prompts em local incorreto";
const ERROR_MESSAGE_BOOTSTRAP_OWNERSHIP =
  "Bootstrap prompts devem existir apenas em docs/.IA/system.";
const ERROR_BOOTSTRAP_OWNERSHIP_DESCRIPTION =
  "Os prompts de bootstrap pertencem exclusivamente a `docs/.IA/system`.\n\n" +
  "Remova cópias em `docs/.IA/prompts/` ou noutros domínios e mantenha apenas os ficheiros em system/.";

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
function isRepoFilePresent(projectRootAbs, relPosix) {
  const rel = normalizeRepoRelPath(relPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRootAbs
 * @param {string} relDirPosix
 * @returns {boolean}
 */
function isRepoDirectoryPresent(projectRootAbs, relDirPosix) {
  const rel = normalizeRepoRelPath(relDirPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @returns {{
 *   valid: boolean,
 *   structureValid: boolean,
 *   missingDirectories: string[],
 *   missingIndexFiles: string[],
 *   requiredDirectories: string[],
 *   requiredIndexFiles: string[],
 * }}
 */
function validateGovernanceStructure(projectRootAbs, trackedFiles) {
  const trackedSet = new Set(trackedFiles.map(normalizeRepoRelPath));
  /** @type {string[]} */
  const missingDirectories = [];
  /** @type {string[]} */
  const missingIndexFiles = [];

  for (const spec of CORE_DOMAIN_INDEX_SPECS) {
    if (!isRepoDirectoryPresent(projectRootAbs, spec.directory)) {
      missingDirectories.push(spec.directory);
    }
    const indexNorm = normalizeRepoRelPath(spec.indexFile);
    const tracked = trackedSet.has(indexNorm);
    const onDisk = isRepoFilePresent(projectRootAbs, indexNorm);
    if (!tracked || !onDisk) {
      missingIndexFiles.push(indexNorm);
    }
  }

  const structureValid =
    missingDirectories.length === 0 && missingIndexFiles.length === 0;

  return {
    valid: structureValid,
    structureValid,
    missingDirectories,
    missingIndexFiles,
    requiredDirectories: [...REQUIRED_DIRECTORIES],
    requiredIndexFiles: [...REQUIRED_INDEX_FILES],
  };
}

/**
 * @param {string} projectRootAbs
 * @returns {string[]}
 */
function findBootstrapFilesOnDisk(projectRootAbs) {
  const docsIaAbs = path.join(projectRootAbs, "docs", ".IA");
  /** @type {string[]} */
  const hits = [];

  /**
   * @param {string} relInside
   * @param {number} depth
   */
  function walk(relInside, depth) {
    if (depth > 6) return;
    const absDir = relInside ? path.join(docsIaAbs, relInside) : docsIaAbs;
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of names) {
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
        walk(relSeg, depth + 1);
        continue;
      }
      if (!st.isFile()) continue;
      if (!BOOTSTRAP_BASENAMES.includes(name)) continue;
      hits.push(
        path.posix.join("docs", ".IA", ...relSeg.split(/[/\\]/).filter(Boolean)),
      );
    }
  }

  walk("", 0);
  return hits;
}

/**
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @returns {{
 *   valid: boolean,
 *   ownershipValid: boolean,
 *   invalidBootstrapFiles: string[],
 *   allowedBootstrapFiles: string[],
 * }}
 */
function validateBootstrapPromptOwnership(projectRootAbs, trackedFiles) {
  const allowedSet = new Set(ALLOWED_BOOTSTRAP_FILES.map(normalizeRepoRelPath));
  const invalidSet = new Set();

  for (const rel of trackedFiles) {
    const norm = normalizeRepoRelPath(rel);
    const base = path.posix.basename(norm);
    if (!BOOTSTRAP_BASENAMES.includes(base)) continue;
    if (!allowedSet.has(norm)) {
      invalidSet.add(norm);
    }
  }

  for (const rel of findBootstrapFilesOnDisk(projectRootAbs)) {
    const norm = normalizeRepoRelPath(rel);
    const base = path.posix.basename(norm);
    if (!BOOTSTRAP_BASENAMES.includes(base)) continue;
    if (!allowedSet.has(norm)) {
      invalidSet.add(norm);
    }
  }

  const invalidBootstrapFiles = [...invalidSet].sort((a, b) => a.localeCompare(b));
  const ownershipValid = invalidBootstrapFiles.length === 0;

  return {
    valid: ownershipValid,
    ownershipValid,
    invalidBootstrapFiles,
    allowedBootstrapFiles: [...ALLOWED_BOOTSTRAP_FILES],
  };
}

/**
 * @param {ReturnType<typeof validateGovernanceStructure>} structure
 * @param {string} docsIaPath
 * @returns {Record<string, unknown>}
 */
function buildInvalidStructureFailure(structure, docsIaPath) {
  const dirBullets = structure.missingDirectories.map((d) => `- ${d}`).join("\n");
  const indexBullets = structure.missingIndexFiles.map((f) => `- ${f}`).join("\n");
  const parts = [ERROR_INVALID_STRUCTURE_DESCRIPTION];
  if (structure.missingDirectories.length) {
    parts.push(`\n\nPastas em falta:\n${dirBullets}`);
  }
  if (structure.missingIndexFiles.length) {
    parts.push(`\n\nIndexes em falta:\n${indexBullets}`);
  }

  return {
    ok: false,
    code: "KNOWLEDGE_BASE_INVALID_STRUCTURE",
    phase: "knowledge_structure_invalid",
    title: ERROR_TITLE_INVALID_STRUCTURE,
    message: ERROR_MESSAGE_INVALID_STRUCTURE,
    description: parts.join(""),
    docsIaPath,
    relativePath: "docs/.IA",
    missingDirectories: structure.missingDirectories,
    missingIndexFiles: structure.missingIndexFiles,
    requiredDirectories: structure.requiredDirectories,
    requiredIndexFiles: structure.requiredIndexFiles,
    details: {
      structureValidation: {
        valid: false,
        structureValid: false,
        missingDirectories: structure.missingDirectories,
        missingIndexFiles: structure.missingIndexFiles,
        invalidBootstrapFiles: [],
        requiredDirectories: structure.requiredDirectories,
        requiredIndexFiles: structure.requiredIndexFiles,
      },
    },
  };
}

/**
 * @param {ReturnType<typeof validateBootstrapPromptOwnership>} ownership
 * @param {string} docsIaPath
 * @returns {Record<string, unknown>}
 */
function buildBootstrapOwnershipFailure(ownership, docsIaPath) {
  const invalidBullets = ownership.invalidBootstrapFiles
    .map((f) => `- ${f}`)
    .join("\n");
  const allowedBullets = ownership.allowedBootstrapFiles
    .map((f) => `- ${f}`)
    .join("\n");

  return {
    ok: false,
    code: "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION",
    phase: "knowledge_bootstrap_ownership_invalid",
    title: ERROR_TITLE_BOOTSTRAP_OWNERSHIP,
    message: ERROR_MESSAGE_BOOTSTRAP_OWNERSHIP,
    description: `${ERROR_BOOTSTRAP_OWNERSHIP_DESCRIPTION}\n\nInválidos:\n${invalidBullets}\n\nLocal correcto:\n${allowedBullets}`,
    docsIaPath,
    relativePath: "docs/.IA",
    invalidBootstrapFiles: ownership.invalidBootstrapFiles,
    allowedBootstrapFiles: ownership.allowedBootstrapFiles,
    details: {
      structureValidation: {
        valid: false,
        structureValid: true,
        missingDirectories: [],
        missingIndexFiles: [],
        invalidBootstrapFiles: ownership.invalidBootstrapFiles,
        requiredDirectories: [...REQUIRED_DIRECTORIES],
        requiredIndexFiles: [...REQUIRED_INDEX_FILES],
      },
    },
  };
}

module.exports = {
  CORE_DOMAIN_INDEX_SPECS,
  REQUIRED_DIRECTORIES,
  REQUIRED_INDEX_FILES,
  ALLOWED_BOOTSTRAP_FILES,
  ERROR_TITLE_INVALID_STRUCTURE,
  ERROR_MESSAGE_INVALID_STRUCTURE,
  ERROR_TITLE_BOOTSTRAP_OWNERSHIP,
  ERROR_MESSAGE_BOOTSTRAP_OWNERSHIP,
  validateGovernanceStructure,
  validateBootstrapPromptOwnership,
  buildInvalidStructureFailure,
  buildBootstrapOwnershipFailure,
};
