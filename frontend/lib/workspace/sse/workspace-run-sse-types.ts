export const WORKSPACE_RUN_SSE_EVENT_TYPES = [
  "workspace_run.updated",
  "workspace_run.started",
  "workspace_run.advanced",
  "workspace_run.waiting_user_action",
  "workspace_run.failed",
  "workspace_run.completed",
  "workspace_run.git_updated",
  "workspace_run.error",
] as const;

export type WorkspaceRunSseEventType =
  (typeof WORKSPACE_RUN_SSE_EVENT_TYPES)[number];

export type WorkspaceRunSsePayload = {
  ok?: boolean;
  workspaceRunId: string;
  workspaceId: string;
  status: string;
  eventType: WorkspaceRunSseEventType;
  timestamp: string;
  miniActivityId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  message?: string | null;
};

export type WorkspaceRunSsePhase =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type WorkspaceRunSseHandlers = {
  onPhase: (phase: WorkspaceRunSsePhase) => void;
  onWorkspaceRunEvent: (payload: WorkspaceRunSsePayload) => void;
  onError: (message: string) => void;
};
