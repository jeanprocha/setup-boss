import assert from "node:assert";
import { describe, it } from "node:test";
import { useRuntimeObservabilityLogsStore } from "./runtime-observability-logs-store.ts";

describe("runtime-observability-logs-store", () => {
  it("fixa tsIso na primeira ingestão e não reescreve em polls seguintes", () => {
    useRuntimeObservabilityLogsStore.setState({ buckets: new Map() });
    const ingest = useRuntimeObservabilityLogsStore.getState().ingestDaemonEntries;
    const runKey = "run-ts-test";

    ingest(runKey, [
      {
        id: "dlog_a",
        tsIso: null,
        level: "INFO",
        category: "daemon",
        message: "worker_idle",
        detail: null,
      },
    ]);
    const first = useRuntimeObservabilityLogsStore
      .getState()
      .getDaemonEntries(runKey)[0]!;
    assert.ok(first.tsIso);
    const firstTs = first.tsIso;

    ingest(runKey, [
      {
        id: "dlog_a",
        tsIso: "2026-05-17T12:00:00.000Z",
        level: "INFO",
        category: "daemon",
        message: "worker_idle",
        detail: null,
      },
    ]);
    const second = useRuntimeObservabilityLogsStore
      .getState()
      .getDaemonEntries(runKey)[0]!;
    assert.equal(second.tsIso, firstTs);
  });
});
