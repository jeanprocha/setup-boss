import { runtimeGetJson, runtimePostJson } from "@/lib/api/client";
import { mapApiClarificationBundle } from "@/lib/runtime/clarification/clarification-adapters";
import type {
  ClarificationActionResult,
  ClarificationBundleDto,
  ClarificationMutationDto,
  ClarificationRuntimePhase,
  SubmitAnswersPayload,
} from "@/lib/runtime/clarification/clarification-types";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  formatRunReadModelConflictReason,
  isRunReadModelConflictError,
} from "@/lib/runtime/run-read-model-http";

const MUTATION_TIMEOUT_MS = 45_000;

type ActionJson = {
  ok?: boolean;
  data?: {
    message?: string;
    phase2Status?: string | null;
    runtimePhase?: string | null;
    runtimeState?: string | null;
    nextPhase?: string | null;
    transitionedAt?: string | null;
    idempotent?: boolean;
    session?: Record<string, unknown> | null;
    refinement?: {
      available?: boolean;
      executionReadiness?: string;
    } | null;
    approvalReadiness?: boolean | null;
    updatedAt?: string | null;
  };
  error?: { code?: string; message?: string };
};

function asRuntimePhase(v: unknown): ClarificationRuntimePhase | null {
  const s = v != null ? String(v) : "";
  const allowed: ClarificationRuntimePhase[] = [
    "clarification_required",
    "clarification_empty",
    "waiting_answers",
    "refining",
    "refinement_ready",
    "awaiting_approval",
    "approved",
    "rejected",
    "ready_for_execution",
    "strategy_pending",
    "unavailable",
  ];
  return allowed.includes(s as ClarificationRuntimePhase)
    ? (s as ClarificationRuntimePhase)
    : null;
}

function parseMutationData(j: ActionJson): ClarificationMutationDto | null {
  if (j.ok === false || !j.data) return null;
  const d = j.data;
  return {
    message: d.message || "OK",
    phase2Status: d.phase2Status ?? null,
    runtimePhase: asRuntimePhase(d.runtimePhase ?? d.runtimeState),
    nextPhase: d.nextPhase != null ? String(d.nextPhase) : null,
    transitionedAt: d.transitionedAt ?? null,
    idempotent: Boolean(d.idempotent),
    session: null,
    refinement: d.refinement
      ? {
          available: Boolean(d.refinement.available),
          executionReadiness:
            d.refinement.executionReadiness === "ready" ||
            d.refinement.executionReadiness === "pending_approval"
              ? d.refinement.executionReadiness
              : "not_ready",
        }
      : null,
    approvalReadiness:
      d.approvalReadiness != null ? Boolean(d.approvalReadiness) : null,
    updatedAt: d.updatedAt ?? null,
  };
}

function parseActionResult(j: ActionJson): ClarificationActionResult {
  if (j.ok === false) {
    return {
      ok: false,
      message: j.error?.message || "Acção de clarificação falhou.",
      phase2Status: null,
      runtimePhase: null,
    };
  }
  const data = parseMutationData(j);
  return {
    ok: true,
    message: data?.message || "OK",
    phase2Status: data?.phase2Status ?? null,
    runtimePhase: data?.runtimePhase ?? null,
    data,
  };
}

function clarificationUnsupported(
  runKey: string,
  unsupportedReason?: string,
): ClarificationBundleDto {
  return {
    session: {
      runId: runKey,
      phase2Status: null,
      runtimePhase: "unavailable",
      currentRound: 0,
      questionsCount: 0,
      answersCount: 0,
      pendingBlockingCount: 0,
      updatedAt: null,
    },
    questions: [],
    answers: [],
    refinement: {
      available: false,
      refinedTask: null,
      scopeChanges: [],
      acceptanceCriteria: [],
      risks: [],
      executionReadiness: "not_ready",
    },
    approval: { status: "none", notes: null, decidedAt: null, planRef: null },
    source: "unsupported",
    unsupportedReason:
      unsupportedReason ??
      "Clarificação não aplicável ou output sem phase2 nesta corrida.",
  };
}

export async function fetchClarificationBundle(
  runKey: string,
): Promise<ClarificationBundleDto> {
  try {
    const enc = encodeURIComponent(runKey);
    const j = await runtimeGetJson<{ ok?: boolean; data?: unknown }>(
      `/runs/${enc}/clarification`,
      { timeoutMs: 12_000 },
    );
    const mapped = mapApiClarificationBundle(
      j as Parameters<typeof mapApiClarificationBundle>[0],
      runKey,
    );
    if (mapped) return mapped;
  } catch (e) {
    if (e instanceof RuntimeApiError && e.code === "http" && e.status === 404) {
      return clarificationUnsupported(runKey);
    }
    if (isRunReadModelConflictError(e)) {
      return clarificationUnsupported(
        runKey,
        formatRunReadModelConflictReason(e, "clarificação"),
      );
    }
    throw e;
  }

  return clarificationUnsupported(runKey);
}

async function postClarificationAction(
  runKey: string,
  segment: "answers" | "approve" | "reject" | "refine",
  body: Record<string, unknown>,
): Promise<ClarificationActionResult> {
  const enc = encodeURIComponent(runKey);
  try {
    const j = await runtimePostJson<ActionJson>(
      `/runs/${enc}/clarification/${segment}`,
      body,
      { timeoutMs: MUTATION_TIMEOUT_MS },
    );
    return parseActionResult(j);
  } catch (e) {
    if (e instanceof RuntimeApiError) {
      return {
        ok: false,
        message: e.message,
        phase2Status: null,
        runtimePhase: null,
      };
    }
    throw e;
  }
}

export async function postClarificationAnswers(
  runKey: string,
  payload: SubmitAnswersPayload,
): Promise<ClarificationActionResult> {
  return postClarificationAction(runKey, "answers", {
    answers: payload.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
    })),
    overwrite: payload.overwrite === true,
    skipLlm: true,
  });
}

export type ClarificationApprovePayload = {
  notes?: string;
  recommendedMode?: "basic" | "standard" | "expert";
  priority?: "low" | "normal" | "high";
};

export async function postClarificationApprove(
  runKey: string,
  payload?: string | ClarificationApprovePayload,
): Promise<ClarificationActionResult> {
  const body =
    typeof payload === "string"
      ? { notes: payload, skipLlm: true }
      : {
          notes: payload?.notes ?? "",
          skipLlm: true,
          ...(payload?.recommendedMode
            ? { recommendedMode: payload.recommendedMode }
            : {}),
          ...(payload?.priority ? { priority: payload.priority } : {}),
        };
  return postClarificationAction(runKey, "approve", body);
}

export async function postClarificationReject(
  runKey: string,
  notes?: string,
): Promise<ClarificationActionResult> {
  return postClarificationAction(runKey, "reject", {
    notes: notes ?? "",
    skipLlm: true,
  });
}

export async function postClarificationRefine(
  runKey: string,
): Promise<ClarificationActionResult> {
  return postClarificationAction(runKey, "refine", { skipLlm: true });
}

export async function postClarificationRequestRefinement(
  runKey: string,
): Promise<ClarificationActionResult> {
  const reject = await postClarificationReject(
    runKey,
    "Pedido de refinamento via UI.",
  );
  if (!reject.ok) return reject;
  return postClarificationRefine(runKey);
}
