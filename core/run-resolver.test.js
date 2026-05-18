"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  validateAllowedOutputDir,
  writeRunIndex,
  resolveRunIndexPath,
  resolveOutputDir,
} = require("./run-resolver");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("validateAllowedOutputDir aceita docs/.IA/outputs/<run>", () => {
  const root = tmp("sb-rr-new-");
  const out = path.join(root, "docs", ".IA", "outputs", "run2026a");
  fs.mkdirSync(out, { recursive: true });
  try {
    assert.doesNotThrow(() => validateAllowedOutputDir(out));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateAllowedOutputDir aceita .IA/outputs/<run> legado", () => {
  const root = tmp("sb-rr-leg-");
  const out = path.join(root, ".IA", "outputs", "run2026b");
  fs.mkdirSync(out, { recursive: true });
  try {
    assert.doesNotThrow(() => validateAllowedOutputDir(out));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateAllowedOutputDir bloqueia path fora de outputs IA", () => {
  const root = tmp("sb-rr-ext-");
  const out = path.join(root, "src", "foo", "out");
  fs.mkdirSync(out, { recursive: true });
  try {
    assert.throws(() => validateAllowedOutputDir(out), /não permitido/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeRunIndex grava output_dir_relative para docs/.IA", () => {
  const root = tmp("sb-rr-idx-");
  const runId = "runidx2026";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const indexPath = resolveRunIndexPath(runId);
  const hadIndex = fs.existsSync(indexPath);
  try {
    writeRunIndex({ runId, projectRoot: root, outputDir });
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    assert.strictEqual(idx.output_dir_relative, `docs/.IA/outputs/${runId}`);
    assert.strictEqual(path.normalize(idx.output_dir), path.normalize(outputDir));
  } finally {
    if (!hadIndex && fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeRunIndex inclui workspace_run_id e mini_activity_id opcionais", () => {
  const root = tmp("sb-rr-ws-");
  const runId = "runidx2026ws";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const indexPath = resolveRunIndexPath(runId);
  const hadIndex = fs.existsSync(indexPath);
  try {
    writeRunIndex({
      runId,
      projectRoot: root,
      outputDir,
      workspaceRunId: "wsrun_abc",
      miniActivityId: "ma_001",
    });
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    assert.strictEqual(idx.workspace_run_id, "wsrun_abc");
    assert.strictEqual(idx.mini_activity_id, "ma_001");
  } finally {
    if (!hadIndex && fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("writeRunIndex inclui run_type quando fornecido", () => {
  const root = tmp("sb-rr-rt-");
  const runId = "runidx2026rt";
  const outputDir = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  const indexPath = resolveRunIndexPath(runId);
  const hadIndex = fs.existsSync(indexPath);
  try {
    writeRunIndex({
      runId,
      projectRoot: root,
      outputDir,
      run_type: "intake",
    });
    const idx = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    assert.strictEqual(idx.run_type, "intake");
  } finally {
    if (!hadIndex && fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveOutputDir resolve índice com path legado .IA/outputs", () => {
  const root = tmp("sb-rr-res-");
  const runId = "runlegidx1";
  const outputDir = path.join(root, ".IA", "outputs", runId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
  const indexPath = resolveRunIndexPath(runId);
  const hadIndex = fs.existsSync(indexPath);
  try {
    writeRunIndex({ runId, projectRoot: root, outputDir });
    const resolved = resolveOutputDir(runId, { warnLegacy: false });
    assert.strictEqual(path.normalize(resolved), path.normalize(outputDir));
  } finally {
    if (!hadIndex && fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
