/**
 * Adapter ESLint — execução isolada via npx (Fase 4.2).
 */

const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "eslint",
  stage: "lightweight",
  order_tier: 20,

  async checkAvailable() {
    const ms = Math.min(defaultValidationTimeoutMs(), 15000);
    const r = await runExternalProcess(
      "npx",
      ["--yes", "eslint", "--version"],
      { cwd: process.cwd() },
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

    if (!paths.length) {
      return {
        status: "skipped",
        output: { adapter: "eslint", reason: "no_paths" },
        warnings: [],
        errors: [],
      };
    }

    const args = [
      "--yes",
      "eslint",
      "--max-warnings",
      "0",
      "--no-error-on-unmatched-pattern",
      ...paths,
    ];

    const r = await runExternalProcess("npx", args, { cwd: root }, timeoutMs, ctx.signal || null);

    const stderr = r.stderr || "";
    const stdout = r.stdout || "";
    const timedOut = Boolean(r.timed_out);

    if (r.spawn_error) {
      return {
        status: "skipped",
        output: {
          adapter: "eslint",
          spawn_error: r.spawn_error,
          stdout_tail: stdout.slice(-4000),
          stderr_tail: stderr.slice(-4000),
        },
        warnings: [],
        errors: [],
      };
    }

    if (timedOut) {
      return {
        status: "error",
        output: {
          adapter: "eslint",
          timed_out: true,
          stdout_tail: stdout.slice(-4000),
          stderr_tail: stderr.slice(-4000),
        },
        warnings: [],
        errors: ["eslint: timeout"],
      };
    }

    const ok = r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "eslint",
        exit_code: r.exit_code,
        stdout_tail: stdout.slice(-8000),
        stderr_tail: stderr.slice(-8000),
      },
      warnings: [],
      errors: ok ? [] : [`eslint exit_code=${r.exit_code}`],
    };
  },
};
