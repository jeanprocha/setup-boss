/**
 * Normalização de fases operacionais Mission Control ↔ Runtime API.
 * Evita dispersar strings mágicas; rótulos PT para UI consistente.
 */

import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";
import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";
import {
  translateClarificationRuntimePhase,
  translateStrategyRuntimePhase,
} from "@/lib/runtime/translation/runtime-translation-layer";

/** Fases de sessão clarificação (runtimePhase no bundle GET /runs/:id/clarification). */
export const CLARIFICATION_RUNTIME_PHASES = [
  "clarification_required",
  "clarification_empty",
  "waiting_answers",
  "refining",
  "refinement_ready",
  "awaiting_approval",
  "approved",
  "rejected",
  "ready_for_execution",
  "strategy_pending",
  "unavailable",
] as const satisfies readonly ClarificationRuntimePhase[];

/** Fases strategy (summary.runtimePhase no bundle GET /runs/:id/strategy). */
export const STRATEGY_RUNTIME_PHASES = [
  "strategy_pending",
  "strategy_generating",
  "strategy_ready",
  "strategy_blocked",
  "strategy_failed",
  "strategy_approved",
  "ready_for_execution",
  "unavailable",
] as const satisfies readonly StrategyRuntimePhase[];

export const CLARIFICATION_RUNTIME_PHASE_LABELS_PT: Record<
  ClarificationRuntimePhase,
  string
> = {
  clarification_required: "Clarificação necessária",
  clarification_empty: "Clarificação sem perguntas",
  waiting_answers: "Aguardando respostas",
  refining: "Refinamento em curso",
  refinement_ready: "SPEC pronto para aprovação",
  awaiting_approval: "Aguardando aprovação do SPEC",
  approved: "SPEC aprovado",
  rejected: "SPEC rejeitado",
  ready_for_execution: "Pronto para execução (fase 2)",
  strategy_pending: "Estratégia — aguarda início",
  unavailable: "Clarificação indisponível",
};

export const STRATEGY_RUNTIME_PHASE_LABELS_PT: Record<
  StrategyRuntimePhase,
  string
> = {
  strategy_pending: "Estratégia — aguarda início",
  strategy_generating: "Estratégia em geração",
  strategy_ready: "Estratégia pronta",
  strategy_blocked: "Estratégia bloqueada",
  strategy_failed: "Estratégia falhou",
  strategy_approved: "Estratégia aprovada",
  ready_for_execution: "Pronto para execução",
  unavailable: "Estratégia indisponível",
};

/** Alinhado a `ExecutionLifecyclePhase` (execution-types). */
export const EXECUTION_LIFECYCLE_PHASES = [
  "execution_pending",
  "execution_running",
  "review_running",
  "correction_running",
  "retry_running",
  "rollback_running",
  "recovery_running",
  "execution_blocked",
  "execution_failed",
  "execution_completed",
] as const;

export function labelClarificationRuntimePhase(
  phase: ClarificationRuntimePhase | null | undefined,
): string {
  if (!phase) return "—";
  return translateClarificationRuntimePhase(phase).headline;
}

export function labelStrategyRuntimePhase(
  phase: StrategyRuntimePhase | null | undefined,
): string {
  if (!phase) return "—";
  return translateStrategyRuntimePhase(phase).headline;
}
