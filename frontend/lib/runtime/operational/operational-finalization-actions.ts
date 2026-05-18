import { runtimeGetJson, runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import type { OperationalFinalizationSessionDto } from "./operational-finalization-types.ts";

function mapHitl(raw: Record<string, unknown>) {
  const st = String(raw.status || "pending");
  const status =
    st === "finalized" || st === "adjustment_requested" ? st : "pending";
  return {
    status: status as OperationalFinalizationSessionDto["hitl"]["status"],
    operatorNotes: raw.operatorNotes != null ? String(raw.operatorNotes) : "",
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
    finalizedAt: raw.finalizedAt != null ? String(raw.finalizedAt) : null,
    adjustmentRequestedAt:
      raw.adjustmentRequestedAt != null
        ? String(raw.adjustmentRequestedAt)
        : null,
  };
}

export async function fetchOperationalFinalizationSession(
  runKey: string,
): Promise<OperationalFinalizationSessionDto | null> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimeGetJson<{ ok?: boolean; data?: Record<string, unknown> }>(
      `/runs/${enc}/operational-finalization`,
      { timeoutMs: 12_000 },
    );
    if (!j?.ok || !j.data) return null;
    const d = j.data;
    return {
      runId: String(d.runId ?? runKey),
      hitl: mapHitl(
        d.hitl && typeof d.hitl === "object"
          ? (d.hitl as Record<string, unknown>)
          : {},
      ),
      reviewConfirmedAt:
        d.reviewConfirmedAt != null ? String(d.reviewConfirmedAt) : null,
      executionLifecyclePhase:
        d.executionLifecyclePhase != null
          ? String(d.executionLifecyclePhase)
          : null,
      source: "runtime",
    };
  } catch (e) {
    if (e instanceof RuntimeApiError && e.code === "http" && e.status === 409) {
      return null;
    }
    throw e;
  }
}

export type OperationalFinalizationMutationResult = {
  ok: boolean;
  message: string | null;
  hitl: OperationalFinalizationSessionDto["hitl"] | null;
};

export async function postOperationalFinalizationFinalize(
  runKey: string,
  notes?: string,
): Promise<OperationalFinalizationMutationResult> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimePostJson<{
    ok?: boolean;
    data?: Record<string, unknown>;
    error?: { message?: string };
  }>(`/runs/${enc}/operational-finalization/finalize`, { notes: notes ?? "" }, {
    timeoutMs: 20_000,
  });
  if (!j.ok) {
    return {
      ok: false,
      message: j.error?.message ?? "Não foi possível finalizar a atividade.",
      hitl: null,
    };
  }
  const hitl =
    j.data?.hitl && typeof j.data.hitl === "object"
      ? mapHitl(j.data.hitl as Record<string, unknown>)
      : null;
  return { ok: true, message: null, hitl };
}

export async function postOperationalFinalizationRequestAdjustment(
  runKey: string,
  notes: string,
): Promise<OperationalFinalizationMutationResult> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimePostJson<{
    ok?: boolean;
    data?: Record<string, unknown>;
    message?: string | null;
    error?: { message?: string };
  }>(
    `/runs/${enc}/operational-finalization/request-adjustment`,
    { notes },
    { timeoutMs: 20_000 },
  );
  if (!j.ok) {
    return {
      ok: false,
      message: j.error?.message ?? "Não foi possível solicitar ajuste final.",
      hitl: null,
    };
  }
  const hitl =
    j.data?.hitl && typeof j.data.hitl === "object"
      ? mapHitl(j.data.hitl as Record<string, unknown>)
      : null;
  return {
    ok: true,
    message: j.message != null ? String(j.message) : null,
    hitl,
  };
}
