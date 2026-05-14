"use strict";

/**
 * Extração textual de especificadores relativos em JS/TS (MVP sem parser AST pesado).
 * Comentários de linha (`//`) e comentários de bloco antes da varredura.
 */

const ANALYZER_ID = "js_ts_imports";

/** @typedef {{ kind: string, specifier: string, pattern: string }} ExtractedSpecifier */

function stripSlashBlockComments(content) {
  return String(content || "").replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripLineComments(content) {
  return String(content || "").replace(/\/\/[^\n]*/g, " ");
}

function stripCommentsJsLike(content) {
  return stripLineComments(stripSlashBlockComments(content));
}

/* Corpo relativo ./ ou ../ + resto até carácter estrutural habitual. */
const CAP_REL_SPEC = "(?:\\.\\.|\\.)\\/[^'\"\\s;)]+";

/**
 * @param {string} content já sem comentários
 * @returns {ExtractedSpecifier[]}
 */
function extractSideEffectImports(content) {
  /** @type {ExtractedSpecifier[]} */
  const out = [];
  const re = new RegExp(`\\bimport\\s+['"](${CAP_REL_SPEC})['"]\\s*;?`, "g");
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ kind: "static_relative_import", specifier: m[1], pattern: "import_side_effect" });
  }
  return out;
}

/**
 * Matches `from '...'` for import/export — classificação pela presença de `export`.
 */
function extractFromStatements(content) {
  /** @type {ExtractedSpecifier[]} */
  const out = [];
  const re = new RegExp(`\\bfrom\\s+['"](${CAP_REL_SPEC})['"]`, "g");
  let m;
  while ((m = re.exec(content)) !== null) {
    const before = content.slice(Math.max(0, m.index - 400), m.index);
    const li = before.lastIndexOf("import");
    const le = before.lastIndexOf("export");
    const kind = le > li ? "export_relative_reexport" : "static_relative_import";
    out.push({ kind, specifier: m[1], pattern: "from_statement" });
  }
  return out;
}

function extractRequireLiterals(content) {
  /** @type {ExtractedSpecifier[]} */
  const out = [];
  const re = new RegExp(`\\brequire\\s*\\(\\s*['"](${CAP_REL_SPEC})['"]\\s*\\)`, "g");
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ kind: "require_relative", specifier: m[1], pattern: "require" });
  }
  return out;
}

function extractDynamicImportLiterals(content) {
  /** @type {ExtractedSpecifier[]} */
  const out = [];
  const re = new RegExp(`\\bimport\\s*\\(\\s*['"](${CAP_REL_SPEC})['"]\\s*\\)`, "g");
  let m;
  while ((m = re.exec(content)) !== null) {
    out.push({ kind: "dynamic_relative_import", specifier: m[1], pattern: "dynamic_import" });
  }
  return out;
}

/**
 * @param {string} source
 * @returns {ExtractedSpecifier[]}
 */
function extractRelativeImportSpecifiers(source) {
  const body = stripCommentsJsLike(String(source || ""));
  const parts = [
    ...extractSideEffectImports(body),
    ...extractFromStatements(body),
    ...extractRequireLiterals(body),
    ...extractDynamicImportLiterals(body),
  ];
  parts.sort((a, b) => {
    const sk = a.kind.localeCompare(b.kind);
    if (sk !== 0) return sk;
    return a.specifier.localeCompare(b.specifier);
  });
  /** Dedupe iguais (mesmo kind + specifier) */
  const seen = new Set();
  /** @type {ExtractedSpecifier[]} */
  const deduped = [];
  for (const p of parts) {
    const k = `${p.kind}\u001f${p.specifier}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }
  return deduped;
}

module.exports = {
  ANALYZER_ID,
  stripCommentsJsLike,
  extractRelativeImportSpecifiers,
};
