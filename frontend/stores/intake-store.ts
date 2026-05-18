import { create } from "zustand";
import type { IntakeUiPhase } from "@/lib/runtime/intake/intake-types";
import type { StructuredPreRunError } from "@/lib/runtime/intake/pre-run-error";

type IntakeStore = {
  uiPhase: IntakeUiPhase;
  taskDraft: string;
  lastError: string | null;
  lastPreRunError: StructuredPreRunError | null;
  openClarificationOnRunId: string | null;
  recentTaskHints: string[];
  taskByRunId: Record<string, string>;
  setUiPhase: (p: IntakeUiPhase) => void;
  setTaskDraft: (t: string) => void;
  setLastError: (e: string | null) => void;
  setLastPreRunError: (e: StructuredPreRunError | null) => void;
  requestClarificationBootstrap: (runId: string) => void;
  consumeClarificationBootstrap: () => string | null;
  pushRecentHint: (task: string) => void;
  rememberTaskForRun: (runKey: string, task: string) => void;
  resetSubmission: () => void;
};

const MAX_HINTS = 6;

export const useIntakeStore = create<IntakeStore>((set, get) => ({
  uiPhase: "idle",
  taskDraft: "",
  lastError: null,
  lastPreRunError: null,
  openClarificationOnRunId: null,
  recentTaskHints: [],
  taskByRunId: {},
  setUiPhase: (p) => set({ uiPhase: p }),
  setTaskDraft: (t) => set({ taskDraft: t }),
  setLastError: (e) => set({ lastError: e }),
  setLastPreRunError: (e) => set({ lastPreRunError: e }),
  requestClarificationBootstrap: (runId) =>
    set({ openClarificationOnRunId: runId }),
  consumeClarificationBootstrap: () => {
    const id = get().openClarificationOnRunId;
    if (id) set({ openClarificationOnRunId: null });
    return id;
  },
  pushRecentHint: (task) => {
    const line = task.trim().slice(0, 200);
    if (!line) return;
    set((s) => {
      const next = [line, ...s.recentTaskHints.filter((h) => h !== line)].slice(
        0,
        MAX_HINTS,
      );
      return { recentTaskHints: next };
    });
  },
  rememberTaskForRun: (runKey, task) => {
    const key = runKey.trim();
    const text = task.trim();
    if (!key || !text) return;
    set((s) => ({
      taskByRunId: { ...s.taskByRunId, [key]: text },
    }));
  },
  resetSubmission: () =>
    set({ uiPhase: "idle", lastError: null, lastPreRunError: null }),
}));
