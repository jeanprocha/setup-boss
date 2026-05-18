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

    const hb = await httpJson(port, { path: "/runtime/heartbeat", method: "GET" });

    assert.strictEqual(hb.status, 200);

    assert.strictEqual(hb.json.ok, true);

    assert.strictEqual(hb.json.data.daemonAlive, true);

    assert.strictEqual(hb.json.data.workerState, "idle");

    assert.strictEqual(hb.json.data.runningJobsCount, 0);

    assert.strictEqual(hb.json.data.currentJobId, null);

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

test("HTTP: POST /projects/register + POST /projects/git/register validação", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevManaged = process.env.SETUP_BOSS_PROJECTS_DIR;

  const extraDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-reg-"));

  const repo = tmpRepoRoot();

  const localProj = path.join(extraDir, "my-local-proj");

  fs.mkdirSync(localProj, { recursive: true });

  process.env.SETUP_BOSS_CLI_ROOT = repo;

  process.env.SETUP_BOSS_PROJECTS_DIR = extraDir;

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

    const regOk = await httpJson(port, {
      path: "/projects/register",

      method: "POST",

      body: { projectRoot: localProj },
    });

    assert.strictEqual(regOk.status, 200);

    assert.strictEqual(regOk.json.ok, true);

    assert.ok(regOk.json.data.projectId);

    const regBad = await httpJson(port, {
      path: "/projects/git/register",

      method: "POST",

      body: { repo_url: "https://evil.com/x/y.git" },
    });

    assert.strictEqual(regBad.status, 400);

    assert.strictEqual(regBad.json.ok, false);

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;

    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;

    if (prevManaged == null) delete process.env.SETUP_BOSS_PROJECTS_DIR;

    else process.env.SETUP_BOSS_PROJECTS_DIR = prevManaged;

    fs.rmSync(repo, { recursive: true, force: true });

    fs.rmSync(extraDir, { recursive: true, force: true });
  }
});

