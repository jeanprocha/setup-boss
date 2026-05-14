/**
 * Adapter golangci-lint — lint dirigido aos paths .go (Fase 4.2).
 */

const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "golangci",
  stage: "semantic",
  order_tier: 40,

  async checkAvailable() {
    const ms = Math.min(defaultValidationTimeoutMs(), 8000);
    const r = await runExternalProcess("golangci-lint", ["version"], {}, ms, null);
    return r.exit_code === 0 && !r.spawn_error;
  },

  /**
   * @param {{ projectRoot: string, paths: string[], timeoutMs?: number }} ctx
   */
  async execute(ctx) {
    const root = String(ctx.projectRoot || "");
    const paths = Array.isArray(ctx.paths) ? ctx.paths : [];
    const gofiles = paths.filter((p) => p.toLowerCase().endsWith(".go"));
    const timeoutMs = ctx.timeoutMs || defaultValidationTimeoutMs();

    if (!gofiles.length) {
      return {
        status: "skipped",
        output: { adapter: "golangci", reason: "no_go_paths" },
        warnings: [],
        errors: [],
      };
    }

    const args = ["run", "--timeout=2m", ...gofiles];
    const r = await runExternalProcess(
      "golangci-lint",
      args,
      { cwd: root },
      timeoutMs,
      ctx.signal || null,
    );

    const stderr = r.stderr || "";
    const stdout = r.stdout || "";

    if (r.spawn_error) {
      return {
        status: "skipped",
        output: { adapter: "golangci", spawn_error: r.spawn_error },
        warnings: [],
        errors: [],
      };
    }

    if (r.timed_out) {
      return {
        status: "error",
        output: { adapter: "golangci", timed_out: true },
        warnings: [],
        errors: ["golangci-lint: timeout"],
      };
    }

    const ok = r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "golangci",
        exit_code: r.exit_code,
        stdout_tail: stdout.slice(-12000),
        stderr_tail: stderr.slice(-12000),
      },
      warnings: [],
      errors: ok ? [] : [`golangci-lint exit_code=${r.exit_code}`],
    };
  },
};
