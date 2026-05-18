import assert from "node:assert";
import { describe, it } from "node:test";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import {
  STALL_CRITICAL_MS,
  STALL_STALLED_MS,
  STALL_WARNING_MS,
  computeLastMeaningfulEventAt,
  deriveRuntimeStallVisual,
  isMeaningfulStallProgressEvent,
  isNoiseStallEvent,
  shouldSuppressStallVisual,
  DAEMON_OFFLINE_STALL_MESSAGE,
} from "./derive-runtime-stall-visual";

function ev(
  type: string,
  tsIso: string,
  extra?: Partial<RuntimeEventDto>,
): RuntimeEventDto {
  return {
    id: `${type}-${tsIso}`,
    tsIso,
    ts: tsIso,
    channel: "runtime",
    message: type,
    severity: "info",
    type,
    jobId: null,
    runId: "run-1",
    phaseHint: null,
    ...extra,
  };
}

const NOW = Date.parse("2026-05-16T20:00:00.000Z");

describe("derive-runtime-stall-visual", () => {
  it("ignora eventos noise/technical", () => {
    assert.equal(isNoiseStallEvent(ev("scheduler_tick", "2026-05-16T19:59:00.000Z")), true);
    assert.equal(isNoiseStallEvent(ev("worker_idle", "2026-05-16T19:59:00.000Z")), true);
    assert.equal(
      isMeaningfulStallProgressEvent(ev("scheduler_tick", "2026-05-16T19:59:00.000Z")),
      false,
    );
  });

  it("conta eventos significativos listados", () => {
    assert.equal(
      isMeaningfulStallProgressEvent(ev("strategy_started", "2026-05-16T19:59:00.000Z")),
      true,
    );
    assert.equal(
      isMeaningfulStallProgressEvent(ev("execution_progress", "2026-05-16T19:59:00.000Z")),
      true,
    );
    assert.equal(
      isMeaningfulStallProgressEvent(ev("review_completed", "2026-05-16T19:59:00.000Z")),
      true,
    );
  });

  it("warn/error contam como significativos", () => {
    assert.equal(
      isMeaningfulStallProgressEvent(
        ev("runtime.projects.pipeline", "2026-05-16T19:59:00.000Z", {
          severity: "error",
        }),
      ),
      true,
    );
  });

  it("thresholds: normal → warning → stalled → critical", () => {
    const last = new Date(NOW - STALL_WARNING_MS - 1_000).toISOString();
    const base = {
      events: [ev("strategy_started", last)],
      activelyProcessing: true,
      nowMs: NOW,
    };

    const warning = deriveRuntimeStallVisual(base);
    assert.equal(warning.level, "warning");
    assert.match(warning.message ?? "", /Sem novos eventos há/);

    const stalled = deriveRuntimeStallVisual({
      ...base,
      events: [ev("strategy_started", new Date(NOW - STALL_STALLED_MS - 1_000).toISOString())],
    });
    assert.equal(stalled.level, "stalled");
    assert.match(stalled.message ?? "", /demorando mais que o normal/);

    const critical = deriveRuntimeStallVisual({
      ...base,
      events: [
        ev("strategy_started", new Date(NOW - STALL_CRITICAL_MS - 1_000).toISOString()),
      ],
    });
    assert.equal(critical.level, "critical");
    assert.match(critical.message ?? "", /Nenhum progresso recente/);
  });

  it("strategy_ready suprime stall", () => {
    const result = deriveRuntimeStallVisual({
      events: [ev("strategy_started", new Date(NOW - STALL_CRITICAL_MS).toISOString())],
      nowMs: NOW,
      activelyProcessing: true,
      runtimePhase: "strategy_ready",
    });
    assert.equal(result.suppressed, true);
    assert.equal(result.level, "normal");
    assert.equal(result.message, null);
  });

  it("estado terminal não gera stall", () => {
    const result = deriveRuntimeStallVisual({
      events: [ev("execution_started", new Date(NOW - STALL_CRITICAL_MS).toISOString())],
      nowMs: NOW,
      activelyProcessing: true,
      runState: "success",
      terminal: true,
    });
    assert.equal(result.suppressed, true);
    assert.equal(result.level, "normal");
  });

  it("worker idle sem job activo suprime stall", () => {
    assert.equal(
      shouldSuppressStallVisual({
        activelyProcessing: true,
        runningJobsCount: 0,
        currentJobId: null,
        runKey: "run-1",
      }),
      true,
    );
  });

  it("phaseBumpAtMs actualiza lastMeaningful", () => {
    const at = computeLastMeaningfulEventAt([], NOW - 30_000);
    assert.equal(at, NOW - 30_000);
  });

  it("daemon offline com processing activo", () => {
    const result = deriveRuntimeStallVisual({
      events: [ev("strategy_started", new Date(NOW - STALL_WARNING_MS).toISOString())],
      nowMs: NOW,
      activelyProcessing: true,
      daemonAlive: false,
    });
    assert.equal(result.level, "critical");
    assert.equal(result.message, DAEMON_OFFLINE_STALL_MESSAGE);
  });

  it("worker busy noutro run suprime stall", () => {
    assert.equal(
      shouldSuppressStallVisual({
        activelyProcessing: true,
        currentRunId: "run-other",
        runKey: "run-1",
        workerState: "busy",
      }),
      true,
    );
  });

  it("worker idle não atinge stalled", () => {
    const result = deriveRuntimeStallVisual({
      events: [ev("strategy_started", new Date(NOW - STALL_CRITICAL_MS).toISOString())],
      nowMs: NOW,
      activelyProcessing: true,
      workerState: "idle",
      runningJobsCount: 0,
      currentJobId: null,
    });
    assert.equal(result.level, "normal");
  });

  it("transição: novo evento significativo repõe normal", () => {
    const stale = deriveRuntimeStallVisual({
      events: [ev("strategy_started", new Date(NOW - STALL_STALLED_MS).toISOString())],
      nowMs: NOW,
      activelyProcessing: true,
    });
    assert.equal(stale.level, "stalled");

    const fresh = deriveRuntimeStallVisual({
      events: [
        ev("strategy_started", new Date(NOW - STALL_STALLED_MS).toISOString()),
        ev("execution_progress", new Date(NOW - 5_000).toISOString()),
      ],
      nowMs: NOW,
      activelyProcessing: true,
    });
    assert.equal(fresh.level, "normal");
  });
});
