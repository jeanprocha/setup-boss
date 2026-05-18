import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ExecutionStepIconName } from "@/lib/runtime/execution/execution-step-catalog";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import type {
  ShellReconcileNotice,
  ShellReconcileResult,
} from "@/lib/runtime/shell/mission-shell-reconciliation";
import { sanitizeMissionShellCrossSelection } from "@/lib/runtime/shell/mission-shell-selection-sanitize";
import type { WorkspaceRunDto } from "@/lib/api/workspace-run-types";
import {
  isWorkspaceRunOperationalPhase,
  resolveWorkspacePlanningSelection,
  type WorkspacePlanningSelection,
} from "@/lib/workspace/workspace-run-lifecycle";

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function stepNavItemsEqual(a: readonly StepNavItem[], b: readonly StepNavItem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.navKey !== y.navKey ||
      x.order !== y.order ||
      x.scrollTargetId !== y.scrollTargetId ||
      x.title !== y.title ||
      x.shortDescription !== y.shortDescription ||
      x.operationalStatus !== y.operationalStatus ||
      x.iconName !== y.iconName
    ) {
      return false;
    }
  }
  return true;
}

/** Item da timeline operacional (painel direito). */
export type StepNavItem = {
  navKey: string;
  order: number;
  scrollTargetId: string | null;
  title: string;
  shortDescription: string;
  operationalStatus: OperationalStepStatus;
  iconName: ExecutionStepIconName;
};

export type { RightPanelTab } from "@/stores/mission-layout-store";

export type MainWorkspaceView = "mission" | "connections";

type MissionShellState = {
  timelineNavHighlightIndex: number;
  stepNavItems: StepNavItem[];
  newActivityFlow: boolean;
  mainWorkspaceView: MainWorkspaceView;
  selectedProjectId: string | null;
  selectedRunId: string | null;
  /** SetupWorkspace (Fase F) */
  selectedWorkspaceId: string | null;
  selectedWorkspaceRunId: string | null;
  expandedWorkspaceIds: string[];
  /** Projetos com lista de atividades expandida na sidebar */
  expandedProjectIds: string[];
  selectedEvidenceArtifactId: string | null;
  bottomPanelHeightPx: number;
  /** Aviso UX após limpeza de seleção stale (não persistido). */
  staleSelectionNotice: ShellReconcileNotice | null;
  setTimelineNavHighlightIndex: (n: number) => void;
  setStepNavItems: (items: StepNavItem[]) => void;
  beginNewActivityForProject: (projectId: string) => void;
  beginNewActivityForWorkspace: (workspaceId: string) => void;
  /** Pós POST /runs — selecciona a corrida e sai do fluxo “nova atividade”. */
  commitNewActivityRun: (projectId: string, runKey: string) => void;
  /** Pós POST /workspace-runs — mantém contexto do workspace + run de planeamento. */
  commitNewActivityWorkspaceRun: (
    workspaceId: string,
    workspaceRunId: string,
    planning?: WorkspacePlanningSelection | null,
  ) => void;
  /** Selecciona atividade do workspace (planeamento → RunViewShell; operacional → shell Git/minis). */
  activateWorkspaceRunSelection: (
    workspaceId: string,
    run: WorkspaceRunDto,
  ) => void;
  setSelectedProject: (id: string | null) => void;
  setSelectedRun: (id: string | null) => void;
  setSelectedWorkspace: (workspaceId: string | null) => void;
  setSelectedWorkspaceRun: (
    workspaceRunId: string | null,
    workspaceId?: string | null,
  ) => void;
  toggleWorkspaceExpanded: (workspaceId: string) => void;
  toggleProjectExpanded: (projectId: string) => void;
  ensureProjectExpanded: (projectId: string) => void;
  setSelectedEvidenceArtifactId: (id: string | null) => void;
  setBottomPanelHeightPx: (px: number) => void;
  setMainWorkspaceView: (view: MainWorkspaceView) => void;
  applyShellReconciliation: (result: ShellReconcileResult) => void;
  dismissStaleSelectionNotice: () => void;
};

