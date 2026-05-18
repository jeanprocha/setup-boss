const assert = require("node:assert");
const { describe, it } = require("node:test");
const {
  buildRuntimeHeartbeat,
  resolveRunIdForJobId,
} = require("./runtime-heartbeat");

describe("runtime-heartbeat", () => {
  it("resolveRunIdForJobId via metadata", () => {
    const q = {
      jobs: [
        {
          id: "job-1",
          runId: null,
          metadata: { executionRunId: "run-abc" },
        },
      ],
    };
    assert.strictEqual(resolveRunIdForJobId("job-1", q), "run-abc");
  });

  it("worker idle sem job", () => {
    const hb = buildRuntimeHeartbeat({
      snap: { running: true, busy: false, currentJobId: null, startedAt: "2026-05-16T10:00:00.000Z" },
      diskStatus: {
        worker: { busy: false, currentJobId: null, lastPipelineEventAt: null },
        runningJobsCount: 0,
        updatedAt: "2026-05-16T10:05:00.000Z",
      },
      queue: { jobs: [] },
    });
    assert.strictEqual(hb.daemonAlive, true);
    assert.strictEqual(hb.workerState, "idle");
    assert.strictEqual(hb.runningJobsCount, 0);
    assert.strictEqual(hb.currentJobId, null);
    assert.strictEqual(hb.currentRunId, null);
  });

  it("worker busy com currentRunId", () => {
    const hb = buildRuntimeHeartbeat({
      snap: {
        running: true,
        busy: true,
        currentJobId: "job-9",
        startedAt: "2026-05-16T10:00:00.000Z",
      },
      diskStatus: {
        worker: {
          busy: true,
          currentJobId: "job-9",
          lastPipelineEventAt: "2026-05-16T10:07:00.000Z",
        },
        runningJobsCount: 1,
        updatedAt: "2026-05-16T10:06:00.000Z",
      },
      queue: {
        jobs: [
          {
            id: "job-9",
            status: "running",
            runId: "run-xyz",
            heartbeatAt: "2026-05-16T10:08:00.000Z",
          },
        ],
      },
    });
    assert.strictEqual(hb.workerState, "busy");
    assert.strictEqual(hb.currentJobId, "job-9");
    assert.strictEqual(hb.currentRunId, "run-xyz");
    assert.strictEqual(hb.runningJobsCount, 1);
    assert.ok(hb.lastRuntimeActivityAt);
  });

  it("daemon parado", () => {
    const hb = buildRuntimeHeartbeat({
      snap: { running: false, busy: false },
      diskStatus: null,
      queue: { jobs: [] },
    });
    assert.strictEqual(hb.daemonAlive, false);
    assert.strictEqual(hb.workerState, "idle");
  });
});
