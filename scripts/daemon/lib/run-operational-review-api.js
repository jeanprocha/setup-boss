"use strict";

const path = require("path");
const { resolveOutputDir } = require("../../../core/run-resolver");
const {
  buildOperationalReviewState,
  ensureOperationalReviewState,
  writeOperationalReviewState,
} = require("../../runtime/operational-review/operational-review-state");
const { collectExecutionForRun } = require("./run-execution");
const { triggerRunExecution } = require("./run-execute-api");
const { emitRuntimeEvent } = require("./runtime-events");
const {
  resetFinalizationOnReviewConfirm,
} = require("./run-operational-finalization-api");

/**
 * @param {string} runId
 */
function mapHitlDto(doc) {
  const st = String(doc.status || "pending");
  return {
    status: st,
    operatorNotes: doc.operator_notes != null ? String(doc.operator_notes) : "",
    createdAt: doc.created_at != null ? String(doc.created_at) : null,
    confirmedAt: doc.confirmed_at != null ? String(doc.confirmed_at) : null,
    adjustmentRequestedAt:
      doc.adjustment_requested_at != null
        ? String(doc.adjustment_requested_at)
        : null,
  };
}

/**
 * @param {string} runId
 */
function getOperationalReviewSession(runId) {
  const rid = String(runId || "").trim();
  if (!rid) {
    return { ok: false, code: "run_id_required", message: "runId em falta." };
  }

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(rid, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e && e.message ? String(e.message) : "Output indisponível.",
    };
  }

  const execBundle = collectExecutionForRun(rid);
  const life =
    execBundle.ok && execBundle.data?.summary?.lifecycle?.phase
      ? String(execBundle.data.summary.lifecycle.phase)
      : null;

  if (life !== "execution_completed") {
    return {
      ok: false,
      code: "execution_not_completed",
      message: "Review operacional só disponível após execução concluída.",
    };
  }

  const { doc } = ensureOperationalReviewState(outputDir);
  return {
    ok: true,
    data: {
      runId: rid,
      hitl: mapHitlDto(doc),
      executionLifecyclePhase: life,
      source: "runtime",
    },
  };
}

/**
 * @param {{ repoRoot: string, runId: string, notes?: string|null }} input
 */
async function confirmOperationalReview(input) {
  const runId = String(input.runId || "").trim();
  const session = getOperationalReviewSession(runId);
  if (!session.ok) return session;

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e && e.message ? String(e.message) : "Output indisponível.",
    };
  }

  const prev = ensureOperationalReviewState(outputDir).doc;
  const notes =
    input.notes != null && String(input.notes).trim()
      ? String(input.notes).trim()
      : prev.operator_notes != null
        ? String(prev.operator_notes)
        : "";

  const doc = buildOperationalReviewState({
    status: "confirmed",
    operatorNotes: notes,
    createdAt: prev.created_at,
  });
  writeOperationalReviewState(outputDir, doc);
  resetFinalizationOnReviewConfirm(outputDir);

  emitRuntimeEvent({
    type: "operational_review_confirmed",
    runId,
    data: { status: "confirmed" },
  });

  return {
    ok: true,
    data: {
      runId,
      hitl: mapHitlDto(doc),
    },
  };
}

/**
 * @param {{ repoRoot: string, runId: string, notes: string }} input
 */
async function requestOperationalReviewAdjustment(input) {
  const runId = String(input.runId || "").trim();
  const notes = String(input.notes || "").trim();
  if (!notes) {
    return {
      ok: false,
      code: "notes_required",
      message: "Descreva o ajuste pretendido antes de solicitar.",
    };
  }

  const session = getOperationalReviewSession(runId);
  if (!session.ok) return session;

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e && e.message ? String(e.message) : "Output indisponível.",
    };
  }

  const prev = ensureOperationalReviewState(outputDir).doc;
  const doc = buildOperationalReviewState({
    status: "adjustment_requested",
    operatorNotes: notes,
    createdAt: prev.created_at,
  });
  writeOperationalReviewState(outputDir, doc);

  emitRuntimeEvent({
    type: "operational_review_adjustment_requested",
    runId,
    data: { notes },
  });

  const execResult = await triggerRunExecution({
    repoRoot: input.repoRoot,
    runId,
    force: true,
  });

  if (!execResult.ok) {
    return {
      ok: true,
      partial: true,
      data: {
        runId,
        hitl: mapHitlDto(doc),
        execute: {
          ok: false,
          code: execResult.code || "execute_failed",
          message: execResult.message || "Não foi possível reenfileirar execução.",
        },
      },
      message:
        "Pedido de ajuste registado. A reexecução automática falhou — use «Iniciar execução» manualmente.",
    };
  }

  return {
    ok: true,
    data: {
      runId,
      hitl: mapHitlDto(doc),
      execute: {
        ok: true,
        orchestrationState:
          execResult.data?.orchestrationState ?? "execution_starting",
        executionState: execResult.data?.executionState ?? "execution_starting",
      },
    },
  };
}

module.exports = {
  getOperationalReviewSession,
  confirmOperationalReview,
  requestOperationalReviewAdjustment,
};
