#!/usr/bin/env node
"use strict";

/**
 * Sobe o stack local do zero: dependências → daemon (Runtime API) → frontend (Next).
 *
 * Uso (na raiz do repo):
 *   node scripts/dev/start-stack.js
 *   npm run dev:stack
 *
 * Opções:
 *   --skip-install         não corre npm install
 *   --no-restart-daemon    não para daemon existente antes de subir
 *   --daemon-only          só backend
 *   --frontend-only        só Next (daemon já deve estar a correr)
 *   --foreground-daemon    daemon em primeiro plano (stdio herdado; sem frontend)
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const frontendDir = path.join(repoRoot, "frontend");
const cliEntry = path.join(repoRoot, "scripts", "cli", "index.js");
const daemonScript = path.join(repoRoot, "scripts", "daemon", "setup-bossd.js");

const RUNTIME_PORT = Number(
  process.env.SETUP_BOSS_RUNTIME_API_PORT || 3210,
);
const HEALTH_URL = `http://127.0.0.1:${RUNTIME_PORT}/health`;
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 400;

const argv = new Set(process.argv.slice(2));
const opts = {
  skipInstall: argv.has("--skip-install"),
  restartDaemon: !argv.has("--no-restart-daemon"),
  daemonOnly: argv.has("--daemon-only"),
  frontendOnly: argv.has("--frontend-only"),
  foregroundDaemon: argv.has("--foreground-daemon"),
};

if (opts.daemonOnly && opts.frontendOnly) {
  console.error("[stack] --daemon-only e --frontend-only são incompatíveis.");
  process.exit(1);
}

/** @param {string} msg */
function log(msg) {
  console.log(`[stack] ${msg}`);
}

/** @param {string} cwd @param {string[]} args */
function runNpm(cwd, args) {
  const r = spawnSync("npm", args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`npm ${args.join(" ")} falhou (cwd=${cwd})`);
  }
}

function installDependencies() {
  log("a instalar dependências na raiz…");
  runNpm(repoRoot, ["install"]);
  log("a instalar dependências do frontend…");
  runNpm(frontendDir, ["install"]);
}

/** @returns {Promise<{ ok: boolean, status?: number }>} */
function fetchHealthOnce() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, (res) => {
      res.resume();
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
    });
    req.on("error", () => resolve({ ok: false }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

async function waitForDaemonReady() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const h = await fetchHealthOnce();
    if (h.ok) return;
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  throw new Error(
    `daemon não respondeu em ${HEALTH_URL} dentro de ${HEALTH_TIMEOUT_MS / 1000}s`,
  );
}

function stopDaemonIfRunning() {
  log("a parar daemon anterior (se existir)…");
  spawnSync(process.execPath, [cliEntry, "daemon", "stop"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

function startDaemonDetached() {
  log(`a iniciar daemon (Runtime API :${RUNTIME_PORT})…`);
  const child = spawn(process.execPath, [daemonScript], {
    cwd: repoRoot,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
}

function startDaemonForeground() {
  log(`daemon em primeiro plano (:${RUNTIME_PORT}) — Ctrl+C para parar.`);
  const child = spawn(
    process.execPath,
    [daemonScript, "--foreground"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

/** @returns {import("child_process").ChildProcess} */
function startFrontend() {
  log("a iniciar frontend (Next dev)…");
  return spawn("npm", ["run", "dev"], {
    cwd: frontendDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
}

async function main() {
  if (!opts.skipInstall && !opts.frontendOnly) {
    installDependencies();
  } else if (!opts.skipInstall && opts.frontendOnly) {
    log("a instalar dependências do frontend…");
    runNpm(frontendDir, ["install"]);
  }

  if (!opts.frontendOnly) {
    if (opts.restartDaemon) stopDaemonIfRunning();

    if (opts.foregroundDaemon || opts.daemonOnly) {
      if (opts.foregroundDaemon && !opts.daemonOnly) {
        console.error(
          "[stack] use --foreground-daemon com --daemon-only, ou omita --foreground-daemon para subir os dois.",
        );
        process.exit(1);
      }
      startDaemonForeground();
      return;
    }

    startDaemonDetached();
    log("a aguardar /health…");
    await waitForDaemonReady();
    log(`daemon pronto → ${HEALTH_URL}`);
  }

  if (opts.daemonOnly) {
    log("modo --daemon-only: daemon em background. Parar: npm run setup-boss -- daemon stop");
    return;
  }

  if (!fs.existsSync(path.join(frontendDir, "node_modules"))) {
    log("node_modules do frontend em falta — a instalar…");
    runNpm(frontendDir, ["install"]);
  }

  const fe = startFrontend();
  log("Mission Control → http://localhost:3000 (porta pode variar no output do Next)");
  log("Runtime API   → http://127.0.0.1:" + RUNTIME_PORT + " (proxy Next: /api/runtime)");

  fe.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });

  const onSignal = () => {
    log("a encerrar frontend…");
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(fe.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        fe.kill("SIGTERM");
      }
    } catch (_) {
      /* */
    }
    process.exit(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

main().catch((e) => {
  console.error(`[stack] ${e.message || e}`);
  process.exit(1);
});
