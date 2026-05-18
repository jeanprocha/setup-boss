import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveScrollAfterCommentAnalysis } from "./plan-timeline-scroll.ts";
import type { PlanCommentThreadState } from "./plan-approval-timeline-types.ts";

const baseThread = {
  comment: {
    id: "c1",
    kind: "user_comment" as const,
    text: "x",
    createdAt: "t",
  },
  analysisError: null,
  additionalQuestions: null,
  additionalAnswers: null,
  additionalAnswersStatus: "idle" as const,
  additionalAnswersError: null,
  updatedPlan: null,
  updatedPlanStatus: "idle" as const,
} satisfies Partial<PlanCommentThreadState>;

describe("resolveScrollAfterCommentAnalysis", () => {
  it("vai para perguntas quando needs_questions", () => {
    const target = resolveScrollAfterCommentAnalysis({
      ...baseThread,
      analysisStatus: "done",
      analysis: {
        commentId: "c1",
        classification: "needs_questions",
        reason: "",
        assistantResponse: "",
        requiresNewPlan: false,
        requiresQuestions: true,
        suggestedQuestions: ["q?"],
        planChangeSummary: "",
        analyzedAt: "t",
        mode: "heuristic",
      },
      additionalQuestions: {
        commentId: "c1",
        createdAt: "t",
        questions: [{ id: "q1", text: "q?" }],
      },
    } as PlanCommentThreadState);
    assert.deepEqual(target, { kind: "block", blockId: "questions-c1" });
  });

  it("vai para plano v2 quando update_plan concluído", () => {
    const target = resolveScrollAfterCommentAnalysis({
      ...baseThread,
      analysisStatus: "done",
      analysis: {
        commentId: "c1",
        classification: "update_plan",
        reason: "",
        assistantResponse: "",
        requiresNewPlan: true,
        requiresQuestions: false,
        suggestedQuestions: [],
        planChangeSummary: "",
        analyzedAt: "t",
        mode: "heuristic",
      },
      updatedPlan: {
        commentId: "c1",
        planVersion: 2,
        generatedAt: "t",
        supersedesPlanVersion: 1,
        presentation: {} as never,
      },
      updatedPlanStatus: "done",
    } as PlanCommentThreadState);
    assert.deepEqual(target, { kind: "block", blockId: "updated-plan-c1" });
  });
});
