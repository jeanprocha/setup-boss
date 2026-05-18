import { runtimeGetJson, runtimePostJson } from "@/lib/api/client";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import type { OperationalReviewSessionDto } from "./operational-review-types.ts";

function mapHitl(raw: Record<string, unknown>) {
  const st = String(raw.status || "pending");
  const status =
    st === "confirmed" || st === "adjustment_requested" ? st : "pending";
  return {
    status: status as OperationalReviewSessionDto["hitl"]["status"],
    operatorNotes: raw.operatorNotes != null ? String(raw.operatorNotes) : "",
    createdAt: raw.createdAt != null ? String(raw.createdAt) : null,
    confirmedAt: raw.confirmedAt != null ? String(raw.confirmedAt) : null,
    adjustmentRequestedAt:
      raw.adjustmentRequestedAt != null
        ? String(raw.adjustmentRequestedAt)
        : null,
  };
}

export async function fetchOperationalReviewSession(
  runKey: string,
): Promise<OperationalReviewSessionDto | null> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimeGetJson<{ ok?: boolean; data?: Record<string, unknown> }>(
      `/runs/${enc}/operational-review`,
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

export type OperationalReviewMutationResult = {
  ok: boolean;
  message: string | null;
  hitl: OperationalReviewSessionDto["hitl"] | null;
  executeWarning: string | null;
};

export async function postOperationalReviewConfirm(
  runKey: string,
  notes?: string,
): Promise<OperationalReviewMutationResult> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimePostJson<{
    ok?: boolean;
    data?: Record<string, unknown>;
    error?: { message?: string };
  }>(`/runs/${enc}/operational-review/confirm`, { notes: notes ?? "" }, {
    timeoutMs: 20_000,
  });
  if (!j.ok) {
    return {
      ok: false,
      message: j.error?.message ?? "Não foi possível confirmar o review.",
      hitl: null,
      executeWarning: null,
    };
  }
  const hitl =
    j.data?.hitl && typeof j.data.hitl === "object"
      ? mapHitl(j.data.hitl as Record<string, unknown>)
      : null;
  return {
    ok: true,
    message: null,
    hitl,
    executeWarning: null,
  };
}

export async function postOperationalReviewRequestAdjustment(
  runKey: string,
  notes: string,
): Promise<OperationalReviewMutationResult> {
  const enc = encodeURIComponent(runKey);
  const j = await runtimePostJson<{
    ok?: boolean;
    data?: Record<string, unknown>;
    message?: string | null;
    error?: { message?: string };
  }>(
    `/runs/${enc}/operational-review/request-adjustment`,
    { notes },
    { timeoutMs: 30_000 },
  );
  if (!j.ok) {
    return {
      ok: false,
      message: j.error?.message ?? "Não foi possível solicitar ajuste.",
      hitl: null,
      executeWarning: null,
    };
  }
  const hitl =
    j.data?.hitl && typeof j.data.hitl === "object"
      ? mapHitl(j.data.hitl as Record<string, unknown>)
      : null;
  const exec =
    j.data?.execute && typeof j.data.execute === "object"
      ? (j.data.execute as Record<string, unknown>)
      : null;
  const executeWarning =
    exec && exec.ok === false && exec.message != null
      ? String(exec.message)
      : j.message != null
        ? String(j.message)
        : null;
  return {
    ok: true,
    message: null,
    hitl,
    executeWarning,
  };
}
