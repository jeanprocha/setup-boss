/**
 * Schema miniActivity (Fase C) — vínculo preparatório com runs filhos.
 */

export type MiniActivityStatus =
  | "pending"
  | "ready"
  | "running"
  | "waiting_user_action"
  | "failed"
  | "completed"
  | "skipped"
  | "cancelled";

export type MiniActivityDto = {
  miniActivityId: string;
  order: number;
  title: string;
  description: string | null;
  targetProjectId: string;
  status: MiniActivityStatus;
  /** runId no índice global (.setup-boss/runs) — opcional até criação do run filho */
  runId: string | null;
  dependsOnMiniActivityIds: string[];
  createdAt: string;
  updatedAt: string;
};

/** Campos opcionais no índice global de run (snake_case no JSON persistido). */
export type RunIndexWorkspaceLinkDto = {
  workspace_run_id?: string;
  mini_activity_id?: string;
};
