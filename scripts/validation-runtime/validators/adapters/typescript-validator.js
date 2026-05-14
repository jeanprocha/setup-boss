/**
 * Adapter TypeScript — tsc --noEmit dirigido aos ficheiros (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "typescript",
  stage: "syntax",
  order_tier: 10,

  async checkAvailable(ctx) {
    const root = ctx && ctx.projectRoot ? String(ctx.projectRoot) : process.cwd();
    const ms = Math.min(defaultValidationTimeoutMs(), 15000);
    const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
    if (fs.existsSync(bin)) return true;
    const r = await runExternalProcess(
      "npx",
      ["--yes", "typescript", "--version"],
      { cwd: root },
      ms,
      null,
    );
    return r.exit_code === 0 && !r.spawn_error;
  },

  /**
   * @param {{ projectRoot: string, paths: string[], timeoutMs?: number }} ctx
   */
  async execute(ctx) {
    const root = String(ctx.projectRoot || "");
    const paths = Array.isArray(ctx.paths) ? ctx.paths : [];
    const timeoutMs = ctx.timeoutMs || defaultValidationTimeoutMs();

    const tsFiles = paths.filter((p) => /\.tsx?$/i.test(p));
    if (!tsFiles.length) {
      return {
        status: "skipped",
        output: { adapter: "typescript", reason: "no_ts_paths" },
        warnings: [],
        errors: [],
      };
    }

    const localBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
    const useLocal = fs.existsSync(localBin);

    const argsLocal = ["--noEmit", "--pretty", "false", ...tsFiles];
    const argsNpx = ["--yes", "--package=typescript", "tsc", "--noEmit", "--pretty", "false", ...tsFiles];

    const cmd = useLocal ? localBin : "npx";
    const spawnArgs = useLocal ? argsLocal : argsNpx;

    const r = await runExternalProcess(cmd, spawnArgs, { cwd: root }, timeoutMs, ctx.signal || null);

    const stderr = r.stderr || "";
    const stdout = r.stdout || "";

    if (r.spawn_error) {
      return {
        status: "skipped",
        output: {
          adapter: "typescript",
          spawn_error: r.spawn_error,
          stdout_tail: stdout.slice(-4000),
          stderr_tail: stderr.slice(-4000),
        },
        warnings: [],
        errors: [],
      };
    }

    if (r.timed_out) {
      return {
        status: "error",
        output: { adapter: "typescript", timed_out: true, stderr_tail: stderr.slice(-4000) },
        warnings: [],
        errors: ["tsc: timeout"],
      };
    }

    const ok = r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "typescript",
        exit_code: r.exit_code,
        stdout_tail: stdout.slice(-8000),
        stderr_tail: stderr.slice(-8000),
      },
      warnings: [],
      errors: ok ? [] : [`tsc exit_code=${r.exit_code}`],
    };
  },
};
