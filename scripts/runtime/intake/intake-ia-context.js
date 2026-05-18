"use strict";

const fs = require("fs");
const path = require("path");

const { IA_FILES, collectIAContext } = require("../../ensure-ia");
const { resolveProjectIaDir } = require("../../shared/ia-path-resolver");

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Conta ficheiros `.md` no topo da pasta IA (alinhado ao sinal usado no preflight).
 * @param {string} iaDir
 */
function countMarkdownFilesInIaRoot(iaDir) {
  if (!fs.existsSync(iaDir)) return 0;
  try {
    return fs.readdirSync(iaDir).filter((n) => n.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

/**
 * Métricas e avisos para intake (sem persistir o texto agregado de collectIAContext).
 *
 * @param {string} projectRootAbs
 * @returns {{
 *   ia_dir: string,
 *   ia_source: string,
 *   files_found: number,
 *   files_missing: string[],
 *   markdown_markers_found: number,
 *   index_found: boolean,
 *   total_chars: number,
 *   status: "ok" | "partial",
 *   warnings: string[],
 * }}
 */
function buildIntakeIaContextSummary(projectRootAbs) {
  const root = path.resolve(projectRootAbs);
  const { iaDir, source, warnings: iaPathWarnings } = resolveProjectIaDir(root);

  /** @type {string[]} */
  const warnings = [];
  for (const w of iaPathWarnings || []) {
    if (w && typeof w.message === "string" && w.message.trim()) {
      warnings.push(w.message);
    }
  }

  /** @type {string[]} */
  const filesMissing = [];
  let filesFound = 0;

  for (const fileName of IA_FILES) {
    const fp = path.join(iaDir, fileName);
    const raw = safeRead(fp);
    if (!raw.trim()) {
      filesMissing.push(fileName);
      if (!fs.existsSync(fp)) {
        warnings.push(`IA ficheiro ausente: ${fileName}`);
      } else {
        warnings.push(`IA ficheiro vazio ou só espaços: ${fileName}`);
      }
    } else {
      filesFound++;
    }
  }

  const indexPath = path.join(iaDir, "index.md");
  const indexFound =
    fs.existsSync(indexPath) && safeRead(indexPath).trim().length > 0;

  const markdownMarkersFound = countMarkdownFilesInIaRoot(iaDir);

  const totalChars = collectIAContext(root).length;

  const status = filesMissing.length === 0 ? "ok" : "partial";

  return {
    ia_dir: iaDir,
    ia_source: source,
    files_found: filesFound,
    files_missing: filesMissing,
    markdown_markers_found: markdownMarkersFound,
    index_found: indexFound,
    total_chars: totalChars,
    status,
    warnings,
  };
}

/**
 * Subconjunto gravado em run-context.json (sem warnings nem arrays longos duplicados).
 *
 * @param {ReturnType<typeof buildIntakeIaContextSummary>} summary
 */
function iaContextForRunContext(summary) {
  return {
    status: summary.status,
    ia_dir: summary.ia_dir,
    ia_source: summary.ia_source,
    files_found: summary.files_found,
    files_missing: summary.files_missing.slice(),
    markdown_markers_found: summary.markdown_markers_found,
    index_found: summary.index_found,
    total_chars: summary.total_chars,
  };
}

module.exports = {
  buildIntakeIaContextSummary,
  iaContextForRunContext,
};
