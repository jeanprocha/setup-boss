import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { ExecutionBundleDto } from "@/lib/runtime/execution/execution-types";
import type { StrategyBundleDto } from "@/lib/runtime/strategy/strategy-types";
import type { RunGitSummaryDto } from "@/lib/api/runtime-types";
import type {
  ExecuteAvailability,
  ExecuteGuardReason,
  OrchestrationBootstrapDto,
  OrchestrationExecutionState,
  OrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-types";
import { shouldBlockExecutionNotApplicable } from "@/lib/runtime/orchestration/operational-execute-readiness";

const GUARD_MESSAGES: Record<Exclude<ExecuteGuardReason, null>, string> = {
  runtime_offline: "Runtime offline — não é possível disparar execução.",
  clarification_not_approved: "Aprove a clarificação antes de executar.",
  clarification_pending: "Clarificação pendente — complete o gate HITL.",
  clarification_not_ready: "Clarificação não está pronta para execução.",
  strategy_not_ready: "Strategy ainda não está pronta.",
  execution_already_active: "Orchestration já activa para esta corrida.",
  execution_not_applicable: "Execução não aplicável nesta fase.",
  run_key_missing: "Corrida não seleccionada.",
  git_branch_required: "Prepare a branch da atividade antes de executar.",
  git_branch_mismatch:
    "A branch actual não coincide com a branch preparada para esta atividade.",
  git_not_repository: "O projeto não é um repositório Git válido.",
  git_branch_unknown: "Não foi possível detectar a branch actual do repositório.",
};

const GIT_EXECUTE_GUARD_CODES = new Set<Exclude<ExecuteGuardReason, null>>([
  "git_branch_required",
  "git_branch_mismatch",
  "git_not_repository",
  "git_branch_unknown",
]);

function gitBlockToGuardReason(code: string): ExecuteGuardReason | null {
  if (GIT_EXECUTE_GUARD_CODES.has(code as Exclude<ExecuteGuardReason, null>)) {
    return code as Exclude<ExecuteGuardReason, null>;
  }
  return null;
}

function deriveGitExecuteBlock(
  git: RunGitSummaryDto | null | undefined,
): ExecuteAvailability | null {
  if (!git) return null;

  const blockCode = git.executeBlockCode?.trim();
  if (blockCode) {
    const reason = gitBlockToGuardReason(blockCode) ?? "git_branch_required";
    const fromGit =
      git.errorMessage?.trim() && git.status === "git_branch_failed"
        ? git.errorMessage.trim()
        : null;
    return {
      canExecute: false,
      reason,
      message: fromGit ?? GUARD_MESSAGES[reason],
      degraded: false,
    };
  }

  if (git.status === "git_branch_failed") {
    return {
      canExecute: false,
      reason: "git_branch_required",
      message: git.errorMessage?.trim() || GUARD_MESSAGES.git_branch_required,
      degraded: false,
    };
  }

  return null;
}

export function orchestrationGuardMessage(reason: ExecuteGuardReason): string | null {
  if (!reason) return null;
  return GUARD_MESSAGES[reason] ?? reason;
}

const TERMINAL_ORCH: OrchestrationState[] = [
  "execution_completed",
  "execution_failed",
  "execution_blocked",
];

export function deriveOrchestrationState(
  bootstrap: OrchestrationBootstrapDto | null,
  execution: ExecutionBundleDto | null,
  opts: {
    runtimeReachable: boolean;
    jobStatus?: string | null;
  },
): OrchestrationState {
  const execPhase = execution?.summary.lifecycle.phase;
  if (execPhase === "execution_completed") return "execution_completed";
  if (execPhase === "execution_failed") return "execution_failed";
  if (execPhase === "execution_blocked") return "execution_blocked";
  if (execPhase === "review_running") return "execution_reviewing";
  if (execPhase === "correction_running") return "execution_correcting";
  if (execPhase === "recovery_running") return "execution_recovering";
  if (execPhase === "execution_running") return "execution_running";

  if (bootstrap?.orchestrationState) {
    if (!opts.runtimeReachable) {
      if (TERMINAL_ORCH.includes(bootstrap.orchestrationState)) {
        return bootstrap.orchestrationState;
      }
      return "degraded";
    }
    return bootstrap.orchestrationState;
  }
  if (!opts.runtimeReachable) return "unavailable";
  const phase = execution?.summary.lifecycle.phase;
  if (phase === "execution_running") return "execution_running";
  if (phase === "review_running") return "execution_reviewing";
  if (phase === "correction_running") return "execution_correcting";
  if (phase === "recovery_running") return "execution_recovering";
  if (phase === "execution_blocked") return "execution_blocked";
  if (phase === "execution_failed") return "execution_failed";
  if (phase === "execution_completed") return "execution_completed";
  if (opts.jobStatus === "pending" || opts.jobStatus === "running") {
    return "execution_starting";
  }
  return "ready_for_execution";
}

export function deriveExecutionState(
  bootstrap: OrchestrationBootstrapDto | null,
  execution: ExecutionBundleDto | null,
): OrchestrationExecutionState {
  const phase = execution?.summary.lifecycle.phase;
  if (phase === "execution_completed") return "execution_completed";
  if (phase === "execution_failed") return "execution_failed";
  if (phase === "execution_blocked") return "execution_blocked";
  if (phase === "review_running") return "execution_reviewing";
  if (phase === "correction_running") return "execution_correcting";
  if (phase === "recovery_running") return "execution_recovering";
  if (phase === "execution_running") return "execution_running";

  if (bootstrap?.executionState) return bootstrap.executionState;
  return "ready_for_execution";
}

export function deriveExecuteAvailability(input: {
  runKey: string | null;
  reachable: boolean;
  clarification: ClarificationBundleDto | null | undefined;
  strategy: StrategyBundleDto | null | undefined;
  bootstrap: OrchestrationBootstrapDto | null;
  jobStatus?: string | null;
  phaseRaw?: string | null;
  git?: RunGitSummaryDto | null;
}): ExecuteAvailability {
  if (!input.runKey) {
    return {
      canExecute: false,
      reason: "run_key_missing",
      message: GUARD_MESSAGES.run_key_missing,
      degraded: false,
    };
  }

  const degraded = !input.reachable;
  if (degraded) {
    return {
      canExecute: false,
      reason: "runtime_offline",
      message: GUARD_MESSAGES.runtime_offline,
      degraded: true,
    };
  }

  const orch = input.bootstrap?.orchestrationState;
  if (
    orch === "execution_starting" ||
    orch === "execution_running" ||
    orch === "queued"
  ) {
    return {
      canExecute: false,
      reason: "execution_already_active",
      message: GUARD_MESSAGES.execution_already_active,
      degraded: false,
    };
  }

  if (input.jobStatus === "running" || input.jobStatus === "pending") {
    const metaExecute =
      input.phaseRaw === "execution" && input.jobStatus === "running";
    if (metaExecute) {
      return {
        canExecute: false,
        reason: "execution_already_active",
        message: GUARD_MESSAGES.execution_already_active,
        degraded: false,
      };
    }
  }

  const clar = input.clarification;
  if (clar) {
    const approval = clar.approval?.status;
    const phase = clar.session?.runtimePhase;
    const p2 = clar.session?.phase2Status;
    if (approval !== "approved" && phase !== "ready_for_execution") {
      if (
        phase === "awaiting_approval" ||
        phase === "refinement_ready" ||
        p2 === "plan_refined"
      ) {
        return {
          canExecute: false,
          reason: "clarification_pending",
          message: GUARD_MESSAGES.clarification_pending,
          degraded: false,
        };
      }
      return {
        canExecute: false,
        reason: "clarification_not_approved",
        message: GUARD_MESSAGES.clarification_not_approved,
        degraded: false,
      };
    }
    if (p2 && p2 !== "ready_for_execution" && phase !== "ready_for_execution") {
      return {
        canExecute: false,
        reason: "clarification_not_ready",
        message: GUARD_MESSAGES.clarification_not_ready,
        degraded: false,
      };
    }
  }

  const strat = input.strategy;
  if (
    strat &&
    strat.summary.source !== "unsupported" &&
    strat.summary.operationalReadiness === "not_ready" &&
    (strat.summary.subtaskCount ?? 0) > 0
  ) {
    return {
      canExecute: false,
      reason: "strategy_not_ready",
      message: GUARD_MESSAGES.strategy_not_ready,
      degraded: false,
    };
  }

  if (
    shouldBlockExecutionNotApplicable({
      phaseRaw: input.phaseRaw,
      clarification: input.clarification,
      git: input.git,
    })
  ) {
    return {
      canExecute: false,
      reason: "execution_not_applicable",
      message: GUARD_MESSAGES.execution_not_applicable,
      degraded: false,
    };
  }

  const gitBlock = deriveGitExecuteBlock(input.git);
  if (gitBlock) return gitBlock;

  return {
    canExecute: true,
    reason: null,
    message: null,
    degraded: false,
  };
}

export function shouldOpenExecutionTab(
  executionState: OrchestrationExecutionState | null | undefined,
): boolean {
  const s = String(executionState || "");
  return (
    s === "execution_starting" ||
    s === "execution_running" ||
    s === "execution_reviewing" ||
    s === "execution_correcting" ||
    s === "execution_recovering"
  );
}

export function isOrchestrationActive(state: OrchestrationState | null | undefined): boolean {
  const s = String(state || "");
  return (
    s === "queued" ||
    s === "execution_starting" ||
    s === "execution_running" ||
    s === "execution_reviewing" ||
    s === "execution_correcting" ||
    s === "execution_recovering"
  );
}
