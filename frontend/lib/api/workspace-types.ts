/**
 * Contrato mínimo SetupWorkspace (Fase A) — sem UI nem WorkspaceRun.
 * Distinto de MainWorkspaceView no mission-shell-store (vista Mission Control).
 */

export type SetupWorkspaceDto = {
  workspaceId: string;
  name: string;
  description: string | null;
  projectIds: string[];
  primaryProjectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SetupWorkspaceListResponse = {
  ok: true;
  data: SetupWorkspaceDto[];
};

export type SetupWorkspaceMutationResponse = {
  ok: true;
  data: SetupWorkspaceDto;
};

export type SetupWorkspaceValidationError = {
  ok: false;
  error: "workspace_validation_failed";
  message: string;
  validation: Array<{
    code: string;
    message: string;
    field?: string;
    projectId?: string;
  }>;
};
