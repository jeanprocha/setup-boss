"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { dedupeJobsByRunId } = require("./dedupe-jobs-by-run-id");

test("dedupeJobsByRunId: um job por runId (mais recente)", () => {
  const jobs = dedupeJobsByRunId([
    {
      id: "job_old",
      runId: "20260517-174925-foo",
      createdAt: "2026-05-17T10:00:00.000Z",
    },
    {
      id: "job_new",
      runId: "20260517-174925-foo",
      createdAt: "2026-05-17T11:00:00.000Z",
    },
    {
      id: "job_other",
      runId: "20260517-182932-bar",
      createdAt: "2026-05-17T09:00:00.000Z",
    },
  ]);
  assert.strictEqual(jobs.length, 2);
  assert.strictEqual(
    jobs.find((j) => j.runId === "20260517-174925-foo")?.id,
    "job_new",
  );
});

test("dedupeJobsByRunId: preserva jobs sem runId", () => {
  const jobs = dedupeJobsByRunId([
    { id: "a", runId: null, createdAt: "2026-05-17T10:00:00.000Z" },
    { id: "b", runId: null, createdAt: "2026-05-17T11:00:00.000Z" },
  ]);
  assert.strictEqual(jobs.length, 2);
});
