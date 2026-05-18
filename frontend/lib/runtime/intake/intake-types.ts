/** Intake Runtime — criação de corrida / task (Mission Control). */

export type IntakeUiPhase =
  | "idle"
  | "creating_run"
  | "intake_running"
  | "clarification_required"
  | "clarification_ready"
  | "strategy_pending"
  | "failed";

export type IntakePriority = "low" | "normal" | "high";

export type CreateRunPayload = {
  projectId: string;
  task: string;
  metadata?: {
    skipLlm?: boolean;
    priority?: IntakePriority;
    /** Aceite pelo runtime; não exposto na UX do MVP. */
    tags?: string[];
    source?: string;
    workspaceRunId?: string;
    workspaceId?: string;
    workspaceProjectIds?: string[];
  };
};

export type CreateRunResultDto = {
  runId: string;
  jobId: string;
  initialState: IntakeUiPhase;
  clarificationRequired: boolean;
  createdAt: string;
  phase2Status: string | null;
  classification: string | null;
  uiPhase: string | null;
  uiState: string | null;
};

export type IntakeSubmissionState = {
  phase: IntakeUiPhase;
  error: string | null;
  lastResult: CreateRunResultDto | null;
  taskDraft: string;
};
