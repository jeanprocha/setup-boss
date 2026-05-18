"use strict";

const { resolveOutputDir } = require("../../../core/run-resolver");
const { analyzePlanComment } = require("../../runtime/plan-comment/analyze-plan-comment");
const { listPlanCommentThreads } = require("../../runtime/plan-comment/plan-comment-store");
const { submitPlanCommentAnswers } = require("../../runtime/plan-comment/submit-plan-comment-answers");
const { emitRuntimeEvent } = require("./runtime-events");

/**
 * @param {string} runIdOrPath
 * @param {{ jobs?: object[] }} [ctx]
 */
function resolveOutputForRun(runIdOrPath) {
  try {
    const outputDir = resolveOutputDir(runIdOrPath);
    if (!outputDir) {
      return {
        ok: false,
        code: "output_unavailable",
        message: "Output da run indisponível.",
      };
    }
    return { ok: true, outputDir };
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e instanceof Error ? e.message : "Output da run indisponível.",
    };
  }
}

/**
 * @param {string} runId
 * @param {{ commentId: string, text: string, createdAt?: string, skipLlm?: boolean }} body
 * @param {{ jobId?: string|null, projectId?: string|null }} meta
 */
async function submitPlanCommentForRun(runId, body, meta = {}) {
  const out = resolveOutputForRun(runId);
  if (!out.ok) return out;

  const commentId = String(body.commentId || "").trim();
  const text = String(body.text || "").trim();
  if (!commentId || !text) {
    return {
      ok: false,
      code: "plan_comment_invalid",
      message: "commentId e text são obrigatórios.",
    };
  }

  const existing = listPlanCommentThreads(out.outputDir).find(
    (t) => t.comment && t.comment.id === commentId,
  );
  if (existing && existing.analysis) {
    return {
      ok: true,
      comment: existing.comment,
      analysis: existing.analysis,
      additionalQuestions: existing.additionalQuestions ?? null,
      additionalAnswers: existing.additionalAnswers ?? null,
      updatedPlan: existing.updatedPlan ?? null,
      idempotent: true,
    };
  }

  const result = await analyzePlanComment({
    outputDir: out.outputDir,
    commentId,
    commentText: text,
    createdAt: body.createdAt,
    skipLlm: body.skipLlm === true,
  });

  if (!result.ok) return result;

  try {
    emitRuntimeEvent({
      type: "plan_comment_analyzed",
      jobId: meta.jobId ?? null,
      runId,
      data: {
        commentId,
        classification: result.analysis.classification,
        requiresNewPlan: result.analysis.requiresNewPlan,
        requiresQuestions: result.analysis.requiresQuestions,
      },
    });
  } catch {
    /* */
  }

  return {
    ok: true,
    comment: result.comment,
    analysis: result.analysis,
    additionalQuestions: result.additionalQuestions ?? null,
    additionalAnswers: result.additionalAnswers ?? null,
    updatedPlan: result.updatedPlan ?? null,
    idempotent: Boolean(result.idempotent),
  };
}

/**
 * @param {string} runId
 * @param {string} commentId
 * @param {{ answers: Array<{ questionId: string, question?: string, answer: string }> }} body
 */
async function submitPlanCommentAnswersForRun(runId, commentId, body) {
  const out = resolveOutputForRun(runId);
  if (!out.ok) return out;

  const id = String(commentId || "").trim();
  if (!id) {
    return {
      ok: false,
      code: "plan_comment_invalid",
      message: "commentId é obrigatório.",
    };
  }

  const threads = listPlanCommentThreads(out.outputDir);
  const thread = threads.find((t) => t.comment?.id === id);
  if (!thread?.comment) {
    return {
      ok: false,
      code: "plan_comment_not_found",
      message: "Comentário não encontrado.",
    };
  }

  const result = await submitPlanCommentAnswers({
    outputDir: out.outputDir,
    commentId: id,
    commentText: thread.comment.text,
    analysis: thread.analysis,
    answers: body.answers || [],
  });

  if (!result.ok) return result;

  try {
    emitRuntimeEvent({
      type: "plan_comment_answers_submitted",
      runId,
      data: { commentId: id, answerCount: result.additionalAnswers?.answers?.length ?? 0 },
    });
  } catch {
    /* */
  }

  return {
    ok: true,
    additionalAnswers: result.additionalAnswers,
    updatedPlan: result.updatedPlan,
    idempotent: Boolean(result.idempotent),
  };
}

/**
 * @param {string} runId
 */
function collectPlanCommentsForRun(runId) {
  const out = resolveOutputForRun(runId);
  if (!out.ok) return out;
  const threads = listPlanCommentThreads(out.outputDir);
  return {
    ok: true,
    data: {
      threads: threads.map((t) => ({
        comment: t.comment,
        analysis: t.analysis,
        additionalQuestions: t.additionalQuestions,
        additionalAnswers: t.additionalAnswers,
        updatedPlan: t.updatedPlan,
      })),
    },
  };
}

module.exports = {
  submitPlanCommentForRun,
  submitPlanCommentAnswersForRun,
  collectPlanCommentsForRun,
};
