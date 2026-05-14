"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  createWorkerPool,
  buildFairnessPendingOrder,
  projectBusyCount,
  markSlotBusy,
  markSlotIdle,
  busyCount,
  firstBusyJobId,
  parseWorkerPoolConfig,
} = require("./worker-pool");

test("parseWorkerPoolConfig: defaults mínimos 1", () => {
  const prevM = process.env.SETUP_BOSS_MAX_WORKERS;
  const prevP = process.env.SETUP_BOSS_MAX_WORKERS_PER_PROJECT;
  try {
    delete process.env.SETUP_BOSS_MAX_WORKERS;
    delete process.env.SETUP_BOSS_MAX_WORKERS_PER_PROJECT;
    const c = parseWorkerPoolConfig();
    assert.strictEqual(c.maxWorkers, 1);
    assert.strictEqual(c.maxWorkersPerProject, 1);
  } finally {
    if (prevM === undefined) delete process.env.SETUP_BOSS_MAX_WORKERS;
    else process.env.SETUP_BOSS_MAX_WORKERS = prevM;
    if (prevP === undefined) delete process.env.SETUP_BOSS_MAX_WORKERS_PER_PROJECT;
    else process.env.SETUP_BOSS_MAX_WORKERS_PER_PROJECT = prevP;
  }
});

test("buildFairnessPendingOrder: round-robin entre projectos (heads)", () => {
  const pending = [
    {
      id: "a1",
      projectId: "proj_aaa",
      projectRoot: "/p/a",
      createdAt: "2026-01-01T10:00:00.000Z",
      status: "pending",
    },
    {
      id: "a2",
      projectId: "proj_aaa",
      projectRoot: "/p/a",
      createdAt: "2026-01-01T11:00:00.000Z",
      status: "pending",
    },
    {
      id: "b1",
      projectId: "proj_bbb",
      projectRoot: "/p/b",
      createdAt: "2026-01-01T10:30:00.000Z",
      status: "pending",
    },
  ];
  const o0 = buildFairnessPendingOrder(pending, 0);
  assert.strictEqual(o0.length, 2);
  assert.strictEqual(o0[0].id, "a1");
  assert.strictEqual(o0[1].id, "b1");

  const o1 = buildFairnessPendingOrder(pending, 1);
  assert.strictEqual(o1[0].id, "b1");
  assert.strictEqual(o1[1].id, "a1");

});

test("pool: concorrência por projeto e libertação de slot", () => {
  const pool = createWorkerPool({
    maxWorkers: 4,
    maxWorkersPerProject: 1,
  });

  assert.strictEqual(busyCount(pool), 0);

  const j1 = {
    id: "job1",
    projectId: "proj_x",
    projectRoot: "/x",
  };

  markSlotBusy(pool, 0, j1);

  assert.strictEqual(projectBusyCount(pool, "proj_x"), 1);

  assert.strictEqual(busyCount(pool), 1);

  assert.strictEqual(firstBusyJobId(pool), "job1");

  markSlotIdle(pool, 0);

  assert.strictEqual(projectBusyCount(pool, "proj_x"), 0);

  assert.strictEqual(busyCount(pool), 0);

});
