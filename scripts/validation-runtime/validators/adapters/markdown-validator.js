/**
 * Adapter Markdown — markdownlint-cli2 via npx quando disponível (Fase 4.2).
 */

const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "markdown",
  stage: "lightweight",
  order_tier: 21,

  async checkAvailable() {
    const ms = Math.min(defaultValidationTimeoutMs(), 12000);
    const r = await runExternalProcess(
      "npx",
      ["--yes", "markdownlint-cli2", "--version"],
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
    const md = paths.filter((p) => /\.md$/i.test(p));
    const timeoutMs = ctx.timeoutMs || defaultValidationTimeoutMs();

    if (!md.length) {
      return {
        status: "skipped",
        output: { adapter: "markdown", reason: "no_md_paths" },
        warnings: [],
        errors: [],
      };
    }

    const args = ["--yes", "markdownlint-cli2", ...md];
    const r = await runExternalProcess("npx", args, { cwd: root }, timeoutMs, ctx.signal || null);

    const stderr = r.stderr || "";
    const stdout = r.stdout || "";

    if (r.spawn_error || (r.exit_code !== 0 && r.exit_code != null && stdout.includes("npm ERR"))) {
      return {
        status: "skipped",
        output: {
          adapter: "markdown",
          reason: "markdownlint_cli2_unavailable",
          spawn_error: r.spawn_error || null,
          stderr_tail: stderr.slice(-2000),
        },
        warnings: ["markdownlint-cli2 não disponível (skipped)."],
        errors: [],
      };
    }

    if (r.timed_out) {
      return {
        status: "error",
        output: { adapter: "markdown", timed_out: true },
        warnings: [],
        errors: ["markdownlint: timeout"],
      };
    }

    const ok = r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "markdown",
        exit_code: r.exit_code,
        stdout_tail: stdout.slice(-8000),
        stderr_tail: stderr.slice(-8000),
      },
      warnings: [],
      errors: ok ? [] : [`markdownlint exit_code=${r.exit_code}`],
    };
  },
};
