import { create } from "zustand";
import type { OrchestrationBootstrapDto } from "@/lib/runtime/orchestration/orchestration-types";
import { shouldOpenExecutionTab } from "@/lib/runtime/orchestration/orchestration-state";

type OrchestrationStore = {
  openExecutionOnRunId: string | null;
  lastBootstrap: OrchestrationBootstrapDto | null;
  requestExecutionBootstrap: (runId: string, bootstrap?: OrchestrationBootstrapDto) => void;
  consumeExecutionBootstrap: () => string | null;
  setLastBootstrap: (b: OrchestrationBootstrapDto | null) => void;
};

export const useOrchestrationStore = create<OrchestrationStore>((set, get) => ({
  openExecutionOnRunId: null,
  lastBootstrap: null,
  requestExecutionBootstrap: (runId, bootstrap) =>
    set({
      openExecutionOnRunId: runId,
      lastBootstrap: bootstrap ?? get().lastBootstrap,
    }),
  consumeExecutionBootstrap: () => {
    const id = get().openExecutionOnRunId;
    if (id) set({ openExecutionOnRunId: null });
    return id;
  },
  setLastBootstrap: (b) => set({ lastBootstrap: b }),
}));

export { shouldOpenExecutionTab };
