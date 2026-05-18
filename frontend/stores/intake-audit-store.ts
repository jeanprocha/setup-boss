import { create } from "zustand";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type { IntakeUiPhase } from "@/lib/runtime/intake/intake-types";

export type IntakeAuditEntry = {
  id: string;
  runId: string;
  phase: IntakeUiPhase;
  message: string;
  tsIso: string;
};

type IntakeAuditState = {
  entries: IntakeAuditEntry[];
  push: (e: Omit<IntakeAuditEntry, "id" | "tsIso">) => void;
};

let seq = 0;

export const useIntakeAuditStore = create<IntakeAuditState>((set) => ({
  entries: [],
  push: (e) => {
    const entry: IntakeAuditEntry = {
      ...e,
      id: `intake-audit-${++seq}`,
      tsIso: new Date().toISOString(),
    };
    set((s) => ({ entries: [...s.entries, entry].slice(-32) }));
  },
}));

export function intakeAuditToRuntimeEvent(e: IntakeAuditEntry): RuntimeEventDto {
  const d = new Date(e.tsIso);
  const sev =
    e.phase === "failed" ? "error" : e.phase === "clarification_required" ? "warn" : "info";
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
    message: e.message,
    severity: sev,
    type: `intake_${e.phase}`,
    jobId: null,
    runId: e.runId,
    phaseHint: e.phase.includes("clarification") ? "clarify" : "intake",
    metadata: {
      source: "client",
      derivedFrom: "client-audit",
      notArtifactBacked: true,
    },
    payload: { phase: e.phase },
  };
}

export function seedIntakeAuditForRun(
  runId: string,
  initialState: IntakeUiPhase,
  clarificationRequired: boolean,
): void {
  const push = useIntakeAuditStore.getState().push;
  push({
    runId,
    phase: "creating_run",
    message: "Pedido de criação de corrida enviado ao runtime.",
  });
  push({
    runId,
    phase: "intake_running",
    message: "Intake concluído — artifacts phase1 disponíveis.",
  });
  if (clarificationRequired) {
    push({
      runId,
      phase: "clarification_required",
      message: "Clarificação inicializada — perguntas disponíveis.",
    });
  } else if (initialState === "clarification_ready") {
    push({
      runId,
      phase: "clarification_ready",
      message: "Plano refinado pronto para revisão operacional.",
    });
  }
}
