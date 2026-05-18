import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveRunUxState } from "./derive-run-ux-state.ts";
import {
  deriveExecutionTimeline,
  filterExecutionTimelineToActualFlow,
} from "./derive-execution-timeline.ts";
import { normalizeRuntimeEvent } from "./normalize-runtime-event.ts";
import type { RunUxState } from "./runtime-ux-types.ts";

const T0 = Date.parse("2026-05-17T14:00:00.000Z");

function ev(type: string, offsetMs: number, data?: Record<string, unknown>) {
  return normalizeRuntimeEvent({
    id: `${type}-${offsetMs}`,
    type,
    timestamp: new Date(T0 + offsetMs).toISOString(),
    runId: "run-1",
    data,
  });
}

function derive(events: ReturnType<typeof ev>[]) {
  const ux = deriveRunUxState(events, { nowMs: T0 + 60_000 });
  return { ux, timeline: deriveExecutionTimeline(events, ux) };
}

function cp(
  timeline: ReturnType<typeof deriveExecutionTimeline>,
  id: string,
) {
  return timeline.checkpoints.find((c) => c.id === id);
}

describe("deriveExecutionTimeline", () => {
  it("início: intake active, resto pending", () => {
    const { timeline } = derive([ev("run_created", 0)]);
    assert.equal(cp(timeline, "intake")?.status, "active");
    assert.equal(cp(timeline, "clarification")?.status, "pending");
  });

  it("clarificação waiting", () => {
    const { timeline } = derive([
      ev("intake_completed", 0),
      ev("clarification_questions_generated", 1000, { questionsCount: 2 }),
    ]);
    assert.equal(cp(timeline, "intake")?.status, "completed");
    assert.equal(cp(timeline, "clarification")?.status, "waiting");
  });

  it("respostas e plano refinado", () => {
    const { timeline } = derive([
      ev("intake_completed", 0),
      ev("clarification_answers_submitted", 1000),
      ev("task_plan_refined_created", 2000),
    ]);
    assert.equal(cp(timeline, "clarification")?.status, "completed");
    assert.equal(cp(timeline, "refined_plan")?.status, "completed");
  });

  it("aprovação pendente no passo plano refinado", () => {
    const { timeline } = derive([
      ev("task_plan_refined_created", 0),
      ev("approval_requested", 1000),
    ]);
    assert.equal(cp(timeline, "refined_plan")?.status, "waiting");
  });

  it("versionamento preparado", () => {
    const { timeline } = derive([
      ev("clarification_approve", 0),
      ev("git_branch_prepared", 1000, { branch: "feat/x" }),
    ]);
    const versioning = cp(timeline, "versioning");
    assert.equal(versioning?.status, "completed");
    assert.match(versioning?.message ?? "", /feat\/x/);
  });

  it("strategy agrega em execução (sem checkpoint estratégia)", () => {
    const { timeline } = derive([
      ev("strategy_started", 0),
      ev("strategy_completed", 2000, { skipped: true }),
    ]);
    assert.equal(cp(timeline, "strategy"), undefined);
    assert.equal(cp(timeline, "execution")?.status, "active");
  });

  it("execution running", () => {
    const { timeline } = derive([
      ev("strategy_completed", 0),
      ev("execution_started", 1000),
    ]);
    assert.equal(cp(timeline, "execution")?.status, "active");
    assert.equal(cp(timeline, "completed")?.status, "pending");
  });

  it("review falha aparece em execução", () => {
    const { timeline } = derive([
      ev("execution_started", 0),
      ev("review_started", 1000),
      ev("review_rejected", 2000),
    ]);
    assert.equal(cp(timeline, "review"), undefined);
    const execution = cp(timeline, "execution");
    assert.ok(execution?.status === "failed" || execution?.status === "active");
  });

  it("run completed", () => {
    const { timeline } = derive([
      ev("execution_started", 0),
      ev("execution_completed", 5000),
    ]);
    assert.equal(cp(timeline, "completed")?.status, "completed");
    assert.equal(timeline.activeCheckpointId, "completed");
  });

  it("strategy_failed marca execução failed", () => {
    const { timeline } = derive([
      ev("strategy_started", 0),
      ev("strategy_failed", 2000),
    ]);
    assert.equal(cp(timeline, "execution")?.status, "failed");
  });

  it("expõe 6 checkpoints na ordem fixa", () => {
    const { timeline } = derive([]);
    assert.equal(timeline.checkpoints.length, 6);
    assert.equal(timeline.checkpoints[0]?.id, "intake");
    assert.equal(timeline.checkpoints.at(-1)?.id, "completed");
  });
});

describe("filterExecutionTimelineToActualFlow", () => {
  it("omite checkpoints pending futuros", () => {
    const { timeline } = derive([
      ev("intake_completed", 0),
      ev("clarification_questions_generated", 1000, { questionsCount: 2 }),
    ]);
    const visible = filterExecutionTimelineToActualFlow(timeline);
    assert.equal(visible.length, 2);
    assert.equal(visible[0]?.id, "intake");
    assert.equal(visible[1]?.id, "clarification");
    assert.equal(visible.at(-1)?.status, "waiting");
    assert.equal(
      visible.some((c) => c.status === "pending"),
      false,
    );
  });

  it("último item é execução activa sem listar concluído futuro", () => {
    const { timeline } = derive([
      ev("strategy_completed", 0),
      ev("execution_started", 1000),
    ]);
    const visible = filterExecutionTimelineToActualFlow(timeline);
    assert.equal(visible.at(-1)?.id, "execution");
    assert.equal(visible.at(-1)?.status, "active");
    assert.equal(visible.some((c) => c.id === "completed"), false);
    assert.equal(visible.some((c) => c.id === "review"), false);
  });

  it("corrida concluída inclui checkpoint terminal", () => {
    const { timeline } = derive([
      ev("execution_started", 0),
      ev("execution_completed", 5000),
    ]);
    const visible = filterExecutionTimelineToActualFlow(timeline);
    assert.equal(visible.at(-1)?.id, "completed");
    assert.equal(visible.at(-1)?.status, "completed");
  });
});
