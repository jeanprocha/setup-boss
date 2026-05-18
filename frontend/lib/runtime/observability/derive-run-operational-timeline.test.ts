import assert from "node:assert";
import { describe, it } from "node:test";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import {
  dedupeOperationalTimelineItems,
  deriveRunOperationalTimeline,
  mergeOperationalTimelineCandidates,
} from "./derive-run-operational-timeline";

const NOW = Date.parse("2026-05-16T20:00:00.000Z");

function ev(
  type: string,
  tsIso: string,
  extra?: Partial<RuntimeEventDto>,
): RuntimeEventDto {
  return {
    id: `${type}-${tsIso}`,
    tsIso,
    ts: tsIso,
    channel: "runtime",
    message: type,
    severity: "info",
    type,
    jobId: null,
    runId: "run-1",
    phaseHint: null,
    ...extra,
  };
}

describe("derive-run-operational-timeline", () => {
  it("filtra noise/technical", () => {
    const tl = deriveRunOperationalTimeline({
      events: [
        ev("scheduler_tick", "2026-05-16T19:50:00.000Z"),
        ev("runtime.projects.pipeline", "2026-05-16T19:51:00.000Z"),
        ev("strategy_started", "2026-05-16T19:52:00.000Z"),
      ],
      nowMs: NOW,
    });
    assert.equal(tl.items.length, 1);
    assert.match(tl.items[0].title, /Estratégia iniciada/i);
  });

  it("merge de múltiplas fontes e ordenação", () => {
    const merged = mergeOperationalTimelineCandidates(
      [ev("execution_started", "2026-05-16T19:55:00.000Z")],
      [
        {
          id: "d1",
          tsIso: "2026-05-16T19:54:00.000Z",
          level: "INFO",
          category: "runtime",
          message: "strategy_completed",
          detail: null,
        },
      ],
      "run-1",
    );
    assert.equal(merged.length, 2);
    const tl = deriveRunOperationalTimeline({ events: merged, nowMs: NOW });
    assert.equal(tl.items.length, 2);
    assert.match(tl.items[0].title, /Estratégia concluída/i);
    assert.match(tl.items[1].title, /Execução iniciada/i);
  });

  it("dedupe por id estável", () => {
    const duped = dedupeOperationalTimelineItems([
      {
        id: "same-key",
        timestamp: "2026-05-16T19:00:00.000Z",
        title: "A",
        subtitle: null,
        severity: "info",
        visualState: "running",
        source: "runtime",
        relatedPhase: "strategy",
        isUserAction: false,
        isTerminal: false,
      },
      {
        id: "same-key",
        timestamp: "2026-05-16T19:05:00.000Z",
        title: "B",
        subtitle: null,
        severity: "info",
        visualState: "running",
        source: "runtime",
        relatedPhase: "strategy",
        isUserAction: false,
        isTerminal: false,
      },
    ]);
    assert.equal(duped.length, 1);
    assert.equal(duped[0].title, "B");
  });

  it("waiting_user e erro/warning", () => {
    const tl = deriveRunOperationalTimeline({
      events: [
        ev("waiting_user_action", "2026-05-16T19:58:00.000Z"),
        ev("strategy_failed", "2026-05-16T19:59:00.000Z", { severity: "error" }),
      ],
      nowMs: NOW,
    });
    assert.ok(tl.items.some((i) => i.visualState === "waiting_user"));
    assert.ok(tl.items.some((i) => i.severity === "error"));
  });

  it("item terminal e status completed", () => {
    const tl = deriveRunOperationalTimeline({
      events: [
        ev("strategy_started", "2026-05-16T19:50:00.000Z"),
        ev("execution_completed", "2026-05-16T19:59:00.000Z"),
      ],
      nowMs: NOW,
    });
    const terminal = tl.items.find((i) => i.isTerminal);
    assert.ok(terminal);
    assert.equal(tl.currentStatus, "completed");
  });

  it("eventos fora de ordem são reordenados", () => {
    const tl = deriveRunOperationalTimeline({
      events: [
        ev("review_completed", "2026-05-16T20:00:00.000Z"),
        ev("execution_started", "2026-05-16T19:55:00.000Z"),
      ],
      nowMs: NOW,
    });
    assert.match(tl.items[0].title, /Execução iniciada/i);
    assert.match(tl.items[1].title, /Revisão concluída/i);
  });

  it("strategy_completed título humano", () => {
    const tl = deriveRunOperationalTimeline({
      events: [ev("strategy_completed", "2026-05-16T19:52:00.000Z")],
      nowMs: NOW,
    });
    assert.match(tl.items[0].title, /Estratégia concluída/i);
    assert.equal(tl.currentStatus, "completed");
  });

  it("último progresso label", () => {
    const tl = deriveRunOperationalTimeline({
      events: [ev("execution_progress", new Date(NOW - 90_000).toISOString())],
      nowMs: NOW,
    });
    assert.ok(tl.lastProgressLabel?.includes("Último progresso há"));
  });
});
