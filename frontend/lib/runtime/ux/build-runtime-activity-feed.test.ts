import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRuntimeActivityFeed } from "./build-runtime-activity-feed.ts";
import { normalizeRuntimeEvent } from "./normalize-runtime-event.ts";

function ev(type: string, offset = 0) {
  return normalizeRuntimeEvent({
    id: `${type}-${offset}`,
    type,
    timestamp: new Date(Date.parse("2026-05-17T15:00:00.000Z") + offset).toISOString(),
  });
}

describe("buildRuntimeActivityFeed", () => {
  it("ordena e filtra ruído", () => {
    const feed = buildRuntimeActivityFeed([
      ev("worker_idle", 0),
      ev("intake_completed", 100),
      ev("strategy_started", 200),
    ]);
    assert.equal(feed.length, 2);
    assert.equal(feed[0]?.title, "Intake concluído");
    assert.equal(feed[1]?.title, "Estratégia em curso");
    assert.equal(feed[1]?.macroPhaseLabel, "Execução");
  });

  it("dedupe por tipo+minuto", () => {
    const feed = buildRuntimeActivityFeed([
      ev("strategy_started", 0),
      ev("strategy_started", 500),
    ]);
    assert.equal(feed.length, 1);
  });
});
