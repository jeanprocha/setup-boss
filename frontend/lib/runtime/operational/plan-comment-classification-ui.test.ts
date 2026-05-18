import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planCommentClassificationSummary } from "./plan-comment-classification-ui.ts";

describe("planCommentClassificationSummary", () => {
  it("resume dúvida", () => {
    assert.equal(
      planCommentClassificationSummary({
        classification: "question",
        requiresNewPlan: false,
        requiresQuestions: false,
      }),
      "Este comentário é uma dúvida.",
    );
  });

  it("resume alteração de plano", () => {
    assert.equal(
      planCommentClassificationSummary({
        classification: "update_plan",
        requiresNewPlan: true,
        requiresQuestions: false,
      }),
      "Este comentário altera o plano.",
    );
  });

  it("resume necessidade de perguntas", () => {
    assert.equal(
      planCommentClassificationSummary({
        classification: "needs_questions",
        requiresNewPlan: false,
        requiresQuestions: true,
      }),
      "Precisamos de mais uma informação para atualizar o plano.",
    );
  });
});
