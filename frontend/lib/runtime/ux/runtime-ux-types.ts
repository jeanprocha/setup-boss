import type { ApiRuntimeEventRow, RuntimeEventDto } from "@/lib/api/runtime-types";
import type { WorkspaceRunSsePayload } from "@/lib/workspace/sse/workspace-run-sse-types";
import type { OperationalVisualStepId } from "./operational-visual-model.ts";

/** Domínio operacional humano do evento. */
export type RuntimeUxKind =
  | "intake"
  | "clarification"
  | "plan"
  | "approval"
  | "git"
  | "strategy"
  | "execution"
  | "review"
  | "correction"
  | "knowledge"
  | "workspace"
  | "system"
  | "unknown";

/** Fase narrativa dentro do domínio. */
export type RuntimeUxPhase =
  | "started"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "info";

export type RuntimeUxEvent = {
  id: string;
  timestamp: string;
  kind: RuntimeUxKind;
  phase: RuntimeUxPhase;
  title: string;
  message: string;
  runId?: string | null;
  projectId?: string | null;
  raw: unknown;
};

export type RunUxActiveStep =
  | "intake"
  | "clarification"
  | "plan"
  | "approval"
  | "git"
  | "strategy"
  | "execution"
  | "review"
  | "correction"
  | "completed"
  | "failed";

export type RunUxStatus =
  | "running"
  | "waiting_user_action"
  | "completed"
  | "failed";

export type RunUxState = {
  activeStep: RunUxActiveStep;
  /** Passo dominante na camada visual simplificada (UX-C). */
  visualStep: OperationalVisualStepId | "failed";
  status: RunUxStatus;
  headline: string;
  detail: string;
  lastEventAt: string | null;
  hasHumanAction: boolean;
  isStalled: boolean;
  completedSteps: string[];
};

export type DeriveRunUxStateOptions = {
  nowMs?: number;
};

/** Sem progresso relevante → stall visual (heurística UX-A). */
export const RUN_UX_STALL_MS = 90_000;

export type RuntimeUxRawInput =
  | ApiRuntimeEventRow
  | RuntimeEventDto
  | WorkspaceRunSsePayload
  | Record<string, unknown>;
