"use client";

import { useRunSummary } from "@/hooks/use-run-summary";
import { useIntakeStore } from "@/stores/intake-store";

/** Texto original do pedido da atividade (metadata do job ou sessão de criação). */
export function useRunTaskInput(
  projectId: string | null,
  runId: string | null,
): string | null {
  const summary = useRunSummary(projectId, runId);
  const runKey = summary?.runId ?? summary?.id ?? runId;
  const fromStore = useIntakeStore((s) =>
    runKey ? s.taskByRunId[runKey] : undefined,
  );

  const fromSummary = summary?.taskInput?.trim();
  if (fromSummary) return fromSummary;

  const fromSession = fromStore?.trim();
  if (fromSession) return fromSession;

  return null;
}
