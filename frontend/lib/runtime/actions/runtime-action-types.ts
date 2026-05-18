/** Acções operacionais seguras expostas na Mission Control UI. */

export const RUNTIME_ACTION_IDS = [
  "refresh",
  "validate-integrity",
  "rebuild-observability",
  "retry-run",
  "resume-run",
  "cancel-run",
] as const;

export type RuntimeActionId = (typeof RUNTIME_ACTION_IDS)[number];

export type RuntimeActionOutcome =
  | "success"
  | "failed"
  | "unsupported"
  | "degraded"
  | "timeout"
  | "pending";

export type RuntimeActionResult = {
  ok: boolean;
  actionId: RuntimeActionId;
  outcome: RuntimeActionOutcome;
  message: string;
  /** Payload mínimo devolvido pela API quando existir */
  data?: Record<string, unknown>;
  unsupported?: boolean;
};

export type RuntimeActionContext = {
  projectId: string | null;
  jobId: string | null;
  runId: string | null;
  jobStatus: string | null;
  retryable: boolean;
  runtimeReachable: boolean;
  connectionDegraded: boolean;
};

export type ActionAvailability = {
  available: boolean;
  unsupported: boolean;
  disabledReason: string | null;
  requiresConfirmation: boolean;
};

export type JobCancelResponse = {
  ok?: boolean;
  data?: {
    jobId?: string;
    outcome?: string;
    status?: string;
  };
  outcome?: string;
  error?: { code?: string; message?: string };
};

export type JobRetryResponse = {
  ok?: boolean;
  data?: {
    jobId?: string;
    status?: string;
    lastAttemptAt?: string | null;
    availableAt?: string | null;
    delayMs?: number | null;
  };
  error?: { code?: string; message?: string };
};
