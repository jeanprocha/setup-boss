/**
 * Inferência heurística de âmbito de validação — sem AST (Fase 4.1.2).
 */

const path = require("path");

/**
 * @param {string} relPath caminho normalizado posix relativo ao projeto
 * @returns {'file'|'module'|'project'}
 */
function inferValidationScope(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/").trim();
  if (!p) return "file";

  const lower = p.toLowerCase();
  const base = path.posix.basename(lower);
  const dir = path.posix.dirname(lower);

  if (
    base === "package.json" ||
    base === "pnpm-lock.yaml" ||
    base === "yarn.lock" ||
    base === "package-lock.json" ||
    /^tsconfig(\..*)?\.json$/i.test(base) ||
    base === "dockerfile" ||
    /^docker-compose(\..*)?\.ya?ml$/i.test(base) ||
    /\.nomad$/i.test(base) ||
    /\.tf$/i.test(base) ||
    /(^|\/)migrations(\/|$)/i.test(lower) ||
    /(^|\/)infra(\/|$)/i.test(lower) ||
    /(^|\/)deploy(\/|$)/i.test(lower) ||
    base === ".env" ||
    /^\.env\./i.test(base)
  ) {
    return "project";
  }

  if (
    base.endsWith(".md") ||
    base.endsWith(".json") ||
    base.endsWith(".yaml") ||
    base.endsWith(".yml") ||
    base === ".gitignore" ||
    base === ".editorconfig" ||
    base === ".prettierrc" ||
    base === ".prettierrc.json" ||
    /\.prettier.*\.ya?ml$/i.test(base)
  ) {
    const underSrc =
      dir.startsWith("src/") ||
      dir.startsWith("lib/") ||
      dir.startsWith("packages/");
    if (base.endsWith(".json") && underSrc && base !== "package.json") {
      return "module";
    }
    return "file";
  }

  if (
    base.endsWith(".ts") ||
    base.endsWith(".tsx") ||
    base.endsWith(".js") ||
    base.endsWith(".jsx") ||
    base.endsWith(".mjs") ||
    base.endsWith(".cjs") ||
    base.endsWith(".vue") ||
    base.endsWith(".go") ||
    base.endsWith(".php")
  ) {
    return "module";
  }

  if (
    base.endsWith(".css") ||
    base.endsWith(".scss") ||
    base.endsWith(".html") ||
    base.endsWith(".sql")
  ) {
    return "module";
  }

  return "file";
}

module.exports = {
  inferValidationScope,
};
