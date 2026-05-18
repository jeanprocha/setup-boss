/** Seleção cruzada projeto/run vs workspace (shell Mission Control). */
export type MissionShellCrossSelection = {
  selectedProjectId: string | null;
  selectedRunId: string | null;
  selectedWorkspaceId: string | null;
  selectedWorkspaceRunId: string | null;
};

/**
 * Resolve conflitos entre seleção Project→Run e WorkspaceRun.
 * Prioridade: fluxo Project→Run para o painel central.
 */
export function sanitizeMissionShellCrossSelection(
  sel: MissionShellCrossSelection,
): { value: MissionShellCrossSelection; changed: boolean } {
  let changed = false;
  let {
    selectedProjectId,
    selectedRunId,
    selectedWorkspaceId,
    selectedWorkspaceRunId,
  } = sel;

  if (selectedRunId && selectedWorkspaceRunId) {
    selectedWorkspaceRunId = null;
    selectedWorkspaceId = null;
    changed = true;
  }

  if (selectedProjectId && selectedWorkspaceRunId) {
    selectedWorkspaceRunId = null;
    selectedWorkspaceId = null;
    changed = true;
  }

  return {
    value: {
      selectedProjectId,
      selectedRunId,
      selectedWorkspaceId,
      selectedWorkspaceRunId,
    },
    changed,
  };
}
