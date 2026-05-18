import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRunUxState } from "./derive-run-ux-state.ts";
import { normalizeRuntimeEvent } from "./normalize-runtime-event.ts";
import { RUN_UX_STALL_MS } from "./runtime-ux-types.ts";

const T0 = Date.parse("2026-05-17T12:00:00.000Z");

function ev(
  type: string,
  offsetMs: number,
  data?: Record<string, unknown>,
) {
  return normalizeRuntimeEvent({
    id: `${type}-${offsetMs}`,
    type,
    timestamp: new Date(T0 + offsetMs).toISOString(),
    runId: "run-1",
    data,
  });
}

describe("deriveRunUxState", () => {
  it("estado inicial sem eventos", () => {
    const s = deriveRunUxState([], { nowMs: T0 });
    assert.equal(s.activeStep, "intake");
    assert.equal(s.visualStep, "intake");
    assert.equal(s.status, "running");
    assert.equal(s.lastEventAt, null);
    assert.equal(s.isStalled, false);
  });

  it("detecta waiting_user_action na clarificação", () => {
    const s = deriveRunUxState(
      [ev("clarification_questions_generated", 0, { questionsCount: 2 })],
      { nowMs: T0 + 10_000 },
    );
    assert.equal(s.status, "waiting_user_action");
    assert.equal(s.hasHumanAction, true);
    assert.equal(s.activeStep, "clarification");
    assert.equal(s.visualStep, "clarification");
  });

  it("progressão clarification → plano refinado", () => {
    const events = [
      ev("intake_completed", 0),
      ev("clarification_answers_submitted", 1000),
      ev("task_plan_refined_created", 2000),
      ev("approval_requested", 3000),
    ];
    const s = deriveRunUxState(events, { nowMs: T0 + 5000 });
    assert.equal(s.activeStep, "approval");
    assert.equal(s.visualStep, "refined_plan");
    assert.equal(s.status, "waiting_user_action");
    assert.ok(s.completedSteps.includes("intake"));
    assert.ok(s.completedSteps.includes("plan"));
  });

  it("após aprovação strategy mapeia visualmente para execução", () => {
    const events = [
      ev("clarification_approve", 0),
      ev("strategy_started", 1000),
    ];
    const s = deriveRunUxState(events, { nowMs: T0 + 5000 });
    assert.equal(s.activeStep, "strategy");
    assert.equal(s.visualStep, "execution");
    assert.equal(s.status, "running");
    assert.ok(!/estratégia operacional/i.test(s.headline));
  });

  it("marca completed quando execution_completed", () => {
    const events = [
      ev("execution_started", 0),
      ev("execution_completed", 5000),
    ];
    const s = deriveRunUxState(events, { nowMs: T0 + 10_000 });
    assert.equal(s.status, "completed");
    assert.equal(s.activeStep, "completed");
    assert.equal(s.visualStep, "completed");
  });

  it("marca failed em strategy_failed com visual execution", () => {
    const events = [ev("strategy_started", 0), ev("strategy_failed", 2000)];
    const s = deriveRunUxState(events, { nowMs: T0 + 5000 });
    assert.equal(s.status, "failed");
    assert.equal(s.activeStep, "strategy");
    assert.equal(s.visualStep, "execution");
  });

  it("integra workspace_run.waiting_user_action", () => {
    const ws = normalizeRuntimeEvent({
      workspaceRunId: "wr-1",
      workspaceId: "ws-1",
      status: "waiting_user_action",
      eventType: "workspace_run.waiting_user_action",
      timestamp: new Date(T0).toISOString(),
      runId: "run-1",
    });
    const s = deriveRunUxState([ws], { nowMs: T0 + 1000 });
    assert.equal(s.status, "waiting_user_action");
    assert.equal(s.activeStep, "execution");
    assert.equal(s.visualStep, "execution");
  });

  it("detecta stall após 90s sem progresso", () => {
    const events = [ev("strategy_started", 0)];
    const s = deriveRunUxState(events, {
      nowMs: T0 + RUN_UX_STALL_MS + 1000,
    });
    assert.equal(s.isStalled, true);
    assert.match(s.headline, /processar/i);
    assert.match(s.detail, /Sem progresso/i);
  });

  it("não marca stall em waiting_user_action", () => {
    const events = [ev("approval_requested", 0)];
    const s = deriveRunUxState(events, {
      nowMs: T0 + RUN_UX_STALL_MS + 60_000,
    });
    assert.equal(s.status, "waiting_user_action");
    assert.equal(s.isStalled, false);
  });

  it("ignora ruído de sistema para activeStep", () => {
    const events = [
      ev("strategy_started", 0),
      ev("scheduler_tick", 1000),
      ev("worker_idle", 2000),
    ];
    const s = deriveRunUxState(events, { nowMs: T0 + 5000 });
    assert.equal(s.activeStep, "strategy");
    assert.equal(s.visualStep, "execution");
  });
});
