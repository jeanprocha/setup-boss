"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { ensureIAMinimal } = require("../ensure-ia");
const { appendProblemHistoryEntry } = require("../../core/problem-history");
const {
  resolveProjectIaDir,
  resolveProjectIaOutputDir,
} = require("../shared/ia-path-resolver");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("ensureIAMinimal: projeto novo cria baseline em docs/.IA", async () => {
  const root = tmp("sb-02-new-");
  try {
    const r = await ensureIAMinimal(root);
    const expected = path.normalize(path.resolve(root, "docs", ".IA"));
    assert.strictEqual(path.normalize(r.iaDir), expected);
    assert.ok(fs.existsSync(path.join(r.iaDir, "00-project-profile.md")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ensureIAMinimal: projeto só com .IA legado mantém iaDir legado", async () => {
  const root = tmp("sb-02-leg-");
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  try {
    const r = await ensureIAMinimal(root);
    const expected = path.normalize(path.resolve(root, ".IA"));
    assert.strictEqual(path.normalize(r.iaDir), expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ensureIAMinimal: ambos existentes prioriza docs/.IA", async () => {
  const root = tmp("sb-02-both-");
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  try {
    const bootstrap = await ensureIAMinimal(root);
    const { iaDir, source } = resolveProjectIaDir(root);
    assert.strictEqual(source, "preferred");
    assert.strictEqual(path.normalize(bootstrap.iaDir), path.normalize(iaDir));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("problem-history grava 09 em activeIaDir (docs/.IA)", () => {
  const root = tmp("sb-02-ph-");
  const runId = "runph2026";
  const outputDir = resolveProjectIaOutputDir(root, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify({
      projectRoot: root,
      runId,
      taskArg: "tasks/x.md",
    }),
    "utf-8",
  );
  try {
    appendProblemHistoryEntry({
      projectRoot: root,
      outputDir,
      runId,
      step: "test_step",
      status: "error",
      type: "test_error",
      title: "título teste",
    });
    const { iaDir } = resolveProjectIaDir(root);
    const hp = path.join(iaDir, "09-problem-history.jsonl");
    assert.ok(fs.existsSync(hp));
    const line = fs.readFileSync(hp, "utf-8").trim().split("\n").pop();
    const row = JSON.parse(line);
    assert.strictEqual(row.run_id, runId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("problem-history grava em .IA quando só legado existe", () => {
  const root = tmp("sb-02-phl-");
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  const runId = "runphleg1";
  const outputDir = resolveProjectIaOutputDir(root, runId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify({
      projectRoot: root,
      runId,
      taskArg: "tasks/x.md",
    }),
    "utf-8",
  );
  try {
    appendProblemHistoryEntry({
      projectRoot: root,
      outputDir,
      runId,
      step: "test_step",
      status: "error",
      type: "test_error",
      title: "título legado",
    });
    const hp = path.join(root, ".IA", "09-problem-history.jsonl");
    assert.ok(fs.existsSync(hp));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
