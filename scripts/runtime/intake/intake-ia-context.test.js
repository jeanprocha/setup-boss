"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { ensureIAMinimal } = require("../../ensure-ia");
const { buildIntakeIaContextSummary } = require("./intake-ia-context");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("buildIntakeIaContextSummary: ok após baseline ensureIA", async () => {
  const root = tmp("sb-ia-sum-ok-");
  try {
    await ensureIAMinimal(root);
    const s = buildIntakeIaContextSummary(root);
    assert.strictEqual(s.status, "ok");
    assert.strictEqual(s.files_missing.length, 0);
    assert.ok(s.files_found >= 1);
    assert.ok(s.total_chars >= 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildIntakeIaContextSummary: parcial com ficheiro IA vazio", async () => {
  const root = tmp("sb-ia-sum-partial-");
  try {
    fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
    await ensureIAMinimal(root);
    fs.writeFileSync(path.join(root, "docs", ".IA", "02-stack.md"), "   \n  ", "utf-8");
    const s = buildIntakeIaContextSummary(root);
    assert.strictEqual(s.status, "partial");
    assert.ok(s.files_missing.includes("02-stack.md"));
    assert.ok(s.warnings.some((w) => w.includes("02-stack")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
