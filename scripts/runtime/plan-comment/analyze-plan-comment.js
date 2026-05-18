"use strict";

const { classifyPlanCommentLlm } = require("./classify-plan-comment-llm.js");
const {
  writePlanComment,
  writePlanCommentAnalysis,
  writeAdditionalQuestions,
  loadPlanExcerpt,
  readAdditionalQuestions,
} = require("./plan-comment-store.js");
const { generateUpdatedPlanForComment } = require("./generate-updated-plan.js");

/**
 * @param {{
 *   outputDir: string,
 *   commentId: string,
 *   commentText: string,
 *   createdAt?: string,
 *   skipLlm?: boolean,
 *   llmClient?: object|null,
 * }} input
 */
async function analyzePlanComment(input) {
  const outputDir = String(input.outputDir || "").trim();
  const commentId = String(input.commentId || "").trim();
  const commentText = String(input.commentText || "").trim();

  if (!outputDir) {
    return {
      ok: false,
      code: "output_unavailable",
      message: "Diretório de output em falta.",
    };
  }
  if (!commentId) {
    return {
      ok: false,
      code: "plan_comment_invalid",
      message: "commentId em falta.",
    };
  }
  if (!commentText) {
    return {
      ok: false,
      code: "plan_comment_empty",
      message: "Comentário vazio.",
    };
  }

  const comment = writePlanComment(outputDir, {
    id: commentId,
    text: commentText,
    createdAt: input.createdAt,
  });

  const planExcerpt = loadPlanExcerpt(outputDir, commentId);

  const skipLlm = input.skipLlm === true;
  let analysisResult;
  if (skipLlm) {
    const { classifyPlanCommentHeuristic } = require("./classify-plan-comment-heuristic.js");
    analysisResult = {
      ok: true,
      analysis: classifyPlanCommentHeuristic({ commentText, planExcerpt }),
    };
  } else {
    analysisResult = await classifyPlanCommentLlm({
      commentText,
      planExcerpt,
      llmClient: input.llmClient || null,
    });
  }

  if (!analysisResult.ok) {
    return {
      ok: false,
      code: analysisResult.error?.code || "plan_comment_analysis_failed",
      message: analysisResult.error?.message || "Falha na análise.",
    };
  }

  const analysis = writePlanCommentAnalysis(outputDir, commentId, {
    ...analysisResult.analysis,
    commentId,
    analyzedAt: new Date().toISOString(),
  });

  /** @type {object|null} */
  let additionalQuestions = null;
  /** @type {object|null} */
  let updatedPlan = null;

  if (analysis.requiresQuestions && analysis.suggestedQuestions?.length) {
    const existingQ = readAdditionalQuestions(outputDir, commentId);
    if (!existingQ) {
      additionalQuestions = writeAdditionalQuestions(outputDir, commentId, {
        questions: analysis.suggestedQuestions.map((text, i) => ({
          id: `q-${commentId}-${i + 1}`,
          text,
        })),
      });
    } else {
      additionalQuestions = existingQ;
    }
  }

  if (analysis.requiresNewPlan && !analysis.requiresQuestions) {
    const gen = await generateUpdatedPlanForComment({
      outputDir,
      commentId,
      commentText,
      analysis,
      planExcerpt,
    });
    if (gen.ok) updatedPlan = gen.updatedPlan;
  }

  return {
    ok: true,
    comment,
    analysis,
    additionalQuestions,
    updatedPlan,
    idempotent: false,
  };
}

module.exports = {
  analyzePlanComment,
};
