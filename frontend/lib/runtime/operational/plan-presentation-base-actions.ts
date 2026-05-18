import { runtimePutJson } from "@/lib/api/client";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";

const TIMEOUT_MS = 15_000;

export type PlanPresentationBaseSnapshotMeta = {
  schemaVersion: number;
  generatedAt: string;
  canonicalized: boolean;
  source?: string;
  planVersion: number;
};

/**
 * Persiste o plano v1 exibido na UI como fonte única para comentários no servidor.
 */
export async function persistPlanPresentationBaseSnapshot(
  runId: string,
  presentation: OperationalPlanPresentation,
): Promise<PlanPresentationBaseSnapshotMeta | null> {
  if (!runId?.trim() || !presentation?.hasContent) return null;

  const enc = encodeURIComponent(runId.trim());
  try {
    const res = await runtimePutJson<{
      ok?: boolean;
      data?: PlanPresentationBaseSnapshotMeta;
    }>(`/runs/${enc}/plan-presentation-base`, { presentation }, { timeoutMs: TIMEOUT_MS });

    return res?.data ?? null;
  } catch {
    return null;
  }
}
