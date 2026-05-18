"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { decomposeTask, parseMarkdownSections } = require("./decompose-task");

test("parseMarkdownSections extrai títulos e corpos", () => {
  const md = "## A\n\nlinha1\n## B\n\ntexto b";
  const s = parseMarkdownSections(md);
  assert.strictEqual(s.length, 2);
  assert.strictEqual(s[0].title, "A");
  assert.ok(s[0].body.includes("linha1"));
  assert.strictEqual(s[1].title, "B");
});

test("decomposeTask plano trivial → uma subtask", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-deco-1-"));
  try {
    const out = path.join(root, "run");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "task-plan-refined.md"), "## Passos\n- a\n", "utf-8");
    const complexityDoc = {
      version: 1,
      scores: { overall: 2, scope: 1, risk: 1, context_pressure: 1, execution_difficulty: 1 },
    };
    const aiDoc = { recommended_mode: "basic" };
    const r = decomposeTask({ outputDirAbs: out, complexityDoc, aiDoc });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(/** @type {any} */ (r.decomposition).subtask_count, 1);
    assert.strictEqual(/** @type {any} */ (r.decomposition).strategy, "single");
    assert.strictEqual(r.subtaskFiles.length, 1);
    assert.strictEqual(r.subtaskFiles[0].id, "001");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("decomposeTask com secções → múltiplas subtasks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-deco-n-"));
  try {
    const out = path.join(root, "run");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(
      path.join(out, "task-plan-refined.md"),
      [
        "## Objetivo",
        "Texto suficiente para secção",
        "## Escopo Refinado",
        "Outro texto com conteúdo mínimo aqui",
        "## Passos Propostos",
        "- `src/x.js`",
      ].join("\n"),
      "utf-8",
    );
    const complexityDoc = {
      version: 1,
      scores: { overall: 6, scope: 5, risk: 4, context_pressure: 5, execution_difficulty: 5 },
    };
    const aiDoc = { recommended_mode: "standard" };
    const r = decomposeTask({ outputDirAbs: out, complexityDoc, aiDoc });
    assert.strictEqual(r.ok, true);
    assert.ok(/** @type {any} */ (r.decomposition).subtask_count >= 2);
    const ids = r.subtaskFiles.map((x) => x.id);
    for (let i = 0; i < ids.length; i++) {
      assert.strictEqual(ids[i], String(i + 1).padStart(3, "0"));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
