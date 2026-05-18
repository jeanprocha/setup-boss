/**
 * Contrato UX operacional — fases humanas do Setup Boss.
 * Desacoplado de nomes internos (intake, clarification, strategy, …).
 */

import type { RunSummaryDto, RuntimeEventDto } from "../../api/runtime-types";
import type { ClarificationBundleDto } from "../clarification/clarification-types";
import type { StrategyBundleDto } from "../strategy/strategy-types";

/** Sete fases operacionais alvo (UI). */
export const OPERATIONAL_UX_PHASES = [
  "initialization",
  "planning",
  "approval",
  "versioning",
  "execution",
  "review",
  "finalization",
] as const;

export type OperationalUxPhase = (typeof OPERATIONAL_UX_PHASES)[number];

/** Sub-passos narrativos dentro de uma fase (sem expor runtime). */
export const OPERATIONAL_UX_STEPS = [
  "compose_activity",
  "ia_validation",
  "context_load",
  "initial_spec",
  "planning_questions",
  "planning_answers",
  "planning_refine",
  "planning_strategy",
  "plan_approval_gate",
  "versioning_branch",
  "execution_active",
  "review_active",
  "run_complete",
  "idle",
] as const;

export type OperationalUxStep = (typeof OPERATIONAL_UX_STEPS)[number];

/** Estado agregado de “Montando o plano”. */
export const PLANNING_STATUSES = [
  "idle",
  "questions_pending",
  "collecting_answers",
  "generating_plan",
  "plan_ready_for_review",
  "adjusting_plan",
  "strategy_building",
  "complete",
] as const;

export type PlanningStatus = (typeof PLANNING_STATUSES)[number];

export type OperationalUxDerivationConfidence = "high" | "derived" | "fallback";

/**
 * Contrato estável para consumo da UI (fases 1–2: inicialização + montagem do plano).
 * Campos booleanos `null` = desconhecido (dados ainda não carregados).
 */
export type RunOperationalUxContract = {
  uxPhase: OperationalUxPhase;
  uxStep: OperationalUxStep;
  /** Rótulo PT da fase — preferir sobre strings técnicas da API. */
  uxPhaseLabelPt: string;
  uxStepLabelPt: string;

  iaValidated: boolean | null;
  contextLoaded: boolean;
  initialSpecReady: boolean;

  planningStatus: PlanningStatus;
  planningQuestionsPending: number;
  finalPlanReady: boolean;

  requiresHumanAction: boolean;

  /** Fase operacional coberta por este contrato na fase 1 (init + planning). */
  isInitializationPhase: boolean;
  isPlanningPhase: boolean;

  confidence: OperationalUxDerivationConfidence;
};

export type DeriveOperationalUxContractInput = {
  summary: RunSummaryDto | null;
  newActivityFlow?: boolean;
  governanceReadiness?: "ready" | "warning" | "blocked" | null;
  governanceOk?: boolean | null;
  clarificationBundle?: ClarificationBundleDto | null;
  clarificationApplies?: boolean;
  strategyBundle?: StrategyBundleDto | null;
  strategyApplies?: boolean;
  executionApplies?: boolean;
  executionLifecyclePhase?: string | null;
  events?: readonly RuntimeEventDto[];
  /** HITL review operacional (Fase 8) — quando disponível. */
  operationalReviewStatus?: string | null;
  /** HITL finalização (Fase 9) — quando disponível. */
  operationalFinalizationStatus?: string | null;
};
