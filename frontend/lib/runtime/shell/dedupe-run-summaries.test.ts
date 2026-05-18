import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeRunSummariesByRunId } from "./dedupe-run-summaries.ts";
import type { RunSummaryDto } from "@/lib/api/runtime-types";

function row(
  id: string,
  runId: string | null,
): RunSummaryDto {
  return {
    id,
    runId,
    projectId: "p1",
    label: id,
    activityTitle: null,
    archived: false,
    phase: "intake",
    state: "running",
    operationalStatusKey: null,
    startedAtLabel: null,
    branchHint: null,
    git: null,
    jobStatus: "completed",
    retryable: false,
  };
}

describe("dedupeRunSummariesByRunId", () => {
  it("mantém a primeira ocorrência por runId (lista já ordenada)", () => {
    const out = dedupeRunSummariesByRunId([
      row("job_new", "run-a"),
      row("job_old", "run-a"),
      row("job_b", "run-b"),
    ]);
    assert.equal(out.length, 2);
    assert.equal(out[0]?.id, "job_new");
    assert.equal(out[1]?.id, "job_b");
  });
});
