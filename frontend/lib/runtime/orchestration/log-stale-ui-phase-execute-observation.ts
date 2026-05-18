import { useUiDiagnosticsStore } from "@/stores/ui-diagnostics-store.ts";

const loggedRunKeys = new Set<string>();

/** Uma entrada por run quando fase técnica do job está stale mas artefactos liberam o gate de fase. */
export function logStaleUiPhaseExecuteBypass(opts: {
  runId: string;
  projectId?: string | null;
  phaseRaw: string;
  canExecute: boolean;
  blockReason?: string | null;
  operational: Record<string, string | null>;
}): void {
  const key = opts.runId.trim();
  if (!key || loggedRunKeys.has(key)) return;
  loggedRunKeys.add(key);

  const liberated = opts.canExecute
    ? "Execução liberada por artefatos operacionais (gate de fase ignorado)."
    : opts.blockReason
      ? `Gate de fase ignorado; bloqueio actual: ${opts.blockReason}.`
      : "Gate de fase ignorado; outros guards ainda aplicam-se.";

  useUiDiagnosticsStore.getState().append({
    level: opts.canExecute ? "INFO" : "WARN",
    category: "execution",
    message: `Fase técnica desatualizada (${opts.phaseRaw}) — ${liberated}`,
    detail: {
      runId: key,
      projectId: opts.projectId ?? null,
      event: "stale_ui_phase_execute_bypass",
      phaseRawPrevious: opts.phaseRaw,
      canExecute: opts.canExecute,
      blockReason: opts.blockReason ?? null,
      operational: opts.operational,
    },
  });
}

export function resetStaleUiPhaseExecuteLogSession(runId?: string | null): void {
  if (!runId) {
    loggedRunKeys.clear();
    return;
  }
  loggedRunKeys.delete(runId.trim());
}
