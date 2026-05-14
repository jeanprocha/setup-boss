/**
 * Adapter PHPStan — vendor/bin/phpstan quando presente (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const { runExternalProcess, defaultValidationTimeoutMs } = require("../base-validator");

module.exports = {
  id: "phpstan",
  stage: "semantic",
  order_tier: 41,

  async checkAvailable(ctx) {
    const root = ctx && ctx.projectRoot ? String(ctx.projectRoot) : "";
    const bin = path.join(root, "vendor", "bin", process.platform === "win32" ? "phpstan.bat" : "phpstan");
    return Boolean(root && fs.existsSync(bin));
  },

  /**
   * @param {{ projectRoot: string, paths: string[], timeoutMs?: number }} ctx
   */
  async execute(ctx) {
    const root = String(ctx.projectRoot || "");
    const paths = Array.isArray(ctx.paths) ? ctx.paths : [];
    const phpFiles = paths.filter((p) => /\.php$/i.test(p));
    const timeoutMs = ctx.timeoutMs || defaultValidationTimeoutMs();

    if (!phpFiles.length) {
      return {
        status: "skipped",
        output: { adapter: "phpstan", reason: "no_php_paths" },
        warnings: [],
        errors: [],
      };
    }

    const bin = path.join(root, "vendor", "bin", process.platform === "win32" ? "phpstan.bat" : "phpstan");
    if (!fs.existsSync(bin)) {
      return {
        status: "skipped",
        output: { adapter: "phpstan", reason: "missing_vendor_bin" },
        warnings: ["vendor/bin/phpstan não encontrado."],
        errors: [],
      };
    }

    const args = ["analyse", "--no-progress", ...phpFiles];
    const r = await runExternalProcess(bin, args, { cwd: root }, timeoutMs, ctx.signal || null);

    const stderr = r.stderr || "";
    const stdout = r.stdout || "";

    if (r.spawn_error) {
      return {
        status: "skipped",
        output: { adapter: "phpstan", spawn_error: r.spawn_error },
        warnings: [],
        errors: [],
      };
    }

    if (r.timed_out) {
      return {
        status: "error",
        output: { adapter: "phpstan", timed_out: true },
        warnings: [],
        errors: ["phpstan: timeout"],
      };
    }

    const ok = r.exit_code === 0;
    return {
      status: ok ? "passed" : "failed",
      output: {
        adapter: "phpstan",
        exit_code: r.exit_code,
        stdout_tail: stdout.slice(-12000),
        stderr_tail: stderr.slice(-12000),
      },
      warnings: [],
      errors: ok ? [] : [`phpstan exit_code=${r.exit_code}`],
    };
  },
};
