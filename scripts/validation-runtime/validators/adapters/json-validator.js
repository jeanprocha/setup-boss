/**
 * Adapter JSON — parse estrutural sem binários externos (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");

module.exports = {
  id: "json",
  stage: "structural",
  order_tier: 0,

  async checkAvailable() {
    return true;
  },

  /**
   * @param {{ projectRoot: string, paths: string[], timeoutMs?: number }} ctx
   */
  async execute(ctx) {
    const root = String(ctx.projectRoot || "");
    const paths = Array.isArray(ctx.paths) ? ctx.paths : [];
    const errors = [];
    const warnings = [];
    const parsedFiles = [];

    for (const rel of paths) {
      const abs = path.join(root, rel);
      try {
        const txt = fs.readFileSync(abs, "utf8");
        JSON.parse(txt);
        parsedFiles.push(rel);
      } catch (err) {
        errors.push(`${rel}: ${(err && err.message) || String(err)}`);
      }
    }

    const ok = errors.length === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "json",
        files_checked: parsedFiles.length,
        paths,
      },
      warnings,
      errors,
    };
  },
};
