import { create } from "zustand";
import type { WorkspaceRunSsePhase } from "@/lib/workspace/sse/workspace-run-sse-types";

type WorkspaceRunSseStore = {
  phase: WorkspaceRunSsePhase;
  lastError: string | null;
  setPhase: (phase: WorkspaceRunSsePhase) => void;
  setError: (msg: string | null) => void;
  reset: () => void;
};

export const useWorkspaceRunSseStore = create<WorkspaceRunSseStore>((set) => ({
  phase: "idle",
  lastError: null,
  setPhase: (phase) => set({ phase }),
  setError: (lastError) => set({ lastError }),
  reset: () => set({ phase: "idle", lastError: null }),
}));
