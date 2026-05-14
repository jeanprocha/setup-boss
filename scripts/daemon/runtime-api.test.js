"use strict";

const test = require("node:test");

const assert = require("node:assert");

const fs = require("fs");

const path = require("path");

const os = require("os");

const http = require("http");

const {
  createRuntimeApiServer,

  closeServerAsync,

  RUNTIME_API_HOST,

  _test,
} = require("./runtime-api");

const {
  loadQueueUnsafe,

  updateJob,

  enqueueJob,

  parseIsoMs,

} = require("./lib/queue-store");

function tmpRepoRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-api-"));

  fs.mkdirSync(path.join(dir, ".setup-boss", "daemon"), { recursive: true });

  fs.writeFileSync(path.join(dir, "task.md"), "# t\n", "utf-8");

  return dir;

}

async function httpJson(port, opts) {
  const bodyStr =
    opts.body && typeof opts.body === "object"
      ? JSON.stringify(opts.body)
      : opts.bodyRaw || "";

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: RUNTIME_API_HOST,

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

test("_test.normalizeFlowOptions extrai flags suportadas", () => {
  const o = _test.normalizeFlowOptions({
    dryRun: true,

    forceScan: true,

    skipPreflightConfirm: true,

    policyProfile: "FAST",

    forcePolicyBypass: true,

    disableGovernance: true,

    extra: "ignored",

  });

  assert.strictEqual(o.dryRun, true);

  assert.strictEqual(o.forceScan, true);

  assert.strictEqual(o.policyProfile, "FAST");

  assert.strictEqual("extra" in o, false);

});

test("HTTP: POST /jobs delayMs + GET /queue delayed", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = tmpRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const snap = {
      busy: false,

      currentJobId: null,

      lastError: null,

      pid: 1,

      startedAt: new Date().toISOString(),

      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,

      repoRoot: repo,

    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, RUNTIME_API_HOST, resolve);

    });

    const addr = /** @type {import("net").AddressInfo} */ (server.address());

    const port = addr.port;

    const clash = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: {
        taskPath: "task.md",

        projectPath: ".",

        delayMs: 1000,

        scheduledAt: "2026-01-01T00:00:00.000Z",

      },

    });

    assert.strictEqual(clash.status, 400);

    const created = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: {

        taskPath: "task.md",

        projectPath: ".",

        delayMs: 999999,

      },

    });

    assert.strictEqual(created.status, 201);

    const j0 = loadQueueUnsafe().jobs[0];

    assert.ok(j0 && j0.availableAt);

    assert.ok(parseIsoMs(String(j0.availableAt)) > Date.now());

    const ql = await httpJson(port, {
      path: "/queue?delayed=1&limit=10",

      method: "GET",

    });

    assert.strictEqual(ql.status, 200);

    assert.ok(ql.json && ql.json.data && Array.isArray(ql.json.data.jobs));

    assert.ok(ql.json.data.jobs.length >= 1);

    await closeServerAsync(server);

  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });

  }

});

test("HTTP: health + status + enqueue + get job + cancel pending", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = tmpRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const snap = {
      busy: false,

      currentJobId: null,

      lastError: null,

      pid: 424242,

      startedAt: new Date().toISOString(),

      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,

      repoRoot: repo,

    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, RUNTIME_API_HOST, resolve);

    });

    const addr = /** @type {import("net").AddressInfo} */ (server.address());

    const port = addr.port;

    const h = await httpJson(port, { path: "/health", method: "GET" });

    assert.strictEqual(h.status, 200);

    assert.strictEqual(h.json.ok, true);

    assert.strictEqual(h.json.daemon, "running");

    assert.strictEqual(h.json.pid, 424242);

    assert.ok(Number.isFinite(h.json.uptimeMs));

    const st = await httpJson(port, { path: "/status", method: "GET" });

    assert.strictEqual(st.status, 200);

    assert.strictEqual(st.json.ok, true);

    assert.strictEqual(st.json.data.worker.busy, false);

    assert.strictEqual(st.json.data.queue.pending, 0);

    const bad = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: { taskPath: "nope.md", projectPath: "." },

    });

    assert.strictEqual(bad.status, 400);

    assert.strictEqual(bad.json.ok, false);

    const created = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: {
        taskPath: "task.md",

        projectPath: ".",

        flowOptions: { dryRun: true },

      },

    });

    assert.strictEqual(created.status, 201);

    assert.strictEqual(created.json.ok, true);

    assert.ok(typeof created.json.jobId === "string");

    const q = loadQueueUnsafe();

    assert.strictEqual(q.jobs.length, 1);

    assert.strictEqual(q.jobs[0].id, created.json.jobId);

    const one = await httpJson(port, {
      path: `/jobs/${created.json.jobId}`,

      method: "GET",

    });

    assert.strictEqual(one.status, 200);

    assert.strictEqual(one.json.ok, true);

    assert.strictEqual(one.json.data.status, "pending");

    const cx = await httpJson(port, {
      path: `/jobs/${created.json.jobId}/cancel`,

      method: "POST",

    });

    assert.strictEqual(cx.status, 200);

    assert.strictEqual(cx.json.ok, true);

    assert.strictEqual(cx.json.data.outcome, "cancelled");

    assert.strictEqual(cx.json.data.status, "cancelled");

    await closeServerAsync(server);

  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });

  }

});

