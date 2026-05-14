#!/usr/bin/env node
/**
 * E2E real: daemon + Runtime API + queue + worker (sem LLM).
 *
 * Requer apenas Node; usa SETUP_BOSS_E2E_WORKER_NOOP em scripts/run.js.
 *
 * Estado isolado: SETUP_BOSS_DATA_DIR (directório temporário por teste).
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { spawn } = require("child_process");

function resolveRepoRoot() {
  const env = process.env.SETUP_BOSS_CLI_ROOT;
  if (env && String(env).trim()) return path.resolve(String(env).trim());
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 20; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkg, "utf-8"));
        if (p.name === "setup-boss") return dir;
      } catch (_) {
        /* */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "..", "..", "..");
}

const REPO_ROOT = resolveRepoRoot();
const DAEMON_SCRIPT = path.join(REPO_ROOT, "scripts", "daemon", "setup-bossd.js");

function mkDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sb-e2e-data-"));
}

function pidFile(dataDir) {
  return path.join(dataDir, "daemon", "pid");
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function poll(cond, timeoutMs = 20000, stepMs = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await cond()) return;
    await sleep(stepMs);
  }
  throw new Error("poll timeout");
}

function httpJson(port, opts) {
  const bodyStr =
    opts.body && typeof opts.body === "object"
      ? JSON.stringify(opts.body)
      : opts.bodyRaw || "";

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: opts.path,
        method: opts.method || "GET",
        headers: {
          ...(opts.headers || {}),
          ...(bodyStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = txt ? JSON.parse(txt) : null;
          } catch (_) {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw: txt });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function waitHealth(port) {
  await poll(async () => {
    try {
      const r = await httpJson(port, { path: "/health" });
      return r.status === 200 && r.json && r.json.ok === true;
    } catch (_) {
      return false;
    }
  }, 25000);
}

function readPid(dataDir) {
  try {
    const raw = fs.readFileSync(pidFile(dataDir), "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function startDaemon(dataDir, port, extraEnv = {}) {
  const env = {
    ...process.env,
    SETUP_BOSS_CLI_ROOT: REPO_ROOT,
    SETUP_BOSS_DATA_DIR: dataDir,
    SETUP_BOSS_RUNTIME_API_PORT: String(port),
    SETUP_BOSS_E2E_WORKER_NOOP: "1",
    SETUP_BOSS_MAX_WORKERS: "3",
    SETUP_BOSS_MAX_WORKERS_PER_PROJECT: "2",
    SETUP_BOSS_SCHEDULER_POLL_MS: "350",
    SETUP_BOSS_STUCK_POLL_MS: "600000",
    ...extraEnv,
  };
  return spawn(process.execPath, [DAEMON_SCRIPT], {
    cwd: REPO_ROOT,
    env,
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function stopDaemon(dataDir) {
  const { isPidAlive } = require("../../daemon/lib/pid-file");
  const pid = readPid(dataDir);
  if (pid == null) return;
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (_) {
    /* */
  }
  await poll(() => !isPidAlive(pid), 20000, 200).catch(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch (_) {
      /* */
    }
  });
}

async function waitJobStatus(port, jobId, want, timeoutMs = 35000) {
  await poll(async () => {
    const r = await httpJson(port, { path: `/jobs/${encodeURIComponent(jobId)}` });
    if (r.status !== 200 || !r.json || !r.json.data) return false;
    return String(r.json.data.status || "") === want;
  }, timeoutMs);
}

async function startDaemonAndWait(dataDir, port, extraEnv = {}) {
  startDaemon(dataDir, port, extraEnv);
  await poll(async () => fs.existsSync(pidFile(dataDir)), 15000);
  await waitHealth(port);
}

test.describe(
  "daemon + runtime API E2E",
  { timeout: 280000 },
  () => {
    test("ciclo daemon, fila, cancelamento, multi-project, delay, retry, recurring, locks, API", async () => {
      const dataDir = mkDataDir();
      const projA = fs.mkdtempSync(path.join(os.tmpdir(), "sb-e2e-pa-"));
      const projB = fs.mkdtempSync(path.join(os.tmpdir(), "sb-e2e-pb-"));
      const port = 31050 + Math.floor(Math.random() * 1200);

      await startDaemonAndWait(dataDir, port);

      let h = await httpJson(port, { path: "/health" });
      assert.strictEqual(h.status, 200);

      const st = await httpJson(port, { path: "/status" });
      assert.strictEqual(st.status, 200);
      assert.strictEqual(st.json.ok, true);
      assert.strictEqual(st.json.data.daemonVersion, "3.10");
      assert.ok(st.json.data.runningJobsCount != null || Array.isArray(st.json.data.runningJobs));

      const badLim = await httpJson(port, { path: "/queue?limit=9999" });
      assert.strictEqual(badLim.status, 200);
      assert.strictEqual(badLim.json.data.limit, 100);

      const inj = await httpJson(port, {
        path: "/jobs",
        method: "POST",
        bodyRaw: "{ not-json",
      });
      assert.strictEqual(inj.status, 400);

      const taskRel = "tasks/task-1.md";

      const enqA = await httpJson(port, {
        path: "/jobs",
        method: "POST",
        body: {
          taskPath: taskRel,
          projectPath: projA,
          metadata: { label: "e2e-a" },
        },
      });
      assert.strictEqual(enqA.status, 201, enqA.raw);

      const enqB = await httpJson(port, {
        path: "/jobs",
        method: "POST",
        body: {
          taskPath: taskRel,
          projectPath: projB,
          metadata: { label: "e2e-b" },
        },
      });
      assert.strictEqual(enqB.status, 201);

      const ja = enqA.json.jobId;
      const jb = enqB.json.jobId;

      await waitJobStatus(port, ja, "completed");
      await waitJobStatus(port, jb, "completed");

      const delayJob = await httpJson(port, {
        path: "/jobs",
        method: "POST",
        body: {
          taskPath: taskRel,
          projectPath: projA,
          delayMs: 900,
          metadata: { label: "delayed" },
        },
      });
      assert.strictEqual(delayJob.status, 201);
      const jDelay = delayJob.json.jobId;

      await stopDaemon(dataDir);
      await sleep(800);

      await startDaemonAndWait(dataDir, port);
      try {
        await waitJobStatus(port, jDelay, "completed", 45000);
      } finally {
        await stopDaemon(dataDir);
      }

      const exitFailPort = 30440 + Math.floor(Math.random() * 400);
      const dataFail = mkDataDir();
      await startDaemonAndWait(dataFail, exitFailPort, { SETUP_BOSS_E2E_WORKER_EXIT_CODE: "1" });

      const fj = await httpJson(exitFailPort, {
        path: "/jobs",
        method: "POST",
        body: { taskPath: taskRel, projectPath: projA, metadata: { label: "fail-once" } },
      });
      assert.strictEqual(fj.status, 201);
      const jFail = fj.json.jobId;
      await waitJobStatus(exitFailPort, jFail, "failed");

      const retryR = await httpJson(exitFailPort, {
        path: `/jobs/${encodeURIComponent(jFail)}/retry`,
        method: "POST",
        body: { delayMs: 400 },
      });
      assert.strictEqual(retryR.status, 200, retryR.raw);

      await stopDaemon(dataFail);
      await sleep(400);

      await startDaemonAndWait(dataFail, exitFailPort, {});
      await waitJobStatus(exitFailPort, jFail, "completed", 35000);
      await stopDaemon(dataFail);

      const recPort = 30640 + Math.floor(Math.random() * 400);
      const dataRec = mkDataDir();
      await startDaemonAndWait(dataRec, recPort, {
        SETUP_BOSS_MAX_WORKERS: "1",
        SETUP_BOSS_MAX_WORKERS_PER_PROJECT: "1",
      });

      const recEnq = await httpJson(recPort, {
        path: "/jobs",
        method: "POST",
        body: {
          taskPath: taskRel,
          projectPath: projB,
          recurring: { intervalMs: 1000 },
          metadata: { label: "rec" },
        },
      });
      assert.strictEqual(recEnq.status, 201);
      const jRec = recEnq.json.jobId;

      await waitJobStatus(recPort, jRec, "completed", 30000);

      await poll(async () => {
        const q = await httpJson(recPort, { path: "/queue?limit=50" });
        return q.json && q.json.data && q.json.data.jobs.length >= 2;
      }, 25000);

      await stopDaemon(dataRec);

      const cancelPort = 30840 + Math.floor(Math.random() * 400);
      const dataCancel = mkDataDir();
      await startDaemonAndWait(dataCancel, cancelPort, { SETUP_BOSS_E2E_WORKER_SLEEP_MS: "6000" });

      const cj = await httpJson(cancelPort, {
        path: "/jobs",
        method: "POST",
        body: { taskPath: taskRel, projectPath: projA, metadata: { label: "cancel-me" } },
      });
      assert.strictEqual(cj.status, 201);
      const jCancel = cj.json.jobId;

      await poll(async () => {
        const r = await httpJson(cancelPort, { path: "/status" });
        const jobs = r.json && r.json.data && r.json.data.runningJobs;
        return Array.isArray(jobs) && jobs.some((x) => x && String(x.jobId) === jCancel);
      }, 20000);

      const cancelResp = await httpJson(cancelPort, {
        path: `/jobs/${encodeURIComponent(jCancel)}/cancel`,
        method: "POST",
        body: {},
      });
      assert.ok([200, 409].includes(cancelResp.status), cancelResp.raw);

      await stopDaemon(dataCancel);

      const lockPort = 30940 + Math.floor(Math.random() * 300);
      const dataLock = mkDataDir();
      fs.mkdirSync(path.join(dataLock, "locks"), { recursive: true });
      const bogusLock = path.join(dataLock, "locks", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef.lock");
      fs.writeFileSync(
        bogusLock,
        JSON.stringify({
          projectRoot: projA,
          jobId: "orphan-e2e",
          pid: 999999001,
          createdAt: new Date(0).toISOString(),
          heartbeatAt: new Date(0).toISOString(),
        }),
        "utf8",
      );

      await startDaemonAndWait(dataLock, lockPort);
      await sleep(700);
      assert.ok(!fs.existsSync(bogusLock), "lock stale devia ter sido removido no startup");

      const ev = await httpJson(lockPort, { path: "/events?limit=15" });
      assert.strictEqual(ev.status, 200);
      assert.ok(Array.isArray(ev.json.data));
      assert.ok(ev.json.data.length >= 1);

      await stopDaemon(dataLock);

      const cli = path.join(REPO_ROOT, "scripts", "cli", "index.js");
      const docDir = mkDataDir();
      const { spawnSync } = require("child_process");
      const dr = spawnSync(process.execPath, [cli, "doctor", "--json", "--fix-safe", "--runs-limit=0"], {
        encoding: "utf8",
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          SETUP_BOSS_CLI_ROOT: REPO_ROOT,
          SETUP_BOSS_DATA_DIR: docDir,
          DOTENV_CONFIG_QUIET: "true",
        },
      });
      const jsonBeg = dr.stdout.indexOf("{");
      assert.ok(jsonBeg >= 0, `doctor stdout sem JSON: ${dr.stdout.slice(0, 500)}`);
      const rep = JSON.parse(dr.stdout.slice(jsonBeg));
      assert.ok(rep.checks.doctor_safe_fixes_applied);
      assert.strictEqual(
        typeof rep.checks.doctor_safe_fixes_applied.staleLocksCleared,
        "number",
      );
    });
  },
);
