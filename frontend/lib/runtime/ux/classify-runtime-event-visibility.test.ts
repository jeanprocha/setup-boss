import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRuntimeEventVisibility,
  filterOperationalUxEvents,
  isHiddenRawEventType,
} from "./classify-runtime-event-visibility.ts";
import { normalizeRuntimeEvent } from "./normalize-runtime-event.ts";

function ev(type: string, data?: Record<string, unknown>) {
  return normalizeRuntimeEvent({
    id: `e-${type}`,
    type,
    timestamp: "2026-05-17T15:00:00.000Z",
    data,
  });
}

describe("classifyRuntimeEventVisibility", () => {
  it("operational para clarification e strategy", () => {
    assert.equal(
      classifyRuntimeEventVisibility(ev("clarification_approve")),
      "operational",
    );
    assert.equal(
      classifyRuntimeEventVisibility(ev("strategy_started")),
      "operational",
    );
  });

  it("hidden para ruído", () => {
    assert.equal(
      classifyRuntimeEventVisibility(ev("worker_idle")),
      "hidden",
    );
    assert.equal(
      classifyRuntimeEventVisibility(ev("workspace_run_sync.tick")),
      "hidden",
    );
    assert.equal(isHiddenRawEventType("scheduler_tick"), true);
  });

  it("technical para governance e output dir", () => {
    assert.equal(
      classifyRuntimeEventVisibility(ev("runtime.output_dir_resolved")),
      "technical",
    );
    assert.equal(
      classifyRuntimeEventVisibility(ev("clarification_initialized")),
      "technical",
    );
  });

  it("strategy_completed skipped permanece operational", () => {
    assert.equal(
      classifyRuntimeEventVisibility(
        ev("strategy_completed", { skipped: true }),
      ),
      "operational",
    );
  });

  it("workspace waiting é operational", () => {
    const ws = normalizeRuntimeEvent({
      workspaceRunId: "wr-1",
      workspaceId: "ws-1",
      status: "waiting_user_action",
      eventType: "workspace_run.waiting_user_action",
      timestamp: "2026-05-17T15:00:00.000Z",
    });
    assert.equal(classifyRuntimeEventVisibility(ws), "operational");
  });

  it("filterOperationalUxEvents remove hidden e technical", () => {
    const list = filterOperationalUxEvents([
      ev("strategy_started"),
      ev("worker_idle"),
      ev("runtime.output_dir_resolved"),
      ev("approval_requested"),
    ]);
    assert.equal(list.length, 2);
    assert.equal(list[0]?.title.length > 0, true);
  });
});
