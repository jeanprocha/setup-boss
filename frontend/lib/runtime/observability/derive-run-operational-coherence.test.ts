import assert from "node:assert";
import { describe, it } from "node:test";
import {
  deriveRunOperationalCoherence,
  isExecutionLifecycleActive,
} from "./derive-run-operational-coherence";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

function summary(state: string, phase = "strategy"): RunSummaryDto {
  return {
    id: "job-1",
    runId: "run-1",
    label: "test",
    phase,
    state,
    projectId: "p1",
    startedAtLabel: null,
    updatedAtLabel: null,
  };
}

describe("deriveRunOperationalCoherence", () => {
  it("run success suprime strategy processing e stall", () => {
    const c = deriveRunOperationalCoherence({
      summary: summary("success"),
      strategy: null,
      clarification: null,
      heroActive: true,
      uiStrategyProcessing: true,
    });
    assert.equal(c.isRunTerminal, true);
    assert.equal(c.showStrategyProcessing, false);
    assert.equal(c.suppressStall, true);
  });

  it("strategy ready suprime processing", () => {
    const c = deriveRunOperationalCoherence({
      summary: summary("running", "strategy"),
      strategy: {
        summary: {
          runId: "run-1",
          label: "run-1",
          runtimePhase: "strategy_ready",
          phase3Status: "strategy_ready",
          operationalReadiness: "ready",
          subtaskCount: 1,
          readySubtaskCount: 0,
          blockingCount: 0,
          updatedAt: null,
          source: "runtime",
          unsupportedReason: null,
        },
        complexity: {
          level: "low",
          estimatedDifficulty: "low",
          executionRisk: "low",
          runtimeLoad: "light",
          coordinationComplexity: "low",
          rationale: null,
        },
        recommendation: {
          recommendedMode: "standard",
          modelStrategy: "default",
          executionApproach: "linear",
          rationale: "",
          operationalImpact: "",
          costPerformanceHint: null,
        },
        subtasks: [],
        ordering: {
          orderingMode: "linear",
          sequence: [],
          readyIds: [],
          pendingIds: [],
          blockingDependencies: [],
        },
        sharedContext: { artifacts: [], constraints: [], rules: [], crossSubtaskDeps: [] },
        risks: [],
        decompositionSummary: null,
        source: "runtime",
        unsupportedReason: null,
      },
      clarification: null,
      heroActive: true,
    });
    assert.equal(c.isStrategyReady, true);
    assert.equal(c.showStrategyProcessing, false);
  });

  it("daemon offline: operational context reflecte indisponibilidade", () => {
    const c = deriveRunOperationalCoherence({
      summary: summary("running", "execution"),
      strategy: null,
      clarification: null,
      executionLifecyclePhase: "execution_running",
      uiExecutionProcessing: true,
      heartbeat: {
        daemonAlive: false,
        runningJobsCount: 0,
        currentJobId: null,
        currentRunId: null,
        lastRuntimeActivityAt: null,
        workerState: "idle",
        queueSize: 0,
        daemonStartedAt: null,
        updatedAt: new Date().toISOString(),
      },
    });
    assert.equal(c.operational.daemonAlive, false);
    assert.equal(c.showExecutionProcessing, false);
  });

  it("execution running activo só com worker alinhado", () => {
    const c = deriveRunOperationalCoherence({
      summary: summary("running", "execution"),
      strategy: null,
      clarification: null,
      executionLifecyclePhase: "execution_running",
      uiExecutionProcessing: true,
      heartbeat: {
        daemonAlive: true,
        runningJobsCount: 1,
        currentJobId: "job-x",
        currentRunId: "other-run",
        lastRuntimeActivityAt: null,
        workerState: "busy",
        queueSize: 1,
        daemonStartedAt: null,
        updatedAt: new Date().toISOString(),
      },
    });
    assert.equal(isExecutionLifecycleActive("execution_running"), true);
    assert.equal(c.showExecutionProcessing, false);
  });
});
