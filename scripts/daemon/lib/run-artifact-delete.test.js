"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  parseRunDeleteKey,
  deleteRunIndexArtifact,
} = require("./run-artifact-delete");

test("parseRunDeleteKey: run-index e runId", () => {
  assert.deepEqual(
    parseRunDeleteKey("run-index:20260517-194133-fechar-chat"),
    {
      runId: "20260517-194133-fechar-chat",
      jobId: "run-index:20260517-194133-fechar-chat",
    },
  );
  assert.deepEqual(parseRunDeleteKey("20260517-194133-fechar-chat"), {
    runId: "20260517-194133-fechar-chat",
    jobId: null,
  });
  assert.deepEqual(parseRunDeleteKey("job_abc"), {
    runId: null,
    jobId: "job_abc",
  });
});

test("deleteRunIndexArtifact: remove ficheiro do índice", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-del-run-"));
  const runsDir = path.join(repo, ".setup-boss", "runs");
  fs.mkdirSync(runsDir, { recursive: true });
  const runId = "20260517-test-delete";
  fs.writeFileSync(
    path.join(runsDir, `${runId}.json`),
    JSON.stringify({ run_id: runId }),
    "utf-8",
  );

  try {
    const ok = deleteRunIndexArtifact(runId, repo);
    assert.equal(ok.ok, true);
    assert.equal(fs.existsSync(path.join(runsDir, `${runId}.json`)), false);

    const missing = deleteRunIndexArtifact(runId, repo);
    assert.equal(missing.ok, false);
    assert.equal(missing.code, "not_found");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
