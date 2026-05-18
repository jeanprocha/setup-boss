"use strict";

const fs = require("fs");
const path = require("path");

const {
  ALLOWED_BOOTSTRAP_FILES,
  validateBootstrapPromptOwnership,
} = require("./validate-ia-governance-structure");

const DOCS_IA_REL = "docs/.IA";
const LEGACY_IA_REL = ".IA";
const SYSTEM_BOOTSTRAP_PREFIX = "docs/.IA/system/";

/** Domínios reconhecidos SPEC v1.0 (core + opcionais documentados). */
const KNOWN_DOMAIN_FOLDERS = Object.freeze(
  new Set([
    "system",
    "architecture",
    "environment",
    "standards",
    "prompts",
    "decisions",
    "runbooks",
    "observability",
    "history",
  ]),
);

/** Domínios opcionais — aviso se existirem sem index-<folder>.md. */
const OPTIONAL_DOMAIN_FOLDERS = Object.freeze(
  new Set(["decisions", "runbooks", "observability", "history"]),
);

/** Único ficheiro esperado na raiz de docs/.IA. */
const EXPECTED_ROOT_FILES = Object.freeze(new Set(["index.md"]));

const ERROR_TITLE_STRUCTURAL_DRIFT = "Drift estrutural detectado na `.IA`";
const ERROR_MESSAGE_STRUCTURAL_DRIFT =
  "A estrutura da `.IA` possui arquivos ou caminhos que violam a SPEC v1.0.";
const ERROR_STRUCTURAL_DRIFT_DESCRIPTION =
  "Foram detectados caminhos ou ficheiros que violam a governança estrutural da `.IA` v1.0.\n\n" +
  "Corrija o drift crítico listado abaixo antes de iniciar uma atividade.";

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
function isRepoDirectoryPresent(projectRootAbs, relPosix) {
  const rel = normalizeRepoRelPath(relPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  try {
    return fs.statSync(abs).isDirectory();
  } catch {
    return false;
  }
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
 * @returns {string[]}
 */
function listDocsIaRootEntries(projectRootAbs) {
  const docsIaAbs = path.join(projectRootAbs, "docs", ".IA");
  /** @type {string[]} */
  const entries = [];
  try {
    entries.push(...fs.readdirSync(docsIaAbs));
  } catch {
    return [];
  }
  return entries.filter((n) => n && n !== "." && n !== "..");
}

/**
 * @param {string} projectRootAbs
 * @returns {string[]}
 */
function findBootstrapDriftFilesOnDisk(projectRootAbs) {
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
      if (!/^bootstrap-.+\.md$/i.test(name)) continue;
      const relPosix = path.posix.join(
        "docs",
        ".IA",
        ...relSeg.split(/[/\\]/).filter(Boolean),
      );
      const norm = normalizeRepoRelPath(relPosix);
      if (!norm.startsWith(SYSTEM_BOOTSTRAP_PREFIX)) {
        hits.push(norm);
      }
    }
  }

  walk("", 0);
  return [...new Set(hits)].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @returns {{
 *   driftValid: boolean,
 *   criticalDrift: string[],
 *   warnings: string[],
 *   unknownFolders: string[],
 *   unexpectedRootFiles: string[],
 *   legacyIaPath: string | null,
 *   duplicatedBootstrapPrompts: string[],
 * }}
 */
function detectStructuralDrift(projectRootAbs, trackedFiles) {
  const docsIaExists = isRepoDirectoryPresent(projectRootAbs, DOCS_IA_REL);
  const legacyIaExists = isRepoDirectoryPresent(projectRootAbs, LEGACY_IA_REL);

  /** @type {string[]} */
  const criticalDrift = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const unknownFolders = [];
  /** @type {string[]} */
  const unexpectedRootFiles = [];
  /** @type {string[]} */
  const duplicatedBootstrapPrompts = [];
  let legacyIaPath = null;

  if (docsIaExists && legacyIaExists) {
    legacyIaPath = LEGACY_IA_REL;
    criticalDrift.push(
      "A pasta legada `.IA/` na raiz do projeto não pode coexistir com `docs/.IA/`.",
    );
  }

  const ownership = validateBootstrapPromptOwnership(projectRootAbs, trackedFiles);
  const invalidBootstrapSet = new Set(ownership.invalidBootstrapFiles);
  for (const rel of findBootstrapDriftFilesOnDisk(projectRootAbs)) {
    invalidBootstrapSet.add(rel);
  }
  for (const rel of [...invalidBootstrapSet].sort((a, b) => a.localeCompare(b))) {
    duplicatedBootstrapPrompts.push(rel);
    criticalDrift.push(`Bootstrap prompt fora de system/: ${rel}`);
  }

  if (docsIaExists) {
    for (const name of listDocsIaRootEntries(projectRootAbs)) {
      const abs = path.join(projectRootAbs, "docs", ".IA", name);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!KNOWN_DOMAIN_FOLDERS.has(name)) {
          const folderPath = `${DOCS_IA_REL}/${name}`;
          unknownFolders.push(folderPath);
          warnings.push(`Pasta desconhecida em docs/.IA: ${folderPath}`);
        }
        if (OPTIONAL_DOMAIN_FOLDERS.has(name)) {
          const indexRel = `${DOCS_IA_REL}/${name}/index-${name}.md`;
          const tracked = trackedFiles
            .map(normalizeRepoRelPath)
            .includes(indexRel);
          const onDisk = isRepoFilePresent(projectRootAbs, indexRel);
          if (!tracked || !onDisk) {
            warnings.push(
              `Domínio opcional sem index: ${indexRel} (recomendado para SPEC v1.0)`,
            );
          }
        }
        continue;
      }
      if (st.isFile() && !EXPECTED_ROOT_FILES.has(name)) {
        const filePath = `${DOCS_IA_REL}/${name}`;
        unexpectedRootFiles.push(filePath);
        warnings.push(`Ficheiro inesperado na raiz de docs/.IA: ${filePath}`);
      }
    }
  }

  const driftValid = criticalDrift.length === 0;

  return {
    driftValid,
    criticalDrift,
    warnings,
    unknownFolders,
    unexpectedRootFiles,
    legacyIaPath,
    duplicatedBootstrapPrompts,
  };
}

