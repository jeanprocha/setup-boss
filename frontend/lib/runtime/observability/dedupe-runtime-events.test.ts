import assert from "node:assert";
import { describe, it } from "node:test";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { dedupeRuntimeEvents } from "./dedupe-runtime-events";

function ev(id: string, type: string): RuntimeEventDto {
  return {
    id,
    tsIso: "2026-05-16T20:00:00.000Z",
    ts: "20:00:00",
    channel: "runtime",
    message: type,
    severity: "info",
    type,
    jobId: null,
    runId: "run-1",
    phaseHint: null,
  };
}

describe("dedupeRuntimeEvents", () => {
  it("mantém um evento por id", () => {
    const out = dedupeRuntimeEvents([
      ev("a1", "strategy_started"),
      ev("a1", "strategy_started"),
    ]);
    assert.equal(out.length, 1);
  });

  it("prefere o último por timestamp quando mesma chave lógica", () => {
    const out = dedupeRuntimeEvents([
      { ...ev("x", "execution_progress"), tsIso: "2026-05-16T19:00:00.000Z" },
      { ...ev("y", "execution_progress"), tsIso: "2026-05-16T20:00:00.000Z", id: "x" },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, "x");
  });
});