export const useMissionShellStore = create<MissionShellState>()(
  persist(
    (set) => ({
      timelineNavHighlightIndex: 0,
      stepNavItems: [],
      newActivityFlow: false,
      mainWorkspaceView: "mission",
      selectedProjectId: null,
      selectedRunId: null,
      selectedWorkspaceId: null,
      selectedWorkspaceRunId: null,
      expandedWorkspaceIds: [],
      expandedProjectIds: [],
      selectedEvidenceArtifactId: null,
      bottomPanelHeightPx: 168,
      staleSelectionNotice: null,
      setTimelineNavHighlightIndex: (n) =>
        set((s) => {
          const next = Math.max(0, Math.floor(n));
          return s.timelineNavHighlightIndex === next
            ? s
            : { timelineNavHighlightIndex: next };
        }),
      setStepNavItems: (items) =>
        set((s) =>
          stepNavItemsEqual(s.stepNavItems, items) ? s : { stepNavItems: items },
        ),
      beginNewActivityForProject: (projectId) =>
        set((s) => ({
          selectedProjectId: projectId,
          selectedRunId: null,
          selectedWorkspaceId: null,
          selectedWorkspaceRunId: null,
          selectedEvidenceArtifactId: null,
          newActivityFlow: true,
          staleSelectionNotice: null,
          expandedProjectIds: s.expandedProjectIds.includes(projectId)
            ? s.expandedProjectIds
            : [...s.expandedProjectIds, projectId],
        })),
      beginNewActivityForWorkspace: (workspaceId) =>
        set((s) => ({
          selectedWorkspaceId: workspaceId,
          selectedWorkspaceRunId: null,
          selectedProjectId: null,
          selectedRunId: null,
          selectedEvidenceArtifactId: null,
          newActivityFlow: true,
          staleSelectionNotice: null,
          mainWorkspaceView: "mission",
          expandedWorkspaceIds: s.expandedWorkspaceIds.includes(workspaceId)
            ? s.expandedWorkspaceIds
            : [...s.expandedWorkspaceIds, workspaceId],
        })),
      commitNewActivityRun: (projectId, runKey) =>
        set((s) => ({
          selectedProjectId: projectId,
          selectedRunId: runKey,
          selectedWorkspaceId: null,
          selectedWorkspaceRunId: null,
          selectedEvidenceArtifactId: null,
          newActivityFlow: false,
          staleSelectionNotice: null,
          expandedProjectIds: s.expandedProjectIds.includes(projectId)
            ? s.expandedProjectIds
            : [...s.expandedProjectIds, projectId],
        })),
      commitNewActivityWorkspaceRun: (workspaceId, workspaceRunId, planning) =>
        set((s) => {
          const planningRunId = planning?.runId?.trim() || null;
          const planningProjectId = planning?.projectId?.trim() || null;
          return {
            selectedWorkspaceId: workspaceId,
            selectedWorkspaceRunId: workspaceRunId,
            selectedProjectId: planningProjectId,
            selectedRunId: planningRunId,
            selectedEvidenceArtifactId: null,
            newActivityFlow: false,
            staleSelectionNotice: null,
            mainWorkspaceView: "mission",
            expandedWorkspaceIds: s.expandedWorkspaceIds.includes(workspaceId)
              ? s.expandedWorkspaceIds
              : [...s.expandedWorkspaceIds, workspaceId],
            expandedProjectIds:
              planningProjectId &&
              !s.expandedProjectIds.includes(planningProjectId)
                ? [...s.expandedProjectIds, planningProjectId]
                : s.expandedProjectIds,
          };
        }),
      activateWorkspaceRunSelection: (workspaceId, run) =>
        set((s) => {
          const planning = resolveWorkspacePlanningSelection(run);
          return {
            selectedWorkspaceId: workspaceId,
            selectedWorkspaceRunId: run.workspaceRunId,
            selectedProjectId: planning?.projectId ?? s.selectedProjectId,
            selectedRunId: planning?.runId ?? s.selectedRunId,
            selectedEvidenceArtifactId: null,
            newActivityFlow: false,
            staleSelectionNotice: null,
            mainWorkspaceView: "mission",
            expandedWorkspaceIds: s.expandedWorkspaceIds.includes(workspaceId)
              ? s.expandedWorkspaceIds
              : [...s.expandedWorkspaceIds, workspaceId],
            expandedProjectIds:
              planning?.projectId &&
              !s.expandedProjectIds.includes(planning.projectId)
                ? [...s.expandedProjectIds, planning.projectId]
                : s.expandedProjectIds,
          };
        }),
      setSelectedProject: (id) =>
        set((s) => {
          const sameProject = id === s.selectedProjectId;
          return {
            selectedProjectId: id,
            selectedRunId: sameProject ? s.selectedRunId : null,
            selectedWorkspaceId: null,
            selectedWorkspaceRunId: null,
            selectedEvidenceArtifactId: null,
            newActivityFlow: false,
            staleSelectionNotice: null,
            expandedProjectIds:
              id && !s.expandedProjectIds.includes(id)
                ? [...s.expandedProjectIds, id]
                : s.expandedProjectIds,
          };
        }),
      setSelectedWorkspace: (workspaceId) =>
        set((s) => ({
          selectedWorkspaceId: workspaceId,
          selectedWorkspaceRunId: null,
          selectedProjectId: workspaceId ? null : s.selectedProjectId,
          selectedRunId: workspaceId ? null : s.selectedRunId,
          newActivityFlow: false,
          selectedEvidenceArtifactId: null,
          staleSelectionNotice: null,
          expandedWorkspaceIds:
            workspaceId && !s.expandedWorkspaceIds.includes(workspaceId)
              ? [...s.expandedWorkspaceIds, workspaceId]
              : s.expandedWorkspaceIds,
        })),
      setSelectedWorkspaceRun: (workspaceRunId, workspaceId) =>
        set((s) => {
          const wsId =
            workspaceId !== undefined ? workspaceId : s.selectedWorkspaceId;
          return {
            selectedWorkspaceRunId: workspaceRunId,
            selectedWorkspaceId: wsId,
            selectedProjectId: workspaceRunId ? null : s.selectedProjectId,
            selectedRunId: workspaceRunId ? null : s.selectedRunId,
            newActivityFlow: false,
            selectedEvidenceArtifactId: null,
            mainWorkspaceView: "mission",
            staleSelectionNotice: null,
            expandedWorkspaceIds:
              wsId && !s.expandedWorkspaceIds.includes(wsId)
                ? [...s.expandedWorkspaceIds, wsId]
                : s.expandedWorkspaceIds,
          };
        }),
      toggleWorkspaceExpanded: (workspaceId) =>
        set((s) => ({
          expandedWorkspaceIds: s.expandedWorkspaceIds.includes(workspaceId)
            ? s.expandedWorkspaceIds.filter((x) => x !== workspaceId)
            : [...s.expandedWorkspaceIds, workspaceId],
        })),
      toggleProjectExpanded: (projectId) =>
        set((s) => ({
          expandedProjectIds: s.expandedProjectIds.includes(projectId)
            ? s.expandedProjectIds.filter((x) => x !== projectId)
            : [...s.expandedProjectIds, projectId],
        })),
      ensureProjectExpanded: (projectId) =>
        set((s) =>
          s.expandedProjectIds.includes(projectId)
            ? s
            : {
                expandedProjectIds: [...s.expandedProjectIds, projectId],
              },
        ),
      setSelectedRun: (id) =>
        set({
          selectedRunId: id,
          selectedWorkspaceRunId: null,
          selectedWorkspaceId: null,
          selectedEvidenceArtifactId: null,
          staleSelectionNotice: null,
          ...(id ? { newActivityFlow: false } : {}),
        }),
      setSelectedEvidenceArtifactId: (id) =>
        set({ selectedEvidenceArtifactId: id }),
      setBottomPanelHeightPx: (px) =>
        set({ bottomPanelHeightPx: clamp(px, 120, 420) }),
      setMainWorkspaceView: (view) => set({ mainWorkspaceView: view }),
      applyShellReconciliation: (result) =>
        set((s) => {
          if (!result.changed && !result.notice) return s;
          return {
            selectedProjectId: result.selectedProjectId,
            selectedRunId: result.selectedRunId,
            expandedProjectIds: result.expandedProjectIds,
            selectedEvidenceArtifactId: null,
            newActivityFlow: result.selectedProjectId
              ? result.selectedRunId
                ? false
                : s.newActivityFlow
              : false,
            staleSelectionNotice: result.notice ?? s.staleSelectionNotice,
          };
        }),
      dismissStaleSelectionNotice: () => set({ staleSelectionNotice: null }),
    }),
    {
      name: "setup-boss-mission-shell",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        selectedProjectId: s.selectedProjectId,
        selectedRunId: s.selectedRunId,
        selectedWorkspaceId: s.selectedWorkspaceId,
        selectedWorkspaceRunId: s.selectedWorkspaceRunId,
        expandedWorkspaceIds: s.expandedWorkspaceIds,
        expandedProjectIds: s.expandedProjectIds,
        bottomPanelHeightPx: s.bottomPanelHeightPx,
      }),
      migrate: (persisted, fromVersion) => {
        const p = persisted as Partial<MissionShellState>;
        const base: Partial<MissionShellState> = {
          ...p,
          expandedProjectIds: Array.isArray(p.expandedProjectIds)
            ? p.expandedProjectIds.filter(
                (id): id is string => typeof id === "string" && id.length > 0,
              )
            : p.selectedProjectId
              ? [p.selectedProjectId]
              : [],
        };
        if (fromVersion < 2) {
          return {
            ...base,
            selectedProjectId: null,
            selectedRunId: null,
          };
        }
        const sanitized = sanitizeMissionShellCrossSelection({
          selectedProjectId:
            typeof base.selectedProjectId === "string" ? base.selectedProjectId : null,
          selectedRunId:
            typeof base.selectedRunId === "string" ? base.selectedRunId : null,
          selectedWorkspaceId:
            typeof base.selectedWorkspaceId === "string"
              ? base.selectedWorkspaceId
              : null,
          selectedWorkspaceRunId:
            typeof base.selectedWorkspaceRunId === "string"
              ? base.selectedWorkspaceRunId
              : null,
        });
        return {
          ...base,
          ...sanitized.value,
        } as MissionShellState;
      },
      skipHydration: true,
    },
  ),
);
