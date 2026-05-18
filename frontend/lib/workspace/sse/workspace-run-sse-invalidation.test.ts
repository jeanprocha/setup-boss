import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { runtimeQueryKeys } from "@/lib/api/query-keys";
import { invalidateWorkspaceRunQueries } from "@/lib/workspace/sse/workspace-run-sse-invalidation";

describe("invalidateWorkspaceRunQueries", () => {
  it("invalida workspaceRun detail e git sem lançar", () => {
    const qc = new QueryClient();
    const keys: unknown[] = [];
    const orig = qc.invalidateQueries.bind(qc);
    qc.invalidateQueries = ((opts: { queryKey: unknown }) => {
      keys.push(opts.queryKey);
      return orig(opts);
    }) as typeof qc.invalidateQueries;

    invalidateWorkspaceRunQueries(qc, {
      workspaceRunId: "wsrun_1",
      workspaceId: "ws_1",
      status: "running",
      eventType: "workspace_run.updated",
      timestamp: new Date().toISOString(),
    });

    assert.ok(
      keys.some(
        (k) =>
          JSON.stringify(k) ===
          JSON.stringify(runtimeQueryKeys.workspaceRunDetail("wsrun_1")),
      ),
    );
    assert.ok(
      keys.some(
        (k) =>
          JSON.stringify(k) ===
          JSON.stringify(runtimeQueryKeys.workspaceRunGit("wsrun_1")),
      ),
    );
  });
});
