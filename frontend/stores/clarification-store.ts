import { create } from "zustand";

type ClarificationStore = {
  openStrategyOnRunId: string | null;
  requestStrategyBootstrap: (runId: string) => void;
  consumeStrategyBootstrap: () => string | null;
};

export const useClarificationStore = create<ClarificationStore>((set, get) => ({
  openStrategyOnRunId: null,
  requestStrategyBootstrap: (runId) => set({ openStrategyOnRunId: runId }),
  consumeStrategyBootstrap: () => {
    const id = get().openStrategyOnRunId;
    if (id) set({ openStrategyOnRunId: null });
    return id;
  },
}));

export function shouldOpenStrategyTab(
  runtimePhase: string | null | undefined,
  phase2Status: string | null | undefined,
): boolean {
  const p = String(runtimePhase || "");
  const s = String(phase2Status || "");
  return (
    p === "ready_for_execution" ||
    p === "strategy_pending" ||
    p === "approved" ||
    s === "ready_for_execution"
  );
}
