import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeEventDto } from "../../api/runtime-types.ts";
import {
  filterOperationalRuntimeLogEntries,
  isOperationalRuntimeLogEntry,
} from "./filter-runtime-log-operational.ts";
import type { RuntimeLogEntryViewModel } from "./runtime-log-entry-view-model.ts";

function evt(type: string, severity: RuntimeEventDto["severity"] = "info"): RuntimeEventDto {
  return {
    id: `e-${type}`,
    tsIso: "2026-05-17T15:00:00.000Z",
    ts: "15:00",
    channel: "runtime",
    message: type,
    severity,
    type,
    jobId: null,
    runId: "run-1",
    phaseHint: null,
  };
}

function row(
  partial: Partial<RuntimeLogEntryViewModel> & Pick<RuntimeLogEntryViewModel, "rawEvent">,
): RuntimeLogEntryViewModel {
  return {
    id: "r1",
    level: "info",
    displayLevel: "INFO",
    category: "runtime",
    stepTitle: partial.stepTitle ?? "t",
    shortMessage: partial.shortMessage ?? "m",
    timestamp: "2026-05-17T15:00:00.000Z",
    clockLabel: "15:00:00",
    details: null,
    expandable: false,
    uiTier: partial.uiTier ?? "progress",
    icon: "neutral",
    groupKey: "k",
    groupedCount: 1,
    runHint: null,
    phase: null,
    origin: "runtime",
    source: partial.source ?? "event",
    payloadOmittedBytes: null,
    ...partial,
  };
}

describe("filter-runtime-log-operational", () => {
  it("exclui sync tick e heartbeat da vista operacional", () => {
    const rows = [
      row({ rawEvent: evt("workspace_run_sync.tick"), uiTier: "noise" }),
      row({ rawEvent: evt("heartbeat"), uiTier: "noise" }),
      row({
        rawEvent: evt("strategy_started"),
        uiTier: "important",
        stepTitle: "Estratégia em curso",
      }),
    ];
    const filtered = filterOperationalRuntimeLogEntries(rows);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.stepTitle, "Estratégia em curso");
  });

  it("mantém erros e bloqueios relevantes", () => {
    const r = row({
      rawEvent: evt("git_branch_failed", "error"),
      level: "error",
      displayLevel: "ERROR",
      uiTier: "important",
    });
    assert.equal(isOperationalRuntimeLogEntry(r), true);
  });

  it("exclui sub-passos de estratégia informativos", () => {
    const r = row({
      rawEvent: evt("strategy_decomposition_started"),
      uiTier: "progress",
    });
    assert.equal(isOperationalRuntimeLogEntry(r), false);
  });

  it("exclui daemon sync summary", () => {
    const r = row({
      source: "daemon",
      rawEvent: {
        id: "d1",
        tsIso: "2026-05-17T15:00:00.000Z",
        level: "INFO",
        category: "daemon",
        message: "workspace_run_sync.summary",
        detail: null,
      },
      uiTier: "technical",
    });
    assert.equal(isOperationalRuntimeLogEntry(r), false);
  });

  it("mantém git_branch_prepared", () => {
    const r = row({
      rawEvent: evt("git_branch_prepared"),
      uiTier: "important",
    });
    assert.equal(isOperationalRuntimeLogEntry(r), true);
  });
});
