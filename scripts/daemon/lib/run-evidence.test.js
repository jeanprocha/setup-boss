"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  isSafeRelativePath,
  artifactIdForRelativePath,
  collectRunEvidence,
  readArtifactContent,
} = require("./run-evidence");
const { writeRunIndex } = require("../../../core/run-resolver");

test("isSafeRelativePath bloqueia traversal", () => {
  assert.strictEqual(isSafeRelativePath("a/b.json"), true);
  assert.strictEqual(isSafeRelativePath("../secret"), false);
  assert.strictEqual(isSafeRelativePath("a/../b"), false);
  assert.strictEqual(isSafeRelativePath("/abs"), false);
});

test("collectRunEvidence lê artifacts e diagnostics", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ev-"));
  const runId = "20260515-120000-test-evidence";
  const outRel = path.join("docs", ".IA", "outputs", runId);
  const outDir = path.join(root, outRel);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "metadata.json"),
    JSON.stringify({ ok: true }),
    "utf-8",
  );
  fs.mkdirSync(path.join(outDir, "execution"), { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "execution", "execution-diagnostics.json"),
    JSON.stringify({
      events: [
        { severity: "warn", code: "T-1", message: "aviso teste", timestamp: "2026-05-15T12:00:00Z" },
      ],
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outDir, "runtime-integrity-report.json"),
    JSON.stringify({
      ok: true,
      validatedAt: "2026-05-15T12:00:00Z",
      source: "test",
      continuity: "pass",
      crossValidation: "pass",
      warnings: 0,
    }),
    "utf-8",
  );

  writeRunIndex({
    runId,
    projectRoot: root,
    outputDir: outDir,
    run_type: "test",
  });

  const ev = collectRunEvidence(runId);
  assert.strictEqual(ev.ok, true);
  assert.ok(ev.data.artifacts.length >= 2);
  const metaArt = ev.data.artifacts.find((a) => a.name === "metadata.json");
  assert.ok(metaArt);
  assert.ok(
    typeof metaArt.modifiedAt === "string" && metaArt.modifiedAt.length > 8,
    "modifiedAt ISO",
  );
  assert.ok(ev.data.diagnostics.length >= 1);
  assert.ok(ev.data.integrity);
  assert.strictEqual(ev.data.integrity.state, "ok");

  const artId = artifactIdForRelativePath("metadata.json");
  const content = readArtifactContent(outDir, "metadata.json");
  assert.strictEqual(content.ok, true);
  assert.ok(content.data.content.includes("ok"));
  assert.strictEqual(content.data.unsupported, false);
  void artId;
});
