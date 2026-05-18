import type { UseQueryResult } from "@tanstack/react-query";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunsQueryResult } from "@/hooks/use-runs";
import { dedupeRunSummariesByRunId } from "@/lib/runtime/shell/dedupe-run-summaries";

/**
 * Extrai summaries para a sidebar; só aceita payload runtime válido.
 */
export function pickRunSummaries(
  query: UseQueryResult<RunsQueryResult> | undefined,
): RunSummaryDto[] {
  if (!query?.data || query.data.source !== "runtime") return [];
  return dedupeRunSummariesByRunId(query.data.summaries);
}
