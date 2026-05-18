import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeHeartbeatDto } from "@/lib/api/runtime-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { isStrategyGenerationComplete } from "@/lib/runtime/strategy/strategy-readiness";
import {
  strategyAutoStartInProgress,
  strategyNeedsManualRetry,
} from "@/lib/runtime/strategy/strategy-auto-start-policy";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import {
  deriveRuntimeOperationalContext,
  type RuntimeOperationalContext,
} from "@/lib/runtime/observability/derive-runtime-operational-context";
import {
  isStrategyReadyPhase,
  isTerminalRunContext,
} from "@/lib/runtime/observability/derive-runtime-stall-visual";

/** Snapshot coerente do run para UI operacional (fonte única de flags). */
export type RunOperationalCoherence = {
  runKey: string | null;
  runState: string | null;
  summaryPhase: string | null;
  strategyRuntimePhase: string | null;
  executionLifecyclePhase: string | null;
  strategyReady: boolean;
  isRunTerminal: boolean;
  isStrategyReady: boolean;
  showStrategyProcessing: boolean;
  showExecutionProcessing: boolean;
  suppressStall: boolean;
  operational: RuntimeOperationalContext;
};

export function isExecutionLifecycleActive(
  lifecyclePhase: string | null | undefined,
): boolean {
  const p = String(lifecyclePhase || "");
  return /_running$/.test(p) && p !== "execution_pending";
}

export function deriveRunOperationalCoherence(input: {
  summary: RunSummaryDto | null;
  strategy: StrategyBundleDto | null | undefined;
  clarification: ClarificationBundleDto | null | undefined;
  executionLifecyclePhase?: string | null;
  strategyReadyOverride?: boolean;
  heroActive?: boolean;
  heartbeat?: RuntimeHeartbeatDto | null;
  uiStrategyProcessing?: boolean;
  uiExecutionProcessing?: boolean;
}): RunOperationalCoherence {
  const runKey = input.summary?.runId ?? input.summary?.id ?? null;
  const runState = input.summary?.state ?? null;
  const summaryPhase = input.summary?.phase ?? null;
  const strategyRuntimePhase = input.strategy?.summary.runtimePhase ?? null;
  const executionLifecyclePhase = input.executionLifecyclePhase ?? null;

  const strategyReady =
    input.strategyReadyOverride ??
    isStrategyGenerationComplete(input.strategy ?? null);

  const isRunTerminal = isTerminalRunContext({
    runState,
    runtimePhase: strategyRuntimePhase,
    executionLifecyclePhase,
  });

  const isStrategyReady =
    strategyReady ||
    isStrategyReadyPhase(strategyRuntimePhase) ||
    input.strategy?.summary.operationalReadiness === "ready";

  const needsRetry = strategyNeedsManualRetry(input.strategy);
  const autoStart = strategyAutoStartInProgress(
    input.clarification,
    input.strategy,
  );

  const heroActive = Boolean(input.heroActive);
  const showStrategyProcessing =
    heroActive &&
    !needsRetry &&
    !isRunTerminal &&
    !isStrategyReady &&
    (input.uiStrategyProcessing ?? autoStart) &&
    !isStrategyReadyPhase(strategyRuntimePhase);

  const executionWantsActive =
    input.uiExecutionProcessing ??
    isExecutionLifecycleActive(executionLifecyclePhase);

  const operational = deriveRuntimeOperationalContext({
    heartbeat: input.heartbeat,
    runKey,
    uiActivelyProcessing: executionWantsActive || showStrategyProcessing,
  });

  const showExecutionProcessing =
    executionWantsActive &&
    !isRunTerminal &&
    operational.isRunActivelyProcessing;

  const suppressStall =
    isRunTerminal || isStrategyReady || !operational.isRunActivelyProcessing;

  return {
    runKey,
    runState,
    summaryPhase,
    strategyRuntimePhase,
    executionLifecyclePhase,
    strategyReady,
    isRunTerminal,
    isStrategyReady,
    showStrategyProcessing,
    showExecutionProcessing,
    suppressStall,
    operational,
  };
}
