import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { MissionOrchestrationSlices } from "@/lib/runtime/mission/mission-workflow-stages";
import { shouldShowClarificationApprovalGate } from "@/lib/runtime/clarification/clarification-operational-state";
import { executionMacroActivityMessage } from "@/lib/runtime/ux/operational-visual-model";
import { normalizeRuntimeEvent } from "@/lib/runtime/ux/normalize-runtime-event";
import { formatGitStatusLabel } from "@/lib/runtime/git/git-branch-cta-visibility";

export type WorkflowFeedbackStepStatus =
  | "done"
  | "active"
  | "pending"
  | "warning";

export type WorkflowFeedbackStep = {
  id: string;
  label: string;
  detail?: string;
  status: WorkflowFeedbackStepStatus;
};

export type ProjectRunWorkflowFeedbackInput = {
  summary: RunSummaryDto;
  orch: MissionOrchestrationSlices;
  submitAnswersPending?: boolean;
  approvePending?: boolean;
  gitBranchPreparePending?: boolean;
  /** Último tipo de evento para mensagem viva de execução. */
  lastEventType?: string | null;
};

/** Passos visíveis do fluxo Project → Run (modelo simplificado, sem estratégia separada). */
export function deriveProjectRunWorkflowSteps(
  input: ProjectRunWorkflowFeedbackInput,
): WorkflowFeedbackStep[] {
  const {
    summary,
    orch,
    submitAnswersPending,
    approvePending,
    gitBranchPreparePending,
    lastEventType,
  } = input;
  const steps: WorkflowFeedbackStep[] = [];
  const clar = orch.clarification.bundle;
  const cp = clar?.session.runtimePhase;

  const isRefining =
    submitAnswersPending ||
    cp === "refining" ||
    (cp === "clarification_required" && clar && !clar.refinement.available);

  if (isRefining) {
    steps.push({
      id: "refining",
      label: "A gerar plano refinado…",
      status: "active",
    });
    return steps;
  }

  if (
    clar &&
    (cp === "refinement_ready" ||
      (cp === "awaiting_approval" && clar.refinement.available))
  ) {
    steps.push({
      id: "refined_ready",
      label: "Plano refinado disponível",
      status: "done",
    });
    if (shouldShowClarificationApprovalGate(clar)) {
      steps.push({
        id: "awaiting_approval",
        label: "Aguarda aprovação do plano refinado",
        detail: "Revise o plano e aprove ou solicite refinamento.",
        status: "active",
      });
    }
    return steps;
  }

  if (approvePending) {
    steps.push({
      id: "approve_pending",
      label: "A registar aprovação…",
      status: "active",
    });
    return steps;
  }

  const planApproved =
    clar?.approval.status === "approved" ||
    cp === "approved" ||
    cp === "strategy_pending" ||
    cp === "ready_for_execution";

  if (planApproved) {
    steps.push({
      id: "plan_approved",
      label: "Plano refinado aprovado",
      status: "done",
    });
  }

  const git = summary.git;
  const gitStatus = git?.status;
  const branchName =
    git?.activityBranch?.trim() ||
    summary.branchHint?.trim() ||
    null;

  if (gitBranchPreparePending || gitStatus === "git_branch_pending") {
    steps.push({
      id: "versioning_preparing",
      label: branchName
        ? `A preparar branch ${branchName}…`
        : "A preparar branch feature/…",
      status: "active",
    });
    return steps;
  }

  if (gitStatus === "git_branch_ready" && branchName) {
    steps.push({
      id: "versioning_ready",
      label: "Branch pronta para execução",
      detail: branchName,
      status: "done",
    });
  } else if (gitStatus === "git_branch_failed") {
    steps.push({
      id: "versioning_failed",
      label: formatGitStatusLabel(gitStatus) ?? "Falha ao preparar branch",
      detail: git?.errorMessage?.trim() || "Use «Preparar branch» para tentar novamente.",
      status: "warning",
    });
  } else if (
    planApproved &&
    (summary.git?.executeBlockCode === "git_branch_required" ||
      gitStatus === undefined ||
      !branchName)
  ) {
    steps.push({
      id: "versioning_not_ready",
      label: "Branch ainda não preparada",
      detail: "Prepare a branch antes de executar.",
      status: "warning",
    });
    return steps;
  }

  const execPhase = orch.execution.lifecyclePhase;
  const execRunning =
    orch.execution.applies &&
    (execPhase === "execution_running" ||
      execPhase === "review_running" ||
      execPhase === "correction_running" ||
      execPhase === "retry_running" ||
      execPhase === "recovery_running" ||
      summary.state === "running" ||
      summary.state === "retrying" ||
      summary.state === "correcting");

  if (execRunning) {
    const lastEv = lastEventType
      ? normalizeRuntimeEvent({
          id: "synthetic",
          type: lastEventType,
          timestamp: new Date().toISOString(),
          runId: summary.runId ?? summary.id,
        })
      : null;
    steps.push({
      id: "execution_running",
      label: executionMacroActivityMessage(lastEv),
      detail: "Nenhuma ação necessária — acompanhe o progresso acima.",
      status: "active",
    });
  }

  return steps;
}
