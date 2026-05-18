import type { ProjectSummaryDto, RunSummaryDto } from "@/lib/api/runtime-types";
import { isProjectInRegistry } from "@/lib/runtime/intake/project-registry-validation";
import { runMatchesSelectionKey } from "@/lib/runtime/run-selection";

export type ShellReconcileNotice = "project_unavailable" | "run_unavailable";

export type ShellReconcileInput = {
  selectedProjectId: string | null;
  selectedRunId: string | null;
  expandedProjectIds: string[];
  projects: readonly ProjectSummaryDto[];
  runs: readonly RunSummaryDto[];
  /** Lista de projetos carregada com sucesso do runtime. */
  projectsReady: boolean;
  /** Lista de runs do projeto actual carregada (só quando projeto válido). */
  runsReady: boolean;
};

export type ShellReconcileResult = {
  selectedProjectId: string | null;
  selectedRunId: string | null;
  expandedProjectIds: string[];
  changed: boolean;
  notice: ShellReconcileNotice | null;
};

export function reconcileMissionShellSelection(
  input: ShellReconcileInput,
): ShellReconcileResult {
  let {
    selectedProjectId,
    selectedRunId,
    expandedProjectIds,
  } = input;
  let changed = false;
  let notice: ShellReconcileNotice | null = null;

  if (!input.projectsReady) {
    return {
      selectedProjectId,
      selectedRunId,
      expandedProjectIds,
      changed: false,
      notice: null,
    };
  }

  const validExpanded = expandedProjectIds.filter((id) =>
    isProjectInRegistry(id, input.projects),
  );
  if (validExpanded.length !== expandedProjectIds.length) {
    expandedProjectIds = validExpanded;
    changed = true;
  }

  if (
    selectedProjectId &&
    !isProjectInRegistry(selectedProjectId, input.projects)
  ) {
    return {
      selectedProjectId: null,
      selectedRunId: null,
      expandedProjectIds,
      changed: true,
      notice: "project_unavailable",
    };
  }

  if (!input.runsReady) {
    return {
      selectedProjectId,
      selectedRunId,
      expandedProjectIds,
      changed,
      notice: null,
    };
  }

  if (selectedRunId) {
    const runOk = input.runs.some((r) =>
      runMatchesSelectionKey(r, selectedRunId),
    );
    if (!runOk) {
      return {
        selectedProjectId,
        selectedRunId: null,
        expandedProjectIds,
        changed: true,
        notice: "run_unavailable",
      };
    }
  }

  return {
    selectedProjectId,
    selectedRunId,
    expandedProjectIds,
    changed,
    notice: null,
  };
}

/** Chave estável para evitar reconciliações repetidas sem mudança de dados. */
export function shellReconcileSignature(input: {
  projectsReady: boolean;
  runsReady: boolean;
  projectIds: string[];
  runKeys: string[];
  selectedProjectId: string | null;
  selectedRunId: string | null;
  expandedProjectIds: string[];
}): string {
  return JSON.stringify({
    p: input.projectsReady,
    r: input.runsReady,
    ids: input.projectIds,
    runs: input.runKeys,
    sp: input.selectedProjectId,
    sr: input.selectedRunId,
    ex: input.expandedProjectIds,
  });
}
