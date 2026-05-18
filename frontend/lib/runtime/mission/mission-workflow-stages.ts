import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import {
  clarificationApprovedAwaitingStrategy,
  CLARIFICATION_EMPTY_PRIMARY_PT,
} from "@/lib/runtime/clarification/clarification-operational-state";
import {
  strategyAutoStartInProgress,
  strategyNeedsManualRetry,
} from "@/lib/runtime/strategy/strategy-auto-start-policy";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import { mapRawPhaseToLifecycleId } from "@/lib/runtime/adapters/runtime-labels";

/** Estados do cartão de etapa no Mission Control (workflow guiado). */
export type MissionWorkspacePhaseStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "WAITING"
  | "WAITING_USER_ACTION"
  | "RUNNING"
  | "BLOCKED"
  | "FAILED"
  | "PENDING"
  | "UPCOMING";

export type MissionOrchestrationSlices = {
  clarification: {
    applies: boolean;
    bundle: ClarificationBundleDto | null;
  };
  strategy: {
    applies: boolean;
    bundle: StrategyBundleDto | null;
  };
  execution: {
    applies: boolean;
    lifecyclePhase: string | null;
  };
};

/** Etapa strategy em foco: geração automática pós-approve ou retry após falha. */
export function needsDominantStrategyCta(
  clarification: ClarificationBundleDto | null | undefined,
  strategy: StrategyBundleDto | null | undefined,
): boolean {
  return (
    strategyAutoStartInProgress(clarification, strategy) ||
    strategyNeedsManualRetry(strategy)
  );
}

export function deriveMissionWorkspaceStatuses(
  summary: RunSummaryDto,
  orch: MissionOrchestrationSlices,
): Record<
  "intake" | "clarify" | "strategy" | "exec",
  MissionWorkspacePhaseStatus
> {
  const life = mapRawPhaseToLifecycleId(summary.phase);
  const st = summary.state ?? "";

  const intake: MissionWorkspacePhaseStatus =
    life === "intake" && ["running", "retrying"].includes(st)
      ? "ACTIVE"
      : "COMPLETED";

  let clarify: MissionWorkspacePhaseStatus = "PENDING";
  if (!orch.clarification.applies) {
    clarify = life === "intake" ? "UPCOMING" : "COMPLETED";
  } else {
    const rp =
      orch.clarification.bundle?.session.runtimePhase ?? "unavailable";
    if (st === "failed" && life === "clarification") clarify = "FAILED";
    else if (rp === "clarification_empty") clarify = "WAITING";
    else if (rp === "waiting_answers" || rp === "awaiting_approval")
      clarify = "WAITING_USER_ACTION";
    else if (rp === "rejected") clarify = "BLOCKED";
    else if (
      rp === "refining" ||
      rp === "refinement_ready" ||
      rp === "clarification_required"
    )
      clarify = "ACTIVE";
    else if (
      rp === "ready_for_execution" ||
      rp === "approved" ||
      rp === "strategy_pending"
    )
      clarify = "COMPLETED";
    else clarify = "PENDING";
  }

  const dominantStrategy = needsDominantStrategyCta(
    orch.clarification.bundle,
    orch.strategy.bundle,
  );
  const clarificationStrategyPending =
    orch.clarification.bundle?.session.runtimePhase === "strategy_pending";

  let strategy: MissionWorkspacePhaseStatus = "PENDING";
  if (!orch.strategy.applies) {
    strategy =
      life === "intake" || life === "clarification" ? "UPCOMING" : "COMPLETED";
  } else {
    const srp = orch.strategy.bundle?.summary.runtimePhase ?? "unavailable";
    if (srp === "strategy_failed") strategy = "FAILED";
    else if (
      srp === "strategy_generating" ||
      dominantStrategy ||
      srp === "strategy_pending" ||
      clarificationStrategyPending
    )
      strategy = "RUNNING";
    else if (strategyNeedsManualRetry(orch.strategy.bundle))
      strategy = "WAITING_USER_ACTION";
    else if (srp === "strategy_blocked") strategy = "BLOCKED";
    else if (srp === "strategy_ready") strategy = "WAITING";
    else if (srp === "strategy_approved" || srp === "ready_for_execution")
      strategy = "COMPLETED";
    else if (
      orch.clarification.bundle &&
      clarificationApprovedAwaitingStrategy(orch.clarification.bundle)
    )
      strategy = "RUNNING";
    else strategy = "PENDING";
  }

  let exec: MissionWorkspacePhaseStatus = "PENDING";
  if (!orch.execution.applies) {
    exec =
      life === "intake" ||
      life === "clarification" ||
      (life === "strategy" && st !== "success")
        ? "UPCOMING"
        : "COMPLETED";
  } else {
    const lp = orch.execution.lifecyclePhase;
    if (lp === "execution_failed") exec = "FAILED";
    else if (lp === "execution_blocked") exec = "BLOCKED";
    else if (lp === "execution_completed" || st === "success")
      exec = "COMPLETED";
    else if (lp === "review_running" && st === "waiting_approval")
      exec = "WAITING_USER_ACTION";
    else if (
      lp === "execution_running" ||
      lp === "review_running" ||
      lp === "correction_running" ||
      lp === "retry_running" ||
      lp === "rollback_running" ||
      lp === "recovery_running"
    )
      exec = "RUNNING";
    else exec = "PENDING";
  }

  return { intake, clarify, strategy, exec };
}

export function deriveAttentionHint(
  summary: RunSummaryDto,
  orch: MissionOrchestrationSlices,
): string | null {
  const cp = orch.clarification.bundle?.session.runtimePhase;
  if (orch.clarification.applies && cp === "clarification_empty") {
    return CLARIFICATION_EMPTY_PRIMARY_PT;
  }
  if (orch.clarification.applies && cp === "waiting_answers") {
    return "Depende de si: responda às perguntas de clarificação para continuar.";
  }
  if (orch.clarification.applies && cp === "refining") {
    return "A gerar plano refinado no runtime…";
  }
  if (
    orch.clarification.applies &&
    (cp === "refinement_ready" || cp === "awaiting_approval")
  ) {
    return "Plano refinado disponível — aguardando a sua aprovação.";
  }
  if (orch.clarification.applies && cp === "awaiting_approval") {
    return "Depende de si: aprove ou solicite refinamento do SPEC antes da execução.";
  }
  if (
    orch.clarification.applies &&
    orch.clarification.bundle?.approval.status === "approved"
  ) {
    const git = summary.git;
    if (git?.status === "git_branch_pending") {
      return "A preparar branch da atividade…";
    }
    if (git?.status === "git_branch_ready" && git.activityBranch) {
      return `Branch pronta para execução: ${git.activityBranch}`;
    }
    if (summary.git?.executeBlockCode === "git_branch_required") {
      return "Branch ainda não preparada — use «Preparar branch» para continuar.";
    }
  }
  if (summary.state === "waiting_approval" && orch.execution.applies) {
    return "Depende de si: aprovação pendente na revisão da execução.";
  }
  const execPhase = orch.execution.lifecyclePhase;
  if (
    orch.execution.applies &&
    (execPhase === "execution_running" ||
      execPhase === "review_running" ||
      execPhase === "correction_running" ||
      execPhase === "retry_running")
  ) {
    return "Execução em curso — acompanhe o progresso na timeline.";
  }
  return null;
}
