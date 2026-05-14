/**
 * Execução externa isolada com timeout — validators CLI (Fase 4.2).
 */

const { spawn } = require("child_process");

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: object }} opts
 * @param {number} timeoutMs
 * @param {AbortSignal|null} signal
 */
function runExternalProcess(cmd, args, opts = {}, timeoutMs = 120000, signal = null) {
  const cwd = opts.cwd || process.cwd();
  const env = { ...process.env, ...(opts.env || {}) };
  const useShell = process.platform === "win32";

  return new Promise((resolve) => {
    const chunksOut = [];
    const chunksErr = [];

    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env,
        shell: useShell,
        windowsHide: true,
        signal: signal || undefined,
      });
    } catch (err) {
      resolve({
        exit_code: null,
        timed_out: false,
        killed: false,
        spawn_error: String((err && err.message) || err || ""),
        stdout: "",
        stderr: "",
      });
      return;
    }

    let timedOut = false;
    let killed = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try {
        child.kill("SIGTERM");
      } catch (_) {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch (_) {
          /* ignore */
        }
      }, 4000);
    }, timeoutMs);

    child.stdout.on("data", (d) => chunksOut.push(d));
    child.stderr.on("data", (d) => chunksErr.push(d));

    child.on("close", (code, sig) => {
      clearTimeout(timer);
      resolve({
        exit_code: code,
        signal: sig,
        timed_out: timedOut,
        killed,
        stdout: Buffer.concat(chunksOut).toString("utf8").slice(0, 524288),
        stderr: Buffer.concat(chunksErr).toString("utf8").slice(0, 524288),
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exit_code: null,
        timed_out: timedOut,
        killed,
        spawn_error: String((err && err.message) || err || ""),
        stdout: Buffer.concat(chunksOut).toString("utf8").slice(0, 524288),
        stderr: Buffer.concat(chunksErr).toString("utf8").slice(0, 524288),
      });
    });
  });
}

function defaultValidationTimeoutMs() {
  const n = Number(process.env.SETUP_BOSS_VALIDATION_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 180000;
}

module.exports = {
  runExternalProcess,
  defaultValidationTimeoutMs,
};
