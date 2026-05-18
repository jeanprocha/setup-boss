import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import { clarificationApprovedAwaitingStrategy } from "@/lib/runtime/clarification/clarification-operational-state";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";

/** Falha na geração automática — único caso com kickoff manual (retry). */
export function strategyNeedsManualRetry(
  strategy: StrategyBundleDto | null | undefined,
): boolean {
  return strategy?.summary.runtimePhase === "strategy_failed";
}

/** Geração automática em curso ou arranque iminente após approve (sem segundo clique). */
function strategyAlreadyReady(
  strategy: StrategyBundleDto | null | undefined,
): boolean {
  const srp = strategy?.summary.runtimePhase;
  if (
    srp === "strategy_ready" ||
    srp === "ready_for_execution" ||
    srp === "strategy_approved"
  ) {
    return true;
  }
  return strategy?.summary.operationalReadiness === "ready";
}

export function strategyAutoStartInProgress(
  clarification: ClarificationBundleDto | null | undefined,
  strategy: StrategyBundleDto | null | undefined,
): boolean {
  if (strategyNeedsManualRetry(strategy)) return false;
  if (strategyAlreadyReady(strategy)) return false;
  const srp = strategy?.summary.runtimePhase;
  if (srp === "strategy_generating" || srp === "strategy_pending") return true;
  if (clarification?.session.runtimePhase === "strategy_pending") return true;
  if (clarification && clarificationApprovedAwaitingStrategy(clarification)) {
    return true;
  }
  return false;
}

export function shouldAutoStartStrategyAfterApproval(
  runtimePhase: string | null | undefined,
  phase2Status: string | null | undefined,
): boolean {
  const p = String(runtimePhase || "");
  const s = String(phase2Status || "");
  return (
    p === "ready_for_execution" ||
    p === "strategy_pending" ||
    p === "approved" ||
    s === "ready_for_execution"
  );
}
