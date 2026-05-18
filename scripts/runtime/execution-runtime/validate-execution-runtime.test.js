"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  validateExecutionRuntimeDetailed,
  validateExecutionRuntimeResult,
  MVP_EXECUTION_PHASE,
} = require("./validate-execution-runtime");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("validateExecutionRuntimeDetailed expõe warnings e contagens", () => {
  const root = tmp("sb-val411-");
  try {
    const d = validateExecutionRuntimeDetailed(root);
    assert.ok(Array.isArray(d.errors));
    assert.ok(Array.isArray(d.warnings));
    assert.ok(d.errors.length > 0);
    assert.strictEqual(typeof d.checked_artifacts, "number");
    assert.strictEqual(typeof d.checked_subtasks, "number");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateExecutionRuntimeResult inclui warnings vazios em diretório inexistente", () => {
  const root = tmp("sb-val411b-");
  try {
    const r = validateExecutionRuntimeResult(root);
    assert.strictEqual(r.ok, false);
    assert.ok(Array.isArray(r.warnings));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MVP phase constante 4.11", () => {
  assert.strictEqual(MVP_EXECUTION_PHASE, "4.11");
});