test("HTTP: GET /projects dedup registry + fila sem demo + explain", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevDemo = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pl-http-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const wiser = path.join(repo, "wiser-bot-api");
  const demoP = path.join(repo, "demo-project");
  const ghost = path.join(repo, "ghost-missing");
  fs.mkdirSync(wiser, { recursive: true });
  fs.mkdirSync(demoP, { recursive: true });

  fs.writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify({
      schemaVersion: 1,
      projects: [
        {
          projectId: "legacy-a",
          projectRoot: wiser,
          displayName: "wiser-bot-api",
          firstSeenAt: "2020-01-01T00:00:00.000Z",
          lastSeenAt: "2025-01-01T00:00:00.000Z",
          lastJobId: null,
          jobCounts: {},
          metadata: {},
        },
        {
          projectId: "legacy-b",
          projectRoot: path.join(wiser, "..", "wiser-bot-api"),
          displayName: "wiser-alias",
          firstSeenAt: "2010-01-01T00:00:00.000Z",
          lastSeenAt: "2015-01-01T00:00:00.000Z",
          lastJobId: null,
          jobCounts: {},
          metadata: {},
        },
      ],
    }),
    "utf-8",
  );

  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

  const { deriveProjectId } = require("./lib/project-registry");
  const { loadQueueUnsafe, saveQueue } = require("./lib/queue-store");

  const nowIso = new Date().toISOString();
  const mkJob = (id, root) => ({
    id,
    status: "completed",
    projectRoot: root,
    projectId: deriveProjectId(root),
    taskArg: "task.md",
    projectArg: ".",
    createdAt: nowIso,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    maxAttempts: 3,
    runId: null,
    error: null,
    lastAttemptAt: null,
    retryable: false,
    heartbeatAt: null,
    lastProgressAt: null,
    workerChildPid: null,
    stuckSuspected: false,
    scheduledAt: null,
    availableAt: nowIso,
    delayMs: null,
    recurring: null,
    availabilityNotifiedAt: nowIso,
    metadata: {},
    flowOptions: {},
    events: [],
  });

  const q0 = loadQueueUnsafe();
  q0.jobs = [mkJob("j-demo", demoP), mkJob("j-ghost", ghost), mkJob("j-wiser", wiser)];
  saveQueue(q0);

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

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });

    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const plist = await httpJson(port, { path: "/projects", method: "GET" });
    assert.strictEqual(plist.status, 200);
    assert.ok(Array.isArray(plist.json.data));
    assert.strictEqual(plist.json.data.length, 1);
    assert.strictEqual(plist.json.data[0].displayName, "wiser-alias");
    assert.ok(
      !plist.json.data.some(
        (/** @type {any} */ x) =>
          String(x.displayName || "").toLowerCase() === "demo-project",
      ),
    );

    const px = await httpJson(port, { path: "/projects?explain=1", method: "GET" });
    assert.strictEqual(px.status, 200);
    assert.ok(px.json.explain);
    assert.strictEqual(typeof px.json.explain.finalCount, "number");

    process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = "1";
    const pd = await httpJson(port, { path: "/projects", method: "GET" });
    assert.strictEqual(pd.status, 200);
    assert.ok(pd.json.data.length >= 2);
    assert.ok(
      pd.json.data.some(
        (/** @type {any} */ x) =>
          String(x.displayName || "").toLowerCase() === "demo-project",
      ),
    );

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevDemo == null) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prevDemo;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("HTTP: POST /runs/:id/strategy run inexistente → 404", async () => {
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
    const r = await httpJson(port, {
      path: "/runs/nao-existe-runid-zzzz/strategy",
      method: "POST",
      body: {},
    });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.json.ok, false);
    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("HTTP: GET /projects/:id/governance — derivado e inexistente", async () => {
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  const prevDemo = process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
  delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-http-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const projectRoot = path.join(repo, "gov-http-project");
  fs.mkdirSync(projectRoot, { recursive: true });

  const { deriveProjectId } = require("./lib/project-registry");
  const derivedId = deriveProjectId(projectRoot);

  fs.writeFileSync(
    path.join(dataDir, "projects.json"),
    JSON.stringify({
      schemaVersion: 1,
      projects: [
        {
          projectId: "proj_legacy_gov_http",
          projectRoot,
          displayName: "gov-http-project",
          firstSeenAt: "2020-01-01T00:00:00.000Z",
          lastSeenAt: "2025-01-01T00:00:00.000Z",
          lastJobId: null,
          jobCounts: {},
          metadata: {},
        },
      ],
    }),
    "utf-8",
  );

  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

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

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });

    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const okGov = await httpJson(port, {
      path: `/projects/${encodeURIComponent(derivedId)}/governance`,
      method: "GET",
    });
    assert.strictEqual(
      okGov.status,
      200,
      `governance derivado deve 200, got ${okGov.status} ${okGov.raw}`,
    );
    assert.strictEqual(okGov.json.ok, true);
    assert.ok(okGov.json.data);

    const missing = await httpJson(port, {
      path: "/projects/proj_missing_gov_xyz/governance",
      method: "GET",
    });
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(missing.json.ok, false);
    assert.strictEqual(missing.json.error.code, "PROJECT_NOT_FOUND");
    assert.ok(Array.isArray(missing.json.error.suggestedActions));

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    if (prevDemo == null) delete process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS;
    else process.env.SETUP_BOSS_ENABLE_DEMO_PROJECTS = prevDemo;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("HTTP: CRUD /workspaces", async () => {
  const repo = tmpRepoRoot();
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const projDir = path.join(repo, "my-proj");
  fs.mkdirSync(projDir, { recursive: true });

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

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

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });
    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const regOk = await httpJson(port, {
      path: "/projects/register",
      method: "POST",
      body: { projectRoot: projDir },
    });
    assert.strictEqual(regOk.status, 200);
    const projectId = regOk.json.data.projectId;

    const bad = await httpJson(port, {
      path: "/workspaces",
      method: "POST",
      body: { name: "X", projectIds: ["proj_missing"] },
    });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.json.ok, false);

    const created = await httpJson(port, {
      path: "/workspaces",
      method: "POST",
      body: {
        name: "Stack",
        projectIds: [projectId],
        primaryProjectId: projectId,
      },
    });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.json.ok, true);
    const wsId = created.json.data.workspaceId;

    const list = await httpJson(port, { path: "/workspaces", method: "GET" });
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.json.data.length, 1);

    const detail = await httpJson(port, {
      path: `/workspaces/${encodeURIComponent(wsId)}`,
      method: "GET",
    });
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.json.data.name, "Stack");

    const patched = await httpJson(port, {
      path: `/workspaces/${encodeURIComponent(wsId)}`,
      method: "PATCH",
      body: { name: "Stack+" },
    });
    assert.strictEqual(patched.status, 200);
    assert.strictEqual(patched.json.data.name, "Stack+");

    const removed = await httpJson(port, {
      path: `/workspaces/${encodeURIComponent(wsId)}`,
      method: "DELETE",
    });
    assert.strictEqual(removed.status, 200);
    assert.strictEqual(removed.json.data.removed, true);

    const missing = await httpJson(port, {
      path: `/workspaces/${encodeURIComponent(wsId)}`,
      method: "GET",
    });
    assert.strictEqual(missing.status, 404);

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("HTTP: CRUD /workspace-runs", async () => {
  const repo = tmpRepoRoot();
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const projDir = path.join(repo, "my-proj-wsr");
  fs.mkdirSync(projDir, { recursive: true });

  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;

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

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, RUNTIME_API_HOST, resolve);
    });
    const port = /** @type {import("net").AddressInfo} */ (server.address()).port;

    const regOk = await httpJson(port, {
      path: "/projects/register",
      method: "POST",
      body: { projectRoot: projDir },
    });
    const projectId = regOk.json.data.projectId;

    const wsOk = await httpJson(port, {
      path: "/workspaces",
      method: "POST",
      body: { name: "Stack", projectIds: [projectId] },
    });
    const workspaceId = wsOk.json.data.workspaceId;

    const badWs = await httpJson(port, {
      path: "/workspace-runs",
      method: "POST",
      body: { workspaceId: "ws_missing", title: "T" },
    });
    assert.strictEqual(badWs.status, 400);

    const badStatus = await httpJson(port, {
      path: "/workspace-runs",
      method: "POST",
      body: { workspaceId, title: "T", status: "nope" },
    });
    assert.strictEqual(badStatus.status, 400);

    const created = await httpJson(port, {
      path: "/workspace-runs",
      method: "POST",
      body: { workspaceId, title: "Atividade global E2E" },
    });
    assert.strictEqual(created.status, 201);

    const createdWithPartialMinis = await httpJson(port, {
      path: "/workspace-runs",
      method: "POST",
      body: {
        workspaceId,
        instruction: "Criar tela de export PDF",
        globalSpec: { schemaVersion: 1, task: "Criar tela de export PDF", projectIds: [projectId] },
        miniActivities: [
          { order: 0, title: "Front", targetProjectId: projectId, status: "pending" },
        ],
      },
    });
    assert.strictEqual(createdWithPartialMinis.status, 201);
    assert.strictEqual(createdWithPartialMinis.json.data.miniActivities.length, 0);
    const partialRunId = createdWithPartialMinis.json.data.workspaceRunId;
    const runId = created.json.data.workspaceRunId;
    assert.ok(Array.isArray(created.json.data.miniActivities));
    assert.ok(Array.isArray(created.json.data.childRunIds));

    const list = await httpJson(port, { path: "/workspace-runs", method: "GET" });
    assert.strictEqual(list.json.data.length, 2);

    const filtered = await httpJson(port, {
      path: `/workspace-runs?workspaceId=${encodeURIComponent(workspaceId)}`,
      method: "GET",
    });
    assert.strictEqual(filtered.json.data.length, 2);

    const detail = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}`,
      method: "GET",
    });
    assert.strictEqual(detail.status, 200);

    const patched = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}`,
      method: "PATCH",
      body: { status: "planned" },
    });
    assert.strictEqual(patched.json.data.status, "planned");

    const maAdd = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/mini-activities`,
      method: "POST",
      body: {
        order: 0,
        title: "API",
        targetProjectId: projectId,
      },
    });
    assert.strictEqual(maAdd.status, 201);
    const maId = maAdd.json.data.miniActivities[0].miniActivityId;

    const maBad = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/mini-activities`,
      method: "POST",
      body: { order: 1, title: "X", targetProjectId: "proj_nope" },
    });
    assert.strictEqual(maBad.status, 400);

    const maPatch = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/mini-activities/${encodeURIComponent(maId)}`,
      method: "PATCH",
      body: { status: "ready" },
    });
    assert.strictEqual(maPatch.status, 200);

    const maDel = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}/mini-activities/${encodeURIComponent(maId)}`,
      method: "DELETE",
    });
    assert.strictEqual(maDel.status, 200);
    assert.strictEqual(maDel.json.data.miniActivities.length, 0);

    const removed = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(runId)}`,
      method: "DELETE",
    });
    assert.strictEqual(removed.json.data.removed, true);

    const removedPartial = await httpJson(port, {
      path: `/workspace-runs/${encodeURIComponent(partialRunId)}`,
      method: "DELETE",
    });
    assert.strictEqual(removedPartial.json.data.removed, true);

    await closeServerAsync(server);
  } finally {
    if (prevRoot == null) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData == null) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
