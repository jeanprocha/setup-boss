import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import {
  strategyAutoStartInProgress,
  strategyNeedsManualRetry,
} from "@/lib/runtime/strategy/strategy-auto-start-policy";
import type { StrategyBundleDto, StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";

/** Kickoff manual só em falha de geração automática (retry). */
export function strategyAwaitingUserKickoff(
  _clarification: ClarificationBundleDto | null | undefined,
  strategy: StrategyBundleDto | null | undefined,
): boolean {
  return strategyNeedsManualRetry(strategy);
}

/** Status operacional da etapa strategy na timeline central. */
export function deriveStrategyOperationalStatus(
  strategyPhase: StrategyRuntimePhase | null | undefined,
  opts?: { clarificationHandoff?: boolean },
): OperationalStepStatus | null {
  const handoff = opts?.clarificationHandoff ?? false;
  const phase = strategyPhase ?? (handoff ? "strategy_pending" : null);
  if (!phase || phase === "unavailable") {
    return handoff ? "waiting_user" : null;
  }
  switch (phase) {
    case "strategy_generating":
      return "running";
    case "strategy_pending":
      return handoff ? "running" : "waiting_user";
    case "strategy_ready":
    case "strategy_blocked":
      return "waiting_user";
    case "strategy_failed":
      return "failed";
    case "strategy_approved":
    case "ready_for_execution":
      return "completed";
    default:
      return handoff ? "waiting_user" : null;
  }
}
