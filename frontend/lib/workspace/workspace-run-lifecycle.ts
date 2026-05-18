import type { WorkspaceRunDto } from "../api/workspace-run-types.ts";
import {
  parseWorkspaceGlobalSpec,
  type WorkspaceGlobalSpecV1,
} from "./workspace-global-spec.ts";

/** Fase operacional: mini-atividades materializadas (pós estratégia/OES). */
export function isWorkspaceRunOperationalPhase(
  run: Pick<WorkspaceRunDto, "miniActivities"> | null | undefined,
): boolean {
  return Boolean(run?.miniActivities?.length);
}

export type WorkspacePlanningSelection = {
  projectId: string;
  runId: string;
};

export function resolveWorkspacePlanningSelection(
  run: WorkspaceRunDto | null | undefined,
): WorkspacePlanningSelection | null {
  if (!run) return null;
  const spec = parseWorkspaceGlobalSpec(run.globalSpec);
  const fromSpec = planningFromGlobalSpec(spec);
  if (fromSpec) return fromSpec;
  if (
    !isWorkspaceRunOperationalPhase(run) &&
    run.childRunIds?.length === 1
  ) {
    const runId = run.childRunIds[0]?.trim();
    if (runId) {
      const projectId =
        spec?.projectIds?.[0]?.trim() ||
        run.miniActivities[0]?.targetProjectId?.trim() ||
        "";
      if (projectId) return { projectId, runId };
    }
  }
  return null;
}

function planningFromGlobalSpec(
  spec: WorkspaceGlobalSpecV1 | null,
): WorkspacePlanningSelection | null {
  if (!spec) return null;
  const runId = spec.planningRunId?.trim();
  const projectId =
    spec.planningProjectId?.trim() || spec.projectIds?.[0]?.trim() || "";
  if (!runId || !projectId) return null;
  return { projectId, runId };
}

export function mergePlanningIntoGlobalSpec(
  spec: WorkspaceGlobalSpecV1,
  planning: WorkspacePlanningSelection,
): WorkspaceGlobalSpecV1 {
  return {
    ...spec,
    planningRunId: planning.runId,
    planningProjectId: planning.projectId,
  };
}
