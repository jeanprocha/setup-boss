"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

function mkRepoTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "setup-boss-events-"));
  fs.mkdirSync(path.join(dir, ".setup-boss", "daemon"), { recursive: true });
  return dir;
}

test("_test.parseJsonl ignora linhas invalidas", () => {
  const { parseJsonl } = require("./runtime-events")._test;
  const out = parseJsonl(
    '{"id":"evt_1","type":"worker_idle","timestamp":"t","data":{}}\nnot-json\n',
  );
  assert.strictEqual(out.length, 1);
});

test("emit + read filtros jobId e after", () => {
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  const repo = mkRepoTmp();
  try {
    process.env.SETUP_BOSS_CLI_ROOT = repo;
    const { emitRuntimeEvent, readRuntimeEventsFiltered } = require("./runtime-events");
    emitRuntimeEvent({ type: "job_started", jobId: "job_a", runId: "run_1", data: {} });
    emitRuntimeEvent({
      type: "phase_started",
      jobId: "job_a",
      runId: "run_1",
      data: { phase: "preflight" },
    });
    emitRuntimeEvent({ type: "job_started", jobId: "job_b", data: {} });

    const allA = readRuntimeEventsFiltered({ jobId: "job_a", limit: 50 });
    assert.strictEqual(allA.length, 2);
    assert.strictEqual(allA[0].type, "job_started");

    const page = readRuntimeEventsFiltered({ jobId: "job_a", after: allA[0].id, limit: 10 });
    assert.strictEqual(page.length, 1);
    assert.strictEqual(page[0].type, "phase_started");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("readRuntimeEventsFiltered filtra por projectId", () => {
  const prev = process.env.SETUP_BOSS_CLI_ROOT;
  const repo = mkRepoTmp();
  try {
    process.env.SETUP_BOSS_CLI_ROOT = repo;
    const { emitRuntimeEvent, readRuntimeEventsFiltered } = require("./runtime-events");
    emitRuntimeEvent({
      type: "job_enqueued",
      jobId: "j1",
      projectId: "proj_aa",
      projectRoot: "/x",
      data: {},
    });
    emitRuntimeEvent({
      type: "job_started",
      jobId: "j2",
      projectId: "proj_bb",
      projectRoot: "/y",
      data: {},
    });
    const onlyA = readRuntimeEventsFiltered({ projectId: "proj_aa", limit: 50 });
    assert.strictEqual(onlyA.length, 1);
    assert.strictEqual(onlyA[0].jobId, "j1");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prev;
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
