import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import {
  mapRawPhaseToLifecycleId,
  type LifecyclePhaseId,
} from "@/lib/runtime/adapters/runtime-labels";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";

/** Passos fixos da timeline visual (MVP — alinhado ao runtime real quando disponível). */
export const EXECUTION_VISUAL_STEPS = [
  { id: "intake", title: "Entrada da tarefa" },
  {
    id: "reading_ia",
    title: "Lendo arquivos .IA e base de conhecimento",
  },
  { id: "generating_spec", title: "Gerando SPEC" },
  { id: "spec_questions", title: "Aguardando dúvidas da SPEC" },
  { id: "refining_spec", title: "Refinando SPEC" },
  { id: "generating_plan", title: "Gerando plano" },
  { id: "awaiting_approval", title: "Aguardando aprovação" },
  { id: "subtasks", title: "Executando subtarefas" },
  { id: "review", title: "Review" },
  { id: "finalized", title: "Finalizado" },
] as const;

export type ExecutionVisualStepId =
  (typeof EXECUTION_VISUAL_STEPS)[number]["id"];

export type VisualStepStatus = "pending" | "active" | "done" | "blocked";

export type VisualStepVm = {
  id: ExecutionVisualStepId;
  title: string;
  index: number;
  status: VisualStepStatus;
};

function clampIndex(i: number) {
  if (i < 0) return 0;
  if (i >= EXECUTION_VISUAL_STEPS.length)
    return EXECUTION_VISUAL_STEPS.length - 1;
  return i;
}

/**
 * Deriva o índice do passo mais relevante para destacar índice/scroll-spy.
 * Usa fase bruta + sub-fases reais (clarificação/strategy) quando existem.
 */
export function deriveActiveVisualStepIndex(opts: {
  selectedRunId: string | null;
  summary: RunSummaryDto | null;
  clarificationRuntimePhase: ClarificationRuntimePhase | null;
  strategyRuntimePhase: StrategyRuntimePhase | null;
}): number {
  const { selectedRunId, summary } = opts;
  if (!selectedRunId || !summary) return 0;

  const life = mapRawPhaseToLifecycleId(summary.phase);
  const st = summary.state;

  if (st === "success" && life === "completed") {
    return EXECUTION_VISUAL_STEPS.length - 1;
  }
  if (st === "failed") {
    return clampIndex(
      mapLifecycleToBaseIndex(life, opts.clarificationRuntimePhase),
    );
  }

  if (life === "intake") {
    return st === "running" || st === "retrying" ? 1 : 0;
  }

  if (life === "clarification") {
    return mapClarificationToIndex(opts.clarificationRuntimePhase);
  }

  if (life === "strategy") {
    return mapStrategyToIndex(opts.strategyRuntimePhase);
  }

  if (life === "execution") {
    return 7;
  }
  if (life === "review") {
    return 8;
  }
  if (life === "correction" || life === "rollback") {
    return 7;
  }
  if (life === "integrity") {
    return 8;
  }
  if (life === "completed") {
    return 9;
  }

  return 7;
}

function mapLifecycleToBaseIndex(
  life: LifecyclePhaseId,
  clarify: ClarificationRuntimePhase | null,
): number {
  if (life === "intake") return 0;
  if (life === "clarification") return mapClarificationToIndex(clarify);
  if (life === "strategy") return 5;
  if (life === "execution" || life === "correction" || life === "rollback")
    return 7;
  if (life === "review" || life === "integrity") return 8;
  if (life === "completed") return 9;
  return 0;
}

function mapClarificationToIndex(
  p: ClarificationRuntimePhase | null,
): number {
  switch (p) {
    case "unavailable":
    case "clarification_required":
      return 2;
    case "waiting_answers":
      return 3;
    case "refinement_ready":
    case "refining":
      return 4;
    case "awaiting_approval":
      return 6;
    case "approved":
      return 6;
    case "rejected":
      return 4;
    case "ready_for_execution":
    case "strategy_pending":
      return 5;
    default:
      return 2;
  }
}

function mapStrategyToIndex(p: StrategyRuntimePhase | null): number {
  switch (p) {
    case "strategy_generating":
      return 5;
    case "strategy_ready":
    case "strategy_blocked":
      return 6;
    case "strategy_approved":
    case "ready_for_execution":
      return 7;
    case "strategy_failed":
      return 5;
    case "strategy_pending":
      return 5;
    default:
      return 5;
  }
}

/** Constrói VMs para sidebar direita e estados visuais. */
export function buildVisualSteps(opts: {
  activeIndex: number;
  state: RuntimeUiState | null;
}): VisualStepVm[] {
  const { activeIndex, state } = opts;
  const terminalFail = state === "failed";
  const fullSuccess = state === "success";

  return EXECUTION_VISUAL_STEPS.map((row, i) => {
    let status: VisualStepVm["status"] = "pending";

    if (fullSuccess) {
      status = "done";
    } else if (i < activeIndex) {
      status = "done";
    } else if (i === activeIndex) {
      status = terminalFail ? "blocked" : "active";
    }

    return {
      id: row.id,
      title: row.title,
      index: i,
      status,
    };
  });
}

export function visualStepDomId(id: ExecutionVisualStepId) {
  return `exec-visual-step-${id}`;
}
