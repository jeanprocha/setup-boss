import { useUiDiagnosticsStore } from "@/stores/ui-diagnostics-store.ts";

const loggedKeys = new Set<string>();

function dedupeKey(runId: string, kind: string, extra?: string): string {
  return `${runId}:${kind}:${extra ?? ""}`;
}

type LogPayload = {
  runId: string;
  projectId?: string | null;
  kind:
    | "evaluated"
    | "blocked"
    | "started"
    | "enqueued"
    | "failed";
  canExecute?: boolean;
  blockReason?: string | null;
  blockMessage?: string | null;
  expectedBranch?: string | null;
  currentBranch?: string | null;
  errorMessage?: string | null;
};

function appendOperationalLog(payload: LogPayload, level: "INFO" | "WARN" | "ERROR"): void {
  const titles: Record<LogPayload["kind"], string> = {
    evaluated: "Execução automática avaliada",
    blocked: "Execução automática bloqueada",
    started: "Execução automática iniciada",
    enqueued: "Execução enfileirada",
    failed: "Falha ao iniciar execução",
  };

  const shortByKind: Record<LogPayload["kind"], string> = {
    evaluated: payload.canExecute
      ? "Condições satisfeitas — a iniciar execução."
      : `Bloqueada (${payload.blockReason ?? "indisponível"}).`,
    blocked: payload.blockMessage?.trim() || `Motivo: ${payload.blockReason ?? "—"}`,
    started: "Pedido de execução enviado ao runtime.",
    enqueued: "Execução registada pelo runtime.",
    failed: payload.errorMessage?.trim() || "O pedido de execução falhou.",
  };

  useUiDiagnosticsStore.getState().append({
    level,
    category: "execution",
    message: `${titles[payload.kind]} — ${shortByKind[payload.kind]}`,
    detail: {
      runId: payload.runId,
      projectId: payload.projectId ?? null,
      event: `execution_auto_${payload.kind}`,
      canExecute: payload.canExecute ?? null,
      blockReason: payload.blockReason ?? null,
      expectedBranch: payload.expectedBranch ?? null,
      currentBranch: payload.currentBranch ?? null,
      ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
    },
  });
}

/** Uma linha «avaliada» por run quando entra na janela de auto-start. */
export function logExecutionAutoStartEvaluated(opts: {
  runId: string;
  projectId?: string | null;
  canExecute: boolean;
  blockReason?: string | null;
  blockMessage?: string | null;
  expectedBranch?: string | null;
  currentBranch?: string | null;
}): void {
  const key = dedupeKey(opts.runId, "evaluated");
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);

  appendOperationalLog(
    {
      runId: opts.runId,
      projectId: opts.projectId,
      kind: "evaluated",
      canExecute: opts.canExecute,
      blockReason: opts.blockReason,
      blockMessage: opts.blockMessage,
      expectedBranch: opts.expectedBranch,
      currentBranch: opts.currentBranch,
    },
    opts.canExecute ? "INFO" : "WARN",
  );

  if (!opts.canExecute) {
    logExecutionAutoStartBlocked(opts);
  }
}

/** Bloqueio operacional (dedupe por run + motivo). */
export function logExecutionAutoStartBlocked(opts: {
  runId: string;
  projectId?: string | null;
  blockReason?: string | null;
  blockMessage?: string | null;
  expectedBranch?: string | null;
  currentBranch?: string | null;
}): void {
  const key = dedupeKey(
    opts.runId,
    "blocked",
    opts.blockReason ?? "unknown",
  );
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);

  appendOperationalLog(
    {
      runId: opts.runId,
      projectId: opts.projectId,
      kind: "blocked",
      canExecute: false,
      blockReason: opts.blockReason,
      blockMessage: opts.blockMessage,
      expectedBranch: opts.expectedBranch,
      currentBranch: opts.currentBranch,
    },
    "WARN",
  );
}

export function logExecutionAutoStartStarted(opts: {
  runId: string;
  projectId?: string | null;
}): void {
  const key = dedupeKey(opts.runId, "started");
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);
  appendOperationalLog(
    { runId: opts.runId, projectId: opts.projectId, kind: "started" },
    "INFO",
  );
}

export function logExecutionAutoStartFailed(opts: {
  runId: string;
  projectId?: string | null;
  errorMessage: string;
}): void {
  appendOperationalLog(
    {
      runId: opts.runId,
      projectId: opts.projectId,
      kind: "failed",
      errorMessage: opts.errorMessage,
    },
    "ERROR",
  );
}

export function resetExecutionAutoStartLogSession(runId?: string | null): void {
  if (!runId) {
    loggedKeys.clear();
    return;
  }
  for (const k of loggedKeys) {
    if (k.startsWith(`${runId}:`)) loggedKeys.delete(k);
  }
}
