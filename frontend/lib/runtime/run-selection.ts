/** Chave estável para seleção de atividade (persistência + match na lista). */
export function runSelectionKey(run: {
  id: string;
  runId: string | null;
}): string {
  const rid = run.runId?.trim();
  return rid || run.id;
}

export function runMatchesSelectionKey(
  run: { id: string; runId: string | null },
  key: string | null,
): boolean {
  if (!key) return false;
  if (run.id === key) return true;
  const rid = run.runId?.trim();
  if (rid && rid === key) return true;
  return runSelectionKey(run) === key;
}

/** Chave para GET /runs/... só quando o summary existe na lista actual. */
export function resolvedRunFetchKey(
  summary: { runId: string | null; id: string } | null,
  selectedRunId: string | null,
): string | null {
  if (!summary) return null;
  return summary.runId ?? summary.id ?? selectedRunId;
}
