import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";

export type ExecutionAuditKind =
  | "execution_started"
  | "subtask_queued"
  | "subtask_running"
  | "review_started"
  | "review_rejected"
  | "review_completed"
  | "correction_started"
  | "correction_completed"
  | "retry_started"
  | "recovery_completed"
  | "execution_recovered"
  | "execution_completed"
  | "execution_failed";

export type ExecutionAuditEntry = {
  id: string;
  kind: ExecutionAuditKind;
  message: string;
  tsIso: string;
  jobId: string | null;
  runId: string | null;
  severity: RuntimeEventDto["severity"];
};

type State = {
  entries: ExecutionAuditEntry[];
  push: (e: Omit<ExecutionAuditEntry, "id" | "tsIso">) => void;
};

let seq = 0;

export const useExecutionAuditStore = create<State>((set) => ({
  entries: [],
  push: (e) => {
    const entry: ExecutionAuditEntry = {
      ...e,
      id: `ui-exec-${++seq}`,
      tsIso: new Date().toISOString(),
    };
    set((s) => ({ entries: [...s.entries, entry].slice(-48) }));
  },
}));

export function seedExecutionAuditForRun(
  runId: string,
  jobId: string | null,
  bundle: {
    lifecyclePhase: string;
    review: { status: string };
    retry: { active: boolean };
    correction: { status: string; generation: number };
    recovery: { status: string };
    blockers: { label: string }[];
  },
): void {
  const store = useExecutionAuditStore.getState();
  const base = { jobId, runId, severity: "info" as const };
  store.push({
    ...base,
    kind: "execution_started",
    message: "Execution runtime iniciado.",
  });
  store.push({
    ...base,
    kind: "subtask_running",
    message: "Subtask activa no executor.",
  });
  if (bundle.review.status === "rejected") {
    store.push({
      ...base,
      kind: "review_rejected",
      message: "Review rejeitado — correcção necessária.",
      severity: "warn",
    });
  }
  if (bundle.correction.status === "active" || bundle.correction.generation > 0) {
    store.push({
      ...base,
      kind: "correction_started",
      message: `Correcção g${bundle.correction.generation} iniciada.`,
      severity: "warn",
    });
  }
  if (bundle.retry.active) {
    store.push({
      ...base,
      kind: "retry_started",
      message: "Retry de subtask iniciado.",
      severity: "warn",
    });
  }
  if (bundle.recovery.status === "completed" || bundle.recovery.status === "in_progress") {
    store.push({
      ...base,
      kind: "recovery_completed",
      message: "Recovery de execução registado.",
    });
  }
  if (bundle.blockers.length > 0) {
    store.push({
      ...base,
      kind: "subtask_queued",
      message: `Bloqueio: ${bundle.blockers[0].label}`,
      severity: "warn",
    });
  }
  if (bundle.lifecyclePhase === "execution_completed") {
    store.push({
      ...base,
      kind: "execution_completed",
      message: "Execução concluída com sucesso.",
    });
  }
  if (bundle.lifecyclePhase === "execution_failed") {
    store.push({
      ...base,
      kind: "execution_failed",
      message: "Execução terminou em falha.",
      severity: "error",
    });
  }
}

export function executionAuditToRuntimeEvent(
  e: ExecutionAuditEntry,
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
    channel: "runtime",
    message: `[execution:${e.kind}] ${e.message}`,
    severity: e.severity,
    type: e.kind,
    jobId: e.jobId,
    runId: e.runId,
    phaseHint: "execution",
    payload: { kind: e.kind },
  };
}