test("HTTP: cancel running solicita cooperação (cancellation_requested)", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = tmpRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const job = enqueueJob({
      projectRoot: repo,

      taskArg: "task.md",

      projectArg: ".",

      metadata: {},

      flowOptions: {},
    });

    const queue = loadQueueUnsafe();

    updateJob(queue, job.id, (j) => ({
      ...j,

      status: "running",

      startedAt: new Date().toISOString(),
    }));

    const snap = {
      busy: true,

      currentJobId: job.id,

      workerChildPid: 999,

      lastError: null,

      pid: 1,

      startedAt: new Date().toISOString(),

      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,

      repoRoot: repo,

      requestRunningTerminate: () => ({ ok: true }),

    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, RUNTIME_API_HOST, resolve);

    });

    const addr = /** @type {import("net").AddressInfo} */ (server.address());

    const res = await httpJson(addr.port, {
      path: `/jobs/${job.id}/cancel`,

      method: "POST",

    });

    assert.strictEqual(res.status, 200);

    assert.strictEqual(res.json.ok, true);

    assert.strictEqual(res.json.data.outcome, "cancellation_requested");

    assert.strictEqual(res.json.data.status, "cancelling");

    await closeServerAsync(server);

  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });

  }

});

test("HTTP: retry cancelado → pending", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = tmpRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const snap = {
      busy: false,

      currentJobId: null,

      lastError: null,

      pid: 1,

      startedAt: new Date().toISOString(),

      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,

      repoRoot: repo,

    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, RUNTIME_API_HOST, resolve);

    });

    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const enq = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: { taskPath: "task.md", projectPath: "." },
    });

    assert.strictEqual(enq.status, 201);

    const jid = enq.json.jobId;

    const cx = await httpJson(port, { path: `/jobs/${jid}/cancel`, method: "POST" });

    assert.strictEqual(cx.status, 200);

    const rt = await httpJson(port, { path: `/jobs/${jid}/retry`, method: "POST" });

    assert.strictEqual(rt.status, 200);

    assert.strictEqual(rt.json.ok, true);

    assert.strictEqual(rt.json.data.status, "pending");

    const st = await httpJson(port, { path: "/status", method: "GET" });

    assert.strictEqual(st.status, 200);

    assert.ok(typeof st.json.data.queue.retryable === "number");

    await closeServerAsync(server);

  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });

  }

});

test("HTTP GET /events", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-evapi-"));
  fs.mkdirSync(path.join(repo, ".setup-boss", "daemon"), { recursive: true });
  fs.writeFileSync(path.join(repo, "task.md"), "# t\n", "utf-8");

  try {
    process.env.SETUP_BOSS_CLI_ROOT = repo;
    const snap = {
      busy: false,
      currentJobId: null,
      lastError: null,
      pid: 1,
      startedAt: new Date().toISOString(),
      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,
      repoRoot: repo,
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });

    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const enq = await httpJson(port, {
      path: "/jobs",
      method: "POST",
      body: { taskPath: "task.md", projectPath: "." },
    });

    assert.strictEqual(enq.status, 201);
    const jid = enq.json.jobId;

    const ev = await httpJson(port, { path: "/events", method: "GET" });

    assert.strictEqual(ev.status, 200);
    assert.strictEqual(ev.json.ok, true);
    assert.ok(Array.isArray(ev.json.data) && ev.json.data.length >= 1);

    const ev2 = await httpJson(port, {
      path: `/events?jobId=${encodeURIComponent(jid)}&limit=10`,
      method: "GET",
    });

    assert.strictEqual(ev2.status, 200);
    assert.ok(ev2.json.data.some((/** @type {any} */ e) => e.type === "job_enqueued"));

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("HTTP: /projects, /projects/:id, filtros queue/events, status.projects, job legado", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;

  const repo = tmpRepoRoot();

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  try {
    const snap = {
      busy: false,

      currentJobId: null,

      lastError: null,

      pid: 1,

      startedAt: new Date().toISOString(),

      running: true,
    };

    const { server } = createRuntimeApiServer({
      getDaemonSnapshot: () => snap,

      repoRoot: repo,
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(0, RUNTIME_API_HOST, resolve);
    });

    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const { deriveProjectId } = require("./lib/project-registry");

    const enq = await httpJson(port, {
      path: "/jobs",

      method: "POST",

      body: { taskPath: "task.md", projectPath: "." },
    });

    assert.strictEqual(enq.status, 201);

    const expectPid = deriveProjectId(path.resolve(repo));

    const plist = await httpJson(port, { path: "/projects", method: "GET" });

    assert.strictEqual(plist.status, 200);

    assert.ok(Array.isArray(plist.json.data));

    assert.ok(plist.json.data.some((/** @type {any} */ x) => x.projectId === expectPid));

    const det = await httpJson(port, {
      path: `/projects/${encodeURIComponent(expectPid)}`,

      method: "GET",
    });

    assert.strictEqual(det.status, 200);

    assert.strictEqual(det.json.data.projectId, expectPid);

    const qf = await httpJson(port, {
      path: `/queue?projectId=${encodeURIComponent(expectPid)}`,

      method: "GET",
    });

    assert.strictEqual(qf.status, 200);

    assert.ok(qf.json.data.jobs.length >= 1);

    const evf = await httpJson(port, {
      path: `/events?projectId=${encodeURIComponent(expectPid)}&limit=80`,

      method: "GET",
    });

    assert.strictEqual(evf.status, 200);

    assert.ok(evf.json.data.length >= 1);

    const st = await httpJson(port, { path: "/status", method: "GET" });

    assert.strictEqual(st.status, 200);

    assert.ok(st.json.data.projects);

    assert.strictEqual(typeof st.json.data.projects.total, "number");

    const { loadQueueUnsafe, saveQueue } = require("./lib/queue-store");

    const q = loadQueueUnsafe();

    assert.ok(q.jobs[0]);

    const legacy = { ...q.jobs[0] };

    delete legacy.projectId;

    q.jobs[0] = legacy;

    saveQueue(q);

    const q2 = loadQueueUnsafe();

    assert.ok(q2.jobs[0].projectId);

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    fs.rmSync(repo, { recursive: true, force: true });
  }
});
