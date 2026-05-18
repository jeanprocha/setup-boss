"use strict";

const {
  readAdditionalQuestions,
  readAdditionalAnswers,
  writeAdditionalAnswers,
  readUpdatedPlan,
  loadPlanExcerpt,
} = require("./plan-comment-store.js");
const { generateUpdatedPlanForComment } = require("./generate-updated-plan.js");

/**
 * @param {{
 *   outputDir: string,
 *   commentId: string,
 *   commentText: string,
 *   analysis?: object|null,
 *   answers: Array<{ questionId: string, question?: string, answer: string }>,
 *   planExcerpt?: string,
 * }} input
 */
async function submitPlanCommentAnswers(input) {
  const outputDir = String(input.outputDir || "").trim();
  const commentId = String(input.commentId || "").trim();
  const answersIn = Array.isArray(input.answers) ? input.answers : [];

  if (!outputDir || !commentId) {
    return {
      ok: false,
      code: "plan_comment_invalid",
      message: "outputDir e commentId são obrigatórios.",
    };
  }

  const questionsDoc = readAdditionalQuestions(outputDir, commentId);
  if (!questionsDoc?.questions?.length) {
    return {
      ok: false,
      code: "additional_questions_missing",
      message: "Não há perguntas adicionais para este comentário.",
    };
  }

  const existingAnswers = readAdditionalAnswers(outputDir, commentId);
  if (existingAnswers) {
    const existingPlan = readUpdatedPlan(outputDir, commentId);
    return {
      ok: true,
      additionalAnswers: existingAnswers,
      updatedPlan: existingPlan,
      idempotent: true,
    };
  }

  const byId = new Map(
    questionsDoc.questions.map((q) => [q.id, q.text]),
  );
  /** @type {Array<{ questionId: string, question: string, answer: string }>} */
  const normalizedAnswers = [];
  for (const row of answersIn) {
    const questionId = String(row.questionId || "").trim();
    const answer = String(row.answer || "").trim();
    if (!questionId || !answer) continue;
    normalizedAnswers.push({
      questionId,
      question: String(row.question || byId.get(questionId) || "").trim(),
      answer,
    });
  }

  if (!normalizedAnswers.length) {
    return {
      ok: false,
      code: "additional_answers_empty",
      message: "Responda pelo menos uma pergunta.",
    };
  }

  const additionalAnswers = writeAdditionalAnswers(outputDir, commentId, {
    answers: normalizedAnswers,
  });

  const planExcerpt = input.planExcerpt || loadPlanExcerpt(outputDir, commentId);
  const gen = await generateUpdatedPlanForComment({
    outputDir,
    commentId,
    commentText: input.commentText,
    analysis: input.analysis,
    planExcerpt,
  });

  if (!gen.ok) return gen;

  return {
    ok: true,
    additionalAnswers,
    updatedPlan: gen.updatedPlan,
    idempotent: false,
  };
}

module.exports = {
  submitPlanCommentAnswers,
};
