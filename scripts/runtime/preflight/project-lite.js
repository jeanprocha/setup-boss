/**
 * Estatísticas rápidas do projeto alvo (sem scan completo).
 */

const fs = require("fs");
const path = require("path");

const TREE_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".venv",
  "vendor",
  "target",
  "__pycache__",
  ".IA",
]);

function walkLimited(rootAbs, dirAbs, depth, maxDepth, budget, acc) {
  if (budget.files >= budget.maxFiles || depth > maxDepth) return;

  let entries = [];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    if (budget.files >= budget.maxFiles) break;
    if (TREE_IGNORE.has(entry.name)) continue;

    const full = path.join(dirAbs, entry.name);
    const rel = path.relative(rootAbs, full).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      acc.dirCount += 1;
      walkLimited(rootAbs, full, depth + 1, maxDepth, budget, acc);
      continue;
    }

    budget.files += 1;
    acc.fileCount += 1;

    const low = entry.name.toLowerCase();
    const ext = path.extname(low);

    if (/\.(tsx|jsx|vue|svelte)$/i.test(low)) acc.categories.frontend++;
    else if (/\.(ts|js|mjs|cjs)$/i.test(low)) acc.categories.script++;
    else if (/\.(sql|prisma)$/i.test(low) || /migration/i.test(low))
      acc.categories.data++;
    else if (/dockerfile|\.yaml|\.yml$/i.test(low)) acc.categories.ops++;
    else if (/\.(json|md)$/i.test(low)) acc.categories.docs_config++;
    else acc.categories.other++;

    if (/\/tests?\//i.test(rel) || /\.(test|spec)\./i.test(low))
      acc.categories.tests++;

    if ((/^routes?\//i.test(rel) || /\/api\//i.test(rel)) && /\.(ts|js)$/i.test(low))
      acc.categories.backend_routes++;

    if (/scripts[/\\]runtime[/\\]/i.test(rel) || /orchestration\.js$/i.test(low))
      acc.categories.setup_boss_runtime++;
  }
}

/**
 * @param {string} projectRootAbs
 * @param {{ maxFiles?: number, maxDepth?: number }} opts
 */
function collectProjectLite(projectRootAbs, opts = {}) {
  const maxFiles = opts.maxFiles ?? 3500;
  const maxDepth = opts.maxDepth ?? 5;

  const rootAbs = path.resolve(projectRootAbs);
  const acc = {
    root: rootAbs,
    fileCount: 0,
    dirCount: 0,
    categories: {
      frontend: 0,
      script: 0,
      data: 0,
      ops: 0,
      docs_config: 0,
      tests: 0,
      backend_routes: 0,
      setup_boss_runtime: 0,
      other: 0,
    },
    truncated: false,
  };

  const budget = { files: 0, maxFiles };
  walkLimited(rootAbs, rootAbs, 0, maxDepth, budget, acc);
  acc.truncated = budget.files >= maxFiles;

  return acc;
}

module.exports = {
  collectProjectLite,
  TREE_IGNORE,
};
