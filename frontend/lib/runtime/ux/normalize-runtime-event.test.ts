import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeRuntimeEvent,
  normalizeRuntimeUxEvents,
} from "./normalize-runtime-event.ts";

describe("normalizeRuntimeEvent", () => {
  it("mapeia clarification_questions_generated como waiting", () => {
    const ev = normalizeRuntimeEvent({
      id: "e1",
      type: "clarification_questions_generated",
      timestamp: "2026-05-17T10:00:00.000Z",
      runId: "run-1",
      data: { questionsCount: 3 },
    });
    assert.equal(ev.kind, "clarification");
    assert.equal(ev.phase, "waiting");
    assert.match(ev.message, /3 pergunta/);
  });

  it("mapeia refinement / plano refinado", () => {
    const ev = normalizeRuntimeEvent({
      id: "e2",
      type: "task_plan_refined_created",
      timestamp: "2026-05-17T10:01:00.000Z",
      runId: "run-1",
    });
    assert.equal(ev.kind, "plan");
    assert.equal(ev.phase, "completed");
    assert.equal(ev.title, "Plano refinado criado");
  });

  it("mapeia strategy_started e strategy_completed skipped", () => {
    const started = normalizeRuntimeEvent({
      id: "e3",
      type: "strategy_started",
      timestamp: "2026-05-17T10:02:00.000Z",
    });
    assert.equal(started.kind, "strategy");
    assert.equal(started.phase, "started");

    const done = normalizeRuntimeEvent({
      id: "e4",
      type: "strategy_completed",
      timestamp: "2026-05-17T10:03:00.000Z",
      data: { skipped: true },
    });
    assert.equal(done.phase, "completed");
    assert.match(done.message, /decomposição/i);
  });

  it("mapeia approval_requested e clarification_approve", () => {
    const pending = normalizeRuntimeEvent({
      id: "e5",
      type: "approval_requested",
      timestamp: "2026-05-17T10:04:00.000Z",
    });
    assert.equal(pending.kind, "approval");
    assert.equal(pending.phase, "waiting");

    const approved = normalizeRuntimeEvent({
      id: "e6",
      type: "clarification_approve",
      timestamp: "2026-05-17T10:05:00.000Z",
    });
    assert.equal(approved.kind, "approval");
    assert.equal(approved.phase, "completed");
  });

  it("mapeia execution_started e review", () => {
    const exec = normalizeRuntimeEvent({
      id: "e7",
      type: "execution_started",
      timestamp: "2026-05-17T10:06:00.000Z",
    });
    assert.equal(exec.kind, "execution");
    assert.equal(exec.phase, "started");

    const review = normalizeRuntimeEvent({
      id: "e8",
      type: "review_started",
      timestamp: "2026-05-17T10:07:00.000Z",
    });
    assert.equal(review.kind, "review");
    assert.equal(review.phase, "started");
  });

  it("mapeia correction e git", () => {
    const correction = normalizeRuntimeEvent({
      id: "e9",
      type: "correction_started",
      timestamp: "2026-05-17T10:08:00.000Z",
    });
    assert.equal(correction.kind, "correction");

    const git = normalizeRuntimeEvent({
      id: "e10",
      type: "git_branch_prepared",
      timestamp: "2026-05-17T10:09:00.000Z",
      data: { branch: "feature/chat" },
    });
    assert.equal(git.kind, "git");
    assert.match(git.message, /feature\/chat/);
  });

  it("mapeia workspace_run.waiting_user_action", () => {
    const ev = normalizeRuntimeEvent({
      ok: true,
      workspaceRunId: "wr-1",
      workspaceId: "ws-1",
      status: "waiting_user_action",
      eventType: "workspace_run.waiting_user_action",
      timestamp: "2026-05-17T10:10:00.000Z",
      runId: "run-1",
    });
    assert.equal(ev.kind, "workspace");
    assert.equal(ev.phase, "waiting");
    assert.equal(ev.title, "Ação humana no workspace");
  });

  it("classifica evento desconhecido como unknown", () => {
    const ev = normalizeRuntimeEvent({
      id: "e11",
      type: "totally_custom_event",
      timestamp: "2026-05-17T10:11:00.000Z",
    });
    assert.equal(ev.kind, "unknown");
    assert.equal(ev.phase, "info");
  });

  it("classifica ruído de sistema", () => {
    const ev = normalizeRuntimeEvent({
      id: "e12",
      type: "scheduler_tick",
      timestamp: "2026-05-17T10:12:00.000Z",
    });
    assert.equal(ev.kind, "system");
    assert.equal(ev.phase, "info");
  });

  it("ordena normalizeRuntimeUxEvents por timestamp", () => {
    const list = normalizeRuntimeUxEvents([
      {
        id: "b",
        type: "strategy_started",
        timestamp: "2026-05-17T11:00:00.000Z",
      },
      {
        id: "a",
        type: "intake_completed",
        timestamp: "2026-05-17T10:00:00.000Z",
      },
    ]);
    assert.equal(list[0]?.kind, "intake");
    assert.equal(list[1]?.kind, "strategy");
  });
});
