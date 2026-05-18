import type { RunSummaryDto, RuntimeEventDto } from "@/lib/api/runtime-types";

/**
 * Evento pertence ao run seleccionado (job id e/ou run id alinhados com o cartão da sidebar).
 */
export function eventBelongsToRunSelection(
  ev: RuntimeEventDto,
  selectedRunId: string | null,
  summary: RunSummaryDto | null,
): boolean {
  if (!selectedRunId) return false;
  const job = summary?.id ?? null;
  const run = summary?.runId ?? null;

  if (run && ev.runId && ev.runId !== run) {
    return false;
  }

  if (ev.jobId && (ev.jobId === selectedRunId || (job && ev.jobId === job))) {
    return true;
  }
  if (ev.runId && (ev.runId === selectedRunId || (run && ev.runId === run))) {
    return true;
  }
  return false;
}
