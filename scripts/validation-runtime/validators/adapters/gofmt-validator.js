/**
 * Adapter gofmt — `gofmt -l` nos ficheiros .go (Fase 4.2).
 */

const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "gofmt",
  stage: "syntax",
  order_tier: 11,

  async checkAvailable() {
    const ms = Math.min(defaultValidationTimeoutMs(), 8000);
    const r = await runExternalProcess("gofmt", ["-h"], {}, ms, null);
    return r.exit_code === 0 || r.exit_code === 2;
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
        output: { adapter: "gofmt", reason: "no_go_paths" },
        warnings: [],
        errors: [],
      };
    }

    const args = ["-l", ...gofiles];
    const r = await runExternalProcess("gofmt", args, { cwd: root }, timeoutMs, ctx.signal || null);

    const stdout = (r.stdout || "").trim();

    if (r.spawn_error) {
      return {
        status: "skipped",
        output: { adapter: "gofmt", spawn_error: r.spawn_error },
        warnings: [],
        errors: [],
      };
    }

    if (r.timed_out) {
      return {
        status: "error",
        output: { adapter: "gofmt", timed_out: true },
        warnings: [],
        errors: ["gofmt: timeout"],
      };
    }

    const bad = stdout
      ? stdout
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

    const ok = bad.length === 0 && r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "gofmt",
        exit_code: r.exit_code,
        needs_formatting: bad,
      },
      warnings: [],
      errors: ok ? [] : [`gofmt -l reported ${bad.length} file(s)`],
    };
  },
};
