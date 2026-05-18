/**
 * Git agregado do WorkspaceRun (Fase E).
 */

export type WorkspaceGitProjectStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "skipped"
  | "failed";

export type WorkspaceGitAggregateStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "partial_failure"
  | "failed";

export type WorkspaceGitProjectDto = {
  projectId: string;
  baseBranch: string | null;
  activityBranch: string | null;
  gitStatus: WorkspaceGitProjectStatus | string;
  prepareBranchStatus: WorkspaceGitProjectStatus | string;
  lastGitEventAt: string | null;
  commitSha: string | null;
  prUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type WorkspaceGitDto = {
  activityBranch: string | null;
  status: WorkspaceGitAggregateStatus | string;
  preparedAt: string | null;
  projects: WorkspaceGitProjectDto[];
};

export type WorkspaceRunGitStatusResponse = {
  ok: true;
  data: {
    workspaceRunId: string;
    git: WorkspaceGitDto;
    ready: boolean;
  };
};

export type WorkspaceRunPrepareGitResponse = {
  ok: true;
  data: import("@/lib/api/workspace-run-types").WorkspaceRunDto;
  git?: WorkspaceGitDto;
  meta?: { idempotent?: boolean };
};
