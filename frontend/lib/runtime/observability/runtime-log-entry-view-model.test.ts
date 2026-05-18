import assert from "node:assert";
import { describe, it } from "node:test";
import type { RuntimeEventDto } from "../../api/runtime-types.ts";
import {
  buildRuntimeLogEntryFromEvent,
  formatPayloadOmittedLabel,
  groupRepeatedRuntimeLogEntries,
} from "./runtime-log-entry-view-model.ts";

describe("runtime-log-entry-view-model", () => {
  it("humaniza strategy_started", () => {
    const ev: RuntimeEventDto = {
      id: "1",
      tsIso: "2026-05-17T02:19:53.000Z",
      ts: "02:19",
      channel: "runtime",
      message: "strategy_started",
      severity: "info",
      type: "strategy_started",
      jobId: "j1",
      runId: "run-abc",
      phaseHint: "strategy",
    };
    const vm = buildRuntimeLogEntryFromEvent(ev);
    assert.equal(vm.stepTitle, "Estratégia iniciada");
    assert.equal(vm.expandable, true);
    assert.match(vm.details?.json ?? "", /runId/);
  });

  it("formata payload omitido com tamanho", () => {
    assert.equal(
      formatPayloadOmittedLabel(393059),
      "Payload técnico grande (384 KB)",
    );
  });

  it("agrupa ruído consecutivo", () => {
    const base = buildRuntimeLogEntryFromEvent({
      id: "a",
      tsIso: "2026-05-17T02:00:00.000Z",
      ts: "02:00",
      channel: "runtime",
      message: "scheduler_tick",
      severity: "info",
      type: "scheduler_tick",
      jobId: null,
      runId: null,
      phaseHint: null,
    });
    const b = {
      ...base,
      id: "b",
      timestamp: "2026-05-17T02:00:01.000Z",
      clockLabel: "02:00:01",
    };
    const grouped = groupRepeatedRuntimeLogEntries([base, b]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.groupedCount, 2);
    assert.equal(grouped[0]!.timestamp, base.timestamp);
    assert.equal(grouped[0]!.clockLabel, base.clockLabel);
  });

  it("mantém clockLabel estável por evento ao reconstruir view models", () => {
    const ev: RuntimeEventDto = {
      id: "stable-1",
      tsIso: "2026-05-17T10:15:30.000Z",
      ts: "10:15",
      channel: "runtime",
      message: "strategy_started",
      severity: "info",
      type: "strategy_started",
      jobId: "j1",
      runId: "run-1",
      phaseHint: "strategy",
    };
    const a = buildRuntimeLogEntryFromEvent(ev);
    const b = buildRuntimeLogEntryFromEvent(ev);
    assert.equal(a.clockLabel, b.clockLabel);
    assert.equal(a.timestamp, b.timestamp);
  });
});