/**
 * @param {ReturnType<typeof detectStructuralDrift>} drift
 * @param {string} docsIaPath
 * @returns {Record<string, unknown>}
 */
function buildStructuralDriftFailure(drift, docsIaPath) {
  const criticalBullets = drift.criticalDrift.map((m) => `- ${m}`).join("\n");
  const dupBullets = drift.duplicatedBootstrapPrompts
    .map((f) => `- ${f}`)
    .join("\n");
  const parts = [ERROR_STRUCTURAL_DRIFT_DESCRIPTION];
  if (drift.criticalDrift.length) {
    parts.push(`\n\nDrift crítico:\n${criticalBullets}`);
  }
  if (drift.duplicatedBootstrapPrompts.length) {
    parts.push(`\n\nBootstrap duplicados ou fora de system/:\n${dupBullets}`);
  }
  if (drift.legacyIaPath) {
    parts.push(`\n\nCaminho legado: ${drift.legacyIaPath}`);
  }

  return {
    ok: false,
    code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
    phase: "knowledge_structural_drift",
    title: ERROR_TITLE_STRUCTURAL_DRIFT,
    message: ERROR_MESSAGE_STRUCTURAL_DRIFT,
    description: parts.join(""),
    docsIaPath,
    relativePath: DOCS_IA_REL,
    driftValid: false,
    criticalDrift: drift.criticalDrift,
    warnings: drift.warnings,
    unknownFolders: drift.unknownFolders,
    unexpectedRootFiles: drift.unexpectedRootFiles,
    legacyIaPath: drift.legacyIaPath,
    duplicatedBootstrapPrompts: drift.duplicatedBootstrapPrompts,
    invalidBootstrapFiles: drift.duplicatedBootstrapPrompts,
    allowedBootstrapFiles: [...ALLOWED_BOOTSTRAP_FILES],
    details: {
      driftValidation: {
        driftValid: false,
        criticalDrift: drift.criticalDrift,
        warnings: drift.warnings,
        unknownFolders: drift.unknownFolders,
        unexpectedRootFiles: drift.unexpectedRootFiles,
        legacyIaPath: drift.legacyIaPath,
        duplicatedBootstrapPrompts: drift.duplicatedBootstrapPrompts,
      },
    },
  };
}

module.exports = {
  DOCS_IA_REL,
  LEGACY_IA_REL,
  KNOWN_DOMAIN_FOLDERS,
  OPTIONAL_DOMAIN_FOLDERS,
  EXPECTED_ROOT_FILES,
  ERROR_TITLE_STRUCTURAL_DRIFT,
  ERROR_MESSAGE_STRUCTURAL_DRIFT,
  detectStructuralDrift,
  buildStructuralDriftFailure,
};
