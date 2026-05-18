/**
 * Qual painel central renderizar no Mission Control.
 * Project→Run tem prioridade sobre WorkspaceRun.
 */
export type CentralShellView = "project-run" | "workspace-run";

export function resolveCentralShellView(opts: {
  selectedRunId: string | null;
  selectedWorkspaceRunId: string | null;
  selectedWorkspaceId?: string | null;
}): CentralShellView {
  const runId = opts.selectedRunId?.trim() ?? "";
  const wsRunId = opts.selectedWorkspaceRunId?.trim() ?? "";
  const wsId = opts.selectedWorkspaceId?.trim() ?? "";
  if (runId) return "project-run";
  if (wsRunId || wsId) return "workspace-run";
  return "project-run";
}
