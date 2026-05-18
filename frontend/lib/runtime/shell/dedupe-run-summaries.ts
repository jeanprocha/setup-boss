import type { RunSummaryDto } from "@/lib/api/runtime-types";

/** Uma linha por runId na sidebar (API pode devolver jobs duplicados na fila). */
export function dedupeRunSummariesByRunId(
  summaries: RunSummaryDto[],
): RunSummaryDto[] {
  const seen = new Set<string>();
  const out: RunSummaryDto[] = [];
  for (const s of summaries) {
    const rid = s.runId?.trim();
    const key = rid || `job:${s.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
