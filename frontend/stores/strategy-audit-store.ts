import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";

export type StrategyAuditKind =
  | "strategy_started"
  | "decomposition_completed"
  | "recommendation_generated"
  | "subtasks_planned"
  | "execution_ordering_ready"
  | "strategy_approved";

export type StrategyAuditEntry = {
  id: string;
  kind: StrategyAuditKind;
  message: string;
  tsIso: string;
  jobId: string | null;
  runId: string | null;
  severity: RuntimeEventDto["severity"];
};

type State = {
  entries: StrategyAuditEntry[];
  push: (e: Omit<StrategyAuditEntry, "id" | "tsIso">) => void;
};

let seq = 0;

export const useStrategyAuditStore = create<State>((set) => ({
  entries: [],
  push: (e) => {
    const entry: StrategyAuditEntry = {
      ...e,
      id: `ui-strategy-${++seq}`,
      tsIso: new Date().toISOString(),
    };
    set((s) => ({ entries: [...s.entries, entry].slice(-40) }));
  },
}));

export function strategyAuditToRuntimeEvent(
  e: StrategyAuditEntry,
): RuntimeEventDto {
  const d = new Date(e.tsIso);
  return {
    id: e.id,
    tsIso: e.tsIso,
    ts: d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    channel: "orchestrator",
    message: `[strategy:${e.kind}] ${e.message}`,
    severity: e.severity,
    type: e.kind,
    jobId: e.jobId,
    runId: e.runId,
    phaseHint: "strategy",
    payload: { kind: e.kind },
  };
}

/** Sementes audit para corridas mock (timeline/stream). */
export function seedStrategyAuditForRun(
  runId: string,
  jobId: string | null,
  phase: string,
): void {
  const store = useStrategyAuditStore.getState();
  const base = { jobId, runId, severity: "info" as const };
  if (phase === "strategy_generating") {
    store.push({
      ...base,
      kind: "strategy_started",
      message: "Strategy runtime iniciado — decomposição em curso.",
    });
    return;
  }
  store.push({
    ...base,
    kind: "strategy_started",
    message: "Strategy runtime iniciado.",
  });
  store.push({
    ...base,
    kind: "decomposition_completed",
    message: "Decomposição de subtasks concluída.",
  });
  store.push({
    ...base,
    kind: "recommendation_generated",
    message: "Recomendação IA materializada (ai-strategy).",
  });
  store.push({
    ...base,
    kind: "subtasks_planned",
    message: "Subtasks planeadas em strategy/subtasks/.",
  });
  store.push({
    ...base,
    kind: "execution_ordering_ready",
    message: "Ordem de execução pronta (execution-order).",
  });
  if (phase === "ready_for_execution" || phase === "strategy_approved") {
    store.push({
      ...base,
      kind: "strategy_approved",
      message: "Strategy aprovada — handoff para execution.",
      severity: "info",
    });
  }
}
