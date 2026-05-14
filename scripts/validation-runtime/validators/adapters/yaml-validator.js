/**
 * Adapter YAML — usa pacote `yaml` se instalado no projeto-alvo; caso contrário skipped (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

module.exports = {
  id: "yaml",
  stage: "structural",
  order_tier: 0,

  async checkAvailable(ctx) {
    return tryLoadYamlFromProject(ctx && ctx.projectRoot) != null;
  },

  /**
   * @param {{ projectRoot: string, paths: string[] }} ctx
   */
  async execute(ctx) {
    const yaml = tryLoadYamlFromProject(ctx.projectRoot);
    if (!yaml || typeof yaml.parse !== "function") {
      return {
        status: "skipped",
        output: { adapter: "yaml", reason: "no_yaml_parser_in_target" },
        warnings: ["Instale `yaml` no projeto-alvo ou desative o stage structural para .yml."],
        errors: [],
      };
    }

    const root = String(ctx.projectRoot || "");
    const paths = Array.isArray(ctx.paths) ? ctx.paths : [];
    const errors = [];
    const checked = [];

    for (const rel of paths) {
      const abs = path.join(root, rel);
      try {
        const txt = fs.readFileSync(abs, "utf8");
        yaml.parse(txt);
        checked.push(rel);
      } catch (err) {
        errors.push(`${rel}: ${(err && err.message) || String(err)}`);
      }
    }

    const ok = errors.length === 0;
    return {
      status: ok ? "passed" : "failed",
      output: { adapter: "yaml", files_checked: checked.length, paths },
      warnings: [],
      errors,
    };
  },
};

function tryLoadYamlFromProject(projectRoot) {
  const root = projectRoot != null ? String(projectRoot) : "";
  if (!root) return null;
  const paths = Module._nodeModulePaths(root);
  for (const base of paths) {
    try {
      const reqPath = path.join(base, "yaml");
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(reqPath);
    } catch (_) {
      /* try next */
    }
  }
  return null;
}
