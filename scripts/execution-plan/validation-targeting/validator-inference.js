/**
 * Inferência de validators possíveis — nunca executa ferramentas (Fase 4.1.2).
 */

const fs = require("fs");
const path = require("path");

/**
 * @param {string|null|undefined} projectRoot
 * @param {string[]} names ficheiros na raiz do projeto a testar
 */
function rootHasAny(projectRoot, names) {
  const root = projectRoot && String(projectRoot).trim();
  if (!root || !names.length) return false;
  try {
    for (const n of names) {
      if (fs.existsSync(path.join(root, n))) return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

/**
 * @param {string} relPath
 * @param {{ projectRoot?: string|null }} opts
 * @returns {string[]} lista ordenada determinística
 */
function inferValidators(relPath, opts = {}) {
  const projectRoot = opts.projectRoot != null ? String(opts.projectRoot) : null;
  const p = String(relPath || "").replace(/\\/g, "/").trim();
  const base = path.posix.basename(p).toLowerCase();
  const ext = path.posix.extname(base).toLowerCase();

  const out = new Set();

  function addMany(xs) {
    for (const x of xs) {
      if (x) out.add(String(x));
    }
  }

  if (ext === ".ts" || ext === ".tsx") {
    addMany(["eslint", "typescript", "jest_or_vitest"]);
  } else if (ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") {
    addMany(["eslint"]);
    addMany(["jest_or_vitest"]);
  } else if (ext === ".vue") {
    addMany(["eslint", "vue_compiler", "jest_or_vitest"]);
  } else if (ext === ".go") {
    addMany(["gofmt", "golangci-lint", "go_test"]);
  } else if (ext === ".php") {
    addMany(["phpstan", "phpunit"]);
  } else if (ext === ".json") {
    addMany(["json_parse"]);
  } else if (ext === ".yaml" || ext === ".yml") {
    addMany(["yaml_parse"]);
  } else if (ext === ".md") {
    addMany(["markdown_lint"]);
  } else if (ext === ".css" || ext === ".scss") {
    addMany(["stylelint"]);
  }

  if (base === "dockerfile") {
    addMany(["hadolint"]);
  }

  if (base === "package.json") {
    addMany(["npm_package_lint"]);
  }

  if (/^tsconfig(\..*)?\.json$/i.test(base)) {
    addMany(["typescript_project_refs"]);
  }

  if (rootHasAny(projectRoot, ["biome.json", "biome.jsonc"])) {
    addMany(["biome"]);
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  inferValidators,
  rootHasAny,
};
