"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  resolveScopedFile,
  validateModifiedInAllowed,
  hasRunnableHandoffReady,
} = require("./run-subtask-executor");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("resolveScopedFile rejeita path fora da raiz", () => {
  const root = tmp("sb-sc-");
  try {
    assert.throws(() => resolveScopedFile(root, "../outside.txt"), /SCOPE/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveScopedFile aceita caminho relativo válido", () => {
  const root = tmp("sb-sc2-");
  try {
    const abs = resolveScopedFile(root, "src/x.js");
    assert.ok(abs.includes("src"));
    assert.ok(abs.endsWith("x.js"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("validateModifiedInAllowed subset", () => {
  const r = validateModifiedInAllowed(["a.js"], ["a.js", "b.js"]);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.unexpected, []);
});

test("hasRunnableHandoffReady", () => {
  const root = tmp("sb-hrr-");
  try {
    const out = path.join(root, "o");
    fs.mkdirSync(path.join(out, "execution", "subtasks"), { recursive: true });
    fs.writeFileSync(
      path.join(out, "execution", "subtasks", "001-execution.json"),
      JSON.stringify({
        version: 1,
        phase: "4.4",
        subtask_id: "001",
        position: 1,
        depends_on: [],
        status: "handoff_ready",
        execution_state: "handoff_ready",
      }),
      "utf-8",
    );
    const loaded = {
      orderDoc: {
        ordered_subtasks: [{ subtask_id: "001", position: 1, title: "t", depends_on: [] }],
      },
    };
    assert.strictEqual(hasRunnableHandoffReady(out, loaded), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
