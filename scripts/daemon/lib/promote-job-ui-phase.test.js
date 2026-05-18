"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, beforeEach, afterEach } = require("node:test");

const DATA_DIR = path.join(os.tmpdir(), `promote-ui-phase-${process.pid}`);
const QUEUE_PATH = path.join(DATA_DIR, "daemon", "queue.json");

function writeQueue(jobs) {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  fs.writeFileSync(
    QUEUE_PATH,
    JSON.stringify({ schemaVersion: 1, jobs }, null, 2),
    "utf8",
  );
}

describe("promoteJobUiPhaseForRun", () => {
  const prevDataDir = process.env.SETUP_BOSS_DATA_DIR;

  beforeEach(() => {
    process.env.SETUP_BOSS_DATA_DIR = DATA_DIR;
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevDataDir;
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  });

  it("promove clarify → strategy → execution sem regredir", () => {
    writeQueue([
      {
        id: "job_intake_1",
        status: "completed",
        projectRoot: "/tmp/p",
        taskArg: "task.md",
        projectArg: ".",
        createdAt: "2026-05-17T10:00:00.000Z",
        startedAt: null,
        finishedAt: "2026-05-17T10:00:01.000Z",
        attempts: 0,
        maxAttempts: 3,
        runId: "run-promote-test",
        metadata: { uiPhase: "clarify", uiState: "waiting_clarification_answers" },
      },
    ]);

    delete require.cache[require.resolve("./queue-store")];
    delete require.cache[require.resolve("./promote-job-ui-phase")];
    const { promoteJobUiPhaseForRun } = require("./promote-job-ui-phase");
    const { loadQueueUnsafe } = require("./queue-store");

    const r1 = promoteJobUiPhaseForRun("run-promote-test", "strategy", {
      uiState: "ready_for_execution",
    });
    assert.equal(r1.promoted, true);
    assert.equal(r1.to, "strategy");

    let q = loadQueueUnsafe();
    assert.equal(q.jobs[0].metadata.uiPhase, "strategy");

    const r2 = promoteJobUiPhaseForRun("run-promote-test", "execution");
    assert.equal(r2.promoted, true);

    q = loadQueueUnsafe();
    assert.equal(q.jobs[0].metadata.uiPhase, "execution");

    const r3 = promoteJobUiPhaseForRun("run-promote-test", "strategy");
    assert.equal(r3.skipped, true);
    assert.equal(r3.reason, "already_at_or_beyond");

    q = loadQueueUnsafe();
    assert.equal(q.jobs[0].metadata.uiPhase, "execution");
  });
});
