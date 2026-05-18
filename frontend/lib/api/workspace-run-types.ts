/**
 * Contrato WorkspaceRun (Fases B–C).
 */

import type { MiniActivityDto } from "@/lib/api/mini-activity-types";
import type { WorkspaceGitDto } from "@/lib/api/workspace-git-types";

export type WorkspaceRunStatus =
  | "draft"
  | "planned"
  | "running"
  | "waiting_user_action"
  | "failed"
  | "completed"
  | "cancelled";

export type WorkspaceRunDto = {
  workspaceRunId: string;
  workspaceId: string;
  title: string;
  description: string | null;
  status: WorkspaceRunStatus;
  globalSpec: string | Record<string, unknown> | null;
  globalPlan: string | Record<string, unknown> | null;
  miniActivities: MiniActivityDto[];
  /** Ligação futura a runs filhos (runId do índice global) */
  childRunIds: string[];
  git?: WorkspaceGitDto | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceRunListResponse = {
  ok: true;
  data: WorkspaceRunDto[];
};
