import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";

export type ClarificationAuditKind =
  | "clarification_requested"
  | "answers_submitted"
  | "refinement_generated"
  | "approval_requested"
  | "approved"
  | "rejected"
  | "refinement_requested";

export type ClarificationAuditEntry = {
  id: string;
  kind: ClarificationAuditKind;
  message: string;
  tsIso: string;
  jobId: string | null;
  runId: string | null;
  severity: RuntimeEventDto["severity"];
};

type State = {
  entries: ClarificationAuditEntry[];
  push: (e: Omit<ClarificationAuditEntry, "id" | "tsIso">) => void;
};

let seq = 0;

export const useClarificationAuditStore = create<State>((set) => ({
  entries: [],
  push: (e) => {
    const entry: ClarificationAuditEntry = {
      ...e,
      id: `ui-clarify-${++seq}`,
      tsIso: new Date().toISOString(),
    };
    set((s) => ({ entries: [...s.entries, entry].slice(-40) }));
  },
}));

export function clarificationAuditToRuntimeEvent(
  e: ClarificationAuditEntry,
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
    channel: "policy",
    message: `[hitl:${e.kind}] ${e.message}`,
    severity: e.severity,
    type: e.kind,
    jobId: e.jobId,
    runId: e.runId,
    phaseHint: "clarification",
    payload: { kind: e.kind, source: "hitl" },
  };
}
