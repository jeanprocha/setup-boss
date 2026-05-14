/**
 * Hints leves de dependência — regex / caminho apenas (Fase 4.1.2).
 */

const fs = require("fs");
const path = require("path");

const READ_CAP = 8192;

/**
 * @typedef {{ kind: string, detail: string }} DependencyHint
 */

/**
 * @param {string} absPath ficheiro no disco (opcional)
 * @param {string} relPath posix relativo ao projeto
 * @returns {DependencyHint[]}
 */
function collectDependencyHints(absPath, relPath) {
  const hints = [];
  const rel = String(relPath || "").replace(/\\/g, "/").trim();
  if (!rel) return hints;

  const posixDir = path.posix.dirname(rel);
  if (posixDir && posixDir !== ".") {
    hints.push({
      kind: "directory_context",
      detail: posixDir,
    });
  }

  const base = path.posix.basename(rel).toLowerCase();
  const ext = path.posix.extname(base).toLowerCase();

  let snippet = "";
  try {
    if (absPath && fs.existsSync(absPath)) {
      const fd = fs.openSync(absPath, "r");
      try {
        const buf = Buffer.allocUnsafe(Math.min(READ_CAP, fs.statSync(absPath).size || READ_CAP));
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        snippet = buf.slice(0, n).toString("utf8");
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch (_) {
    snippet = "";
  }

  if ((ext === ".vue" || base.endsWith(".vue")) && snippet) {
    if (/<script\b/i.test(snippet)) hints.push({ kind: "vue_script_block", detail: rel });
    if (/<template\b/i.test(snippet)) hints.push({ kind: "vue_template_block", detail: rel });
  }

  if (ext === ".php" || base.endsWith(".php")) {
    const ns = snippet.match(/^\s*namespace\s+([^;]+);/m);
    if (ns) hints.push({ kind: "php_namespace", detail: ns[1].trim() });
  }

  if (ext === ".go" || base.endsWith(".go")) {
    const pkg = snippet.match(/^\s*package\s+(\S+)/m);
    if (pkg) hints.push({ kind: "go_package_clause", detail: pkg[1].trim() });
  }

  const importRegexes = [
    /\bfrom\s+['"](\.[^'"]+)['"]/g,
    /\brequire\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /\bimport\s+['"](\.[^'"]+)['"]/g,
  ];

  const relatives = new Set();
  if (snippet && [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue"].includes(ext)) {
    for (const re of importRegexes) {
      let m;
      const r = new RegExp(re.source, re.flags);
      while ((m = r.exec(snippet)) !== null) {
        relatives.add(m[1]);
        if (relatives.size > 48) break;
      }
    }
  }

  const sorted = [...relatives].sort((a, b) => a.localeCompare(b));
  for (const imp of sorted.slice(0, 24)) {
    hints.push({
      kind: "relative_import",
      detail: imp,
    });
  }

  return hints.slice(0, 64);
}

module.exports = {
  collectDependencyHints,
};
