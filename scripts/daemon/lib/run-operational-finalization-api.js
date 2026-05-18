"use strict";

const path = require("path");
const { resolveOutputDir } = require("../../../core/run-resolver");
const {
  buildOperationalReviewState,
  ensureOperationalReviewState,
  loadOperationalReviewState,
  writeOperationalReviewState,
} = require("../../runtime/operational-review/operational-review-state");
const {
  buildOperationalFinalizationState,
  ensureOperationalFinalizationState,
  writeOperationalFinalizationState,
} = require("../../runtime/operational-finalization/operational-finalization-state");
const { collectExecutionForRun } = require("./run-execution");
const { emitRuntimeEvent } = require("./runtime-events");

/**
 * @param {object} doc
 */
function mapHitlDto(doc) {
  const st = String(doc.status || "pending");
  return {
    status: st,
    operatorNotes: doc.operator_notes != null ? String(doc.operator_notes) : "",
    createdAt: doc.created_at != null ? String(doc.created_at) : null,
    finalizedAt: doc.finalized_at != null ? String(doc.finalized_at) : null,
    adjustmentRequestedAt:
      doc.adjustment_requested_at != null
        ? String(doc.adjustment_requested_at)
        : null,
  };
}

/**
 * @param {string} outputDir
 */
function requireReviewConfirmed(outputDir) {
  const review = loadOperationalReviewState(outputDir);
  if (!review.ok || String(review.doc.status) !== "confirmed") {
    return {
      ok: false,
      code: "review_not_confirmed",
      message:
        "Finalização operacional só disponível após review confirmado.",
    };
  }
  return { ok: true, reviewDoc: review.doc };
}

/**
 * @param {string} runId
 */
function getOperationalFinalizationSession(runId) {
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
      message: "Finalização só disponível após execução concluída.",
    };
  }

  const reviewGate = requireReviewConfirmed(outputDir);
  if (!reviewGate.ok) return reviewGate;

  const { doc } = ensureOperationalFinalizationState(outputDir);
  return {
    ok: true,
    data: {
      runId: rid,
      hitl: mapHitlDto(doc),
      reviewConfirmedAt:
        reviewGate.reviewDoc.confirmed_at != null
          ? String(reviewGate.reviewDoc.confirmed_at)
          : null,
      executionLifecyclePhase: life,
      source: "runtime",
    },
  };
}

/**
 * @param {{ runId: string, notes?: string|null }} input
 */
async function finalizeOperationalActivity(input) {
  const runId = String(input.runId || "").trim();
  const session = getOperationalFinalizationSession(runId);
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

  const prev = ensureOperationalFinalizationState(outputDir).doc;
  const notes =
    input.notes != null && String(input.notes).trim()
      ? String(input.notes).trim()
      : prev.operator_notes != null
        ? String(prev.operator_notes)
        : "";

  const doc = buildOperationalFinalizationState({
    status: "finalized",
    operatorNotes: notes,
    createdAt: prev.created_at,
  });
  writeOperationalFinalizationState(outputDir, doc);

  emitRuntimeEvent({
    type: "operational_finalization_completed",
    runId,
    data: { status: "finalized" },
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
 * @param {{ runId: string, notes: string }} input
 */
async function requestOperationalFinalAdjustment(input) {
  const runId = String(input.runId || "").trim();
  const notes = String(input.notes || "").trim();
  if (!notes) {
    return {
      ok: false,
      code: "notes_required",
      message: "Descreva o ajuste pretendido antes de solicitar.",
    };
  }

  const session = getOperationalFinalizationSession(runId);
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

  const prevFin = ensureOperationalFinalizationState(outputDir).doc;
  const finDoc = buildOperationalFinalizationState({
    status: "adjustment_requested",
    operatorNotes: notes,
    createdAt: prevFin.created_at,
  });
  writeOperationalFinalizationState(outputDir, finDoc);

  const prevReview = ensureOperationalReviewState(outputDir).doc;
  const reviewDoc = buildOperationalReviewState({
    status: "pending",
    operatorNotes: notes,
    createdAt: prevReview.created_at,
  });
  writeOperationalReviewState(outputDir, reviewDoc);

  emitRuntimeEvent({
    type: "operational_finalization_adjustment_requested",
    runId,
    data: { notes },
  });

  return {
    ok: true,
    data: {
      runId,
      hitl: mapHitlDto(finDoc),
      reviewReset: true,
    },
    message:
      "Pedido de ajuste registado. Volte à fase Review para validar novamente.",
  };
}

/**
 * Repõe finalização em pending quando o review é confirmado de novo.
 * @param {string} outputDir
 */
function resetFinalizationOnReviewConfirm(outputDir) {
  const loaded = loadOperationalReviewState(outputDir);
  if (!loaded.ok) return;
  const fin = ensureOperationalFinalizationState(outputDir).doc;
  if (String(fin.status) === "finalized") return;
  const doc = buildOperationalFinalizationState({
    status: "pending",
    operatorNotes: fin.operator_notes,
    createdAt: fin.created_at,
  });
  writeOperationalFinalizationState(outputDir, doc);
}

module.exports = {
  getOperationalFinalizationSession,
  finalizeOperationalActivity,
  requestOperationalFinalAdjustment,
  resetFinalizationOnReviewConfirm,
};
