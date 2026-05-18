import type {
  RunOperationalUxContract,
  OperationalUxPhase,
} from "./operational-ux-types.ts";
import type { ExecutionLifecyclePhase } from "../execution/execution-types.ts";
import type { FinalizationOperationalStatus } from "./finalization-operational-state.ts";
import {
  labelOperationalUxPhase,
  labelOperationalUxStep,
  labelPlanningStatus,
} from "./operational-ux-labels.ts";

export function isOperationalUxPhase(
  contract: RunOperationalUxContract | null | undefined,
  phase: OperationalUxPhase,
): boolean {
  return contract?.uxPhase === phase;
}

export function operationalUxHeadline(
  contract: RunOperationalUxContract | null | undefined,
): string {
  if (!contract) return "—";
  return contract.uxPhaseLabelPt;
}

export function operationalPhaseSubheadline(
  contract: RunOperationalUxContract | null | undefined,
  opts?: {
    executionLifecyclePhase?: ExecutionLifecyclePhase | string | null;
    finalizationStatus?: FinalizationOperationalStatus | null;
  },
): string {
  if (!contract) return "—";
  switch (contract.uxPhase) {
    case "approval":
      return "Aguardando sua decisão";
    case "versioning":
      return "Confirme o versionamento";
    case "execution": {
      const phase = String(opts?.executionLifecyclePhase ?? "");
      if (
        phase === "execution_running" ||
        phase === "retry_running" ||
        phase === "recovery_running" ||
        phase === "review_running" ||
        phase === "correction_running"
      ) {
        return "Executando";
      }
      return "Preparando execução";
    }
    case "review":
      return "Aguardando sua validação";
    case "finalization":
      return opts?.finalizationStatus === "finalized"
        ? "Atividade finalizada"
        : "Pronto para encerrar";
    case "planning":
      return `${contract.uxStepLabelPt} · ${labelPlanningStatus(contract.planningStatus)}`;
    default:
      return contract.uxStepLabelPt;
  }
}

/** @deprecated Preferir operationalPhaseSubheadline para painéis de fase. */
export function operationalUxSubheadline(
  contract: RunOperationalUxContract | null | undefined,
): string {
  return operationalPhaseSubheadline(contract);
}

/** Preferir sobre `summary.phase` / `runPhaseDisplayLabel` em novos consumidores. */
export function operationalPhaseLabelForUi(
  contract: RunOperationalUxContract | null | undefined,
  /** Fallback legado apenas quando contrato indisponível */
  legacyPhaseLabel?: string | null,
): string {
  if (contract?.uxPhaseLabelPt) return contract.uxPhaseLabelPt;
  return legacyPhaseLabel?.trim() || labelOperationalUxPhase("initialization");
}

export function initializationMilestones(contract: RunOperationalUxContract) {
  return {
    iaValidated: contract.iaValidated === true,
    iaBlocked: contract.iaValidated === false,
    contextLoaded: contract.contextLoaded,
    initialSpecReady: contract.initialSpecReady,
    allComplete:
      contract.iaValidated === true &&
      contract.contextLoaded &&
      contract.initialSpecReady,
  };
}

export function planningSignals(contract: RunOperationalUxContract) {
  return {
    status: contract.planningStatus,
    statusLabel: labelPlanningStatus(contract.planningStatus),
    questionsPending: contract.planningQuestionsPending,
    finalPlanReady: contract.finalPlanReady,
    needsAnswers: contract.planningQuestionsPending > 0,
    isBuilding: contract.planningStatus === "strategy_building",
    isGenerating: contract.planningStatus === "generating_plan",
  };
}

export function shouldUseOperationalUxContract(
  contract: RunOperationalUxContract | null | undefined,
): contract is RunOperationalUxContract {
  return contract != null && contract.confidence !== "fallback";
}
