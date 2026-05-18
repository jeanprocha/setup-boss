import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  appendPlanApprovalCommentThread,
  readPlanApprovalTimeline,
  updatePlanApprovalThread,
} from "./plan-approval-timeline-storage.ts";
import { createPlanApprovalUserCommentBlock } from "./plan-approval-timeline-types.ts";

const RUN = "run-test-1";

describe("plan-approval-timeline-storage", () => {
  beforeEach(() => {
    global.sessionStorage = {
      store: new Map<string, string>(),
      getItem(key: string) {
        return this.store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.store.set(key, value);
      },
      removeItem(key: string) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      },
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("lê estado vazio quando não há dados", () => {
    assert.deepEqual(readPlanApprovalTimeline(RUN), { version: 2, threads: [] });
  });

  it("persiste thread de comentário", () => {
    const block = createPlanApprovalUserCommentBlock("Quero anexos futuros", "c1");
    appendPlanApprovalCommentThread(RUN, block);
    const state = readPlanApprovalTimeline(RUN);
    assert.equal(state.threads.length, 1);
    assert.equal(state.threads[0]?.comment.text, "Quero anexos futuros");
  });

  it("atualiza análise na thread", () => {
    const block = createPlanApprovalUserCommentBlock("ok", "c2");
    appendPlanApprovalCommentThread(RUN, block);
    updatePlanApprovalThread(RUN, "c2", {
      analysisStatus: "done",
      analysis: {
        commentId: "c2",
        classification: "no_change",
        reason: "teste",
        assistantResponse: "ok",
        requiresNewPlan: false,
        requiresQuestions: false,
        suggestedQuestions: [],
        planChangeSummary: "",
        analyzedAt: "2026-01-01T00:00:00.000Z",
        mode: "heuristic",
      },
    });
    const state = readPlanApprovalTimeline(RUN);
    assert.equal(state.threads[0]?.analysisStatus, "done");
    assert.equal(state.threads[0]?.analysis?.classification, "no_change");
  });
});
