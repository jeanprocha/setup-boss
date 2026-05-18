import assert from "node:assert";
import { describe, it } from "node:test";
import type { RuntimeHeartbeatDto } from "@/lib/api/runtime-types";
import { deriveRuntimeOperationalContext } from "./derive-runtime-operational-context";

function hb(partial: Partial<RuntimeHeartbeatDto>): RuntimeHeartbeatDto {
  return {
    daemonAlive: true,
    runningJobsCount: 0,
    currentJobId: null,
    currentRunId: null,
    lastRuntimeActivityAt: null,
    workerState: "idle",
    queueSize: 0,
    daemonStartedAt: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("derive-runtime-operational-context", () => {
  it("daemon offline", () => {
    const ctx = deriveRuntimeOperationalContext({
      heartbeat: hb({ daemonAlive: false }),
      runKey: "run-1",
      uiActivelyProcessing: true,
    });
    assert.equal(ctx.runtimeHealth, "offline");
  });

  it("worker idle sem job", () => {
    const ctx = deriveRuntimeOperationalContext({
      heartbeat: hb({ workerState: "idle", runningJobsCount: 0 }),
      runKey: "run-1",
      uiActivelyProcessing: true,
    });
    assert.equal(ctx.workerIdleNoJob, true);
    assert.equal(ctx.isRunActivelyProcessing, false);
  });

  it("worker busy com currentRunId igual", () => {
    const ctx = deriveRuntimeOperationalContext({
      heartbeat: hb({
        workerState: "busy",
        runningJobsCount: 1,
        currentJobId: "job-1",
        currentRunId: "run-1",
      }),
      runKey: "run-1",
      uiActivelyProcessing: true,
    });
    assert.equal(ctx.isRunActivelyProcessing, true);
    assert.equal(ctx.workerState, "busy");
  });

  it("currentRunId diferente não é activo para o run", () => {
    const ctx = deriveRuntimeOperationalContext({
      heartbeat: hb({
        workerState: "busy",
        runningJobsCount: 1,
        currentRunId: "run-other",
      }),
      runKey: "run-1",
      uiActivelyProcessing: true,
    });
    assert.equal(ctx.isRunActivelyProcessing, false);
  });

  it("fallback sem heartbeat mantém uiActivelyProcessing", () => {
    const ctx = deriveRuntimeOperationalContext({
      heartbeat: null,
      runKey: "run-1",
      uiActivelyProcessing: true,
    });
    assert.equal(ctx.runtimeHealth, "unknown");
    assert.equal(ctx.isRunActivelyProcessing, true);
  });
});
