import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type {
  RuntimeActionId,
  RuntimeActionOutcome,
} from "@/lib/runtime/actions/runtime-action-types";

export type RuntimeActionAuditEntry = {
  id: string;
  actionId: RuntimeActionId;
  outcome: RuntimeActionOutcome;
  message: string;
  tsIso: string;
  jobId: string | null;
  runId: string | null;
};

type AuditState = {
  entries: RuntimeActionAuditEntry[];
  pushEntry: (e: Omit<RuntimeActionAuditEntry, "id" | "tsIso">) => void;
  clearForRun: (runKey: string | null) => void;
};

let seq = 0;

export const useRuntimeActionAuditStore = create<AuditState>((set) => ({
  entries: [],
  pushEntry: (e) => {
    const entry: RuntimeActionAuditEntry = {
      ...e,
      id: `ui-action-${++seq}`,
      tsIso: new Date().toISOString(),
    };
    set((s) => ({
      entries: [...s.entries, entry].slice(-48),
    }));
  },
  clearForRun: () => {
    /* mantém histórico global curto — filtro por run no hook */
  },
}));

export function auditEntryToRuntimeEvent(
  e: RuntimeActionAuditEntry,
): RuntimeEventDto {
  const sev =
    e.outcome === "failed" || e.outcome === "timeout"
      ? "error"
      : e.outcome === "degraded" || e.outcome === "unsupported"
        ? "warn"
        : "info";
  const channel =
    e.actionId === "validate-integrity" ? "integrity" : "runtime";
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
    channel,
    message: `[ui:${e.actionId}] ${e.message}`,
    severity: sev,
    type: `ui_action_${e.actionId.replace(/-/g, "_")}`,
    jobId: e.jobId,
    runId: e.runId,
    phaseHint: null,
    payload: { actionId: e.actionId, outcome: e.outcome },
  };
}
