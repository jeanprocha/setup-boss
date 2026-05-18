import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlanTimelineEntries,
  resolveActivePlanEntry,
} from "./plan-active-version.ts";
import type { OperationalPlanPresentation } from "./operational-plan-types.ts";
import type { PlanCommentThreadState } from "./plan-approval-timeline-types.ts";

const basePlan = {
  understanding: { summary: "Base", mainObjective: null },
  whatWillBeDone: ["a"],
  whatWillChange: [],
  outOfScope: [],
  executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
  complexity: { level: "low" as const, levelLabelPt: "Baixa", explanation: null },
  executionRecommendation: {
    recommendedLevel: "normal" as const,
    levelLabelPt: "Normal",
    explanation: null,
  },
  miniTasks: { mode: "direct" as const, directLabelPt: "direto", tasks: [] },
  risks: [],
  completionCriteria: [],
  hasContent: true,
} satisfies OperationalPlanPresentation;

describe("plan-active-version", () => {
  it("último updated plan é o activo", () => {
    const threads = [
      {
        comment: {
          id: "c1",
          kind: "user_comment" as const,
          text: "x",
          createdAt: "t",
        },
        analysisStatus: "done" as const,
        analysis: null,
        analysisError: null,
        additionalQuestions: null,
        additionalAnswers: null,
        additionalAnswersStatus: "idle" as const,
        additionalAnswersError: null,
        updatedPlan: {
          commentId: "c1",
          planVersion: 2,
          generatedAt: "t",
          supersedesPlanVersion: 1,
          presentation: { ...basePlan, understanding: { summary: "v2", mainObjective: null } },
        },
        updatedPlanStatus: "done" as const,
      },
    ] satisfies PlanCommentThreadState[];
    const entries = buildPlanTimelineEntries(basePlan, threads);
    const active = resolveActivePlanEntry(entries);
    assert.equal(active.planVersion, 2);
  });
});
