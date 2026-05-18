/** DTOs mínimos — contrato Runtime API clarification (read + mutações). */

export type ClarificationQuestionKind = "free_text" | "single_choice" | "confirm";

export type QuestionUiStatus =
  | "pending"
  | "answered"
  | "approved"
  | "rejected"
  | "needs_refinement";

export type ClarificationRuntimePhase =
  | "clarification_required"
  /** Intake marcou needs_context / phase2 inicializado mas 0 perguntas persistidas */
  | "clarification_empty"
  | "waiting_answers"
  | "refining"
  | "refinement_ready"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "ready_for_execution"
  | "strategy_pending"
  | "unavailable";

export type ClarificationQuestionDto = {
  id: string;
  prompt: string;
  kind: ClarificationQuestionKind;
  blocking: boolean;
  options: string[];
  status: QuestionUiStatus;
  answer: string | null;
};

export type ClarificationAnswerDto = {
  questionId: string;
  value: string;
  recordedAt: string | null;
};

export type ClarificationSessionDto = {
  runId: string;
  phase2Status: string | null;
  runtimePhase: ClarificationRuntimePhase;
  currentRound: number;
  questionsCount: number;
  answersCount: number;
  pendingBlockingCount: number;
  updatedAt: string | null;
  /** Geração heurística local (skip LLM + needs_context) falhou após init */
  localFallbackGenerationFailed?: boolean;
  localFallbackGenerationDetail?: string | null;
};

export type RefinementPreviewDto = {
  available: boolean;
  refinedTask: string | null;
  scopeChanges: string[];
  acceptanceCriteria: string[];
  risks: string[];
  executionReadiness: "not_ready" | "pending_approval" | "ready";
};

export type ApprovalStateDto = {
  status: "none" | "pending" | "approved" | "rejected";
  notes: string | null;
  decidedAt: string | null;
  planRef: string | null;
};

export type ClarificationBundleDto = {
  session: ClarificationSessionDto;
  questions: ClarificationQuestionDto[];
  answers: ClarificationAnswerDto[];
  refinement: RefinementPreviewDto;
  approval: ApprovalStateDto;
  /** runtime | mock | unsupported */
  source: "runtime" | "mock" | "unsupported";
  unsupportedReason: string | null;
};

export type SubmitAnswersPayload = {
  answers: { questionId: string; value: string }[];
  overwrite?: boolean;
};

export type ClarificationMutationDto = {
  message: string;
  phase2Status: string | null;
  runtimePhase: ClarificationRuntimePhase | null;
  nextPhase: string | null;
  transitionedAt: string | null;
  idempotent: boolean;
  session: ClarificationSessionDto | null;
  refinement: Pick<
    RefinementPreviewDto,
    "available" | "executionReadiness"
  > | null;
  approvalReadiness: boolean | null;
  updatedAt: string | null;
};

export type ClarificationActionResult = {
  ok: boolean;
  message: string;
  phase2Status: string | null;
  runtimePhase: ClarificationRuntimePhase | null;
  data?: ClarificationMutationDto | null;
};

export type ClarificationAvailability = {
  canSubmitAnswers: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestRefinement: boolean;
  blockedReason: string | null;
};
