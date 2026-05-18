"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { listSyntheticJobsFromRunIndex } = require("./project-run-index");
const { deriveProjectId, canonicalProjectRoot } = require("./project-registry");

test("listSyntheticJobsFromRunIndex: devolve jobs para project_root do índice", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-run-idx-"));
  const dataDir = path.join(repo, ".setup-boss");
  const runsDir = path.join(dataDir, "runs");
  const wiser = path.join(repo, "wiser-bot-front");
  fs.mkdirSync(runsDir, { recursive: true });
  fs.mkdirSync(wiser, { recursive: true });

  const runId = "20260516-031441-fechar-chat";
  const outputDir = path.join(wiser, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(runsDir, `${runId}.json`),
    JSON.stringify({
      run_id: runId,
      project_root: wiser,
      output_dir: outputDir,
      created_at: "2026-05-16T06:14:41.907Z",
    }),
    "utf-8",
  );

  const pid = deriveProjectId(wiser);
  const jobs = listSyntheticJobsFromRunIndex({
    repoRoot: repo,
    projectId: pid,
    projectRootCanonical: canonicalProjectRoot(wiser),
    existingRunIds: new Set(),
  });

  try {
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(jobs[0].runId, runId);
    assert.strictEqual(jobs[0].metadata.displayTitle, "fechar chat");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
