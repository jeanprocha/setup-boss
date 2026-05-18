"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildExecutionOrder, computeLinearOrder } = require("./build-execution-order");

function writeSubtask(dir, id, title, deps) {
  fs.writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify(
      {
        version: 1,
        id,
        title,
        goal: "g",
        scope: { files: [], domains: [] },
        dependencies: deps,
        complexity: { estimated_score: 3, risk: 2 },
        ai_mode: "basic",
        acceptance_criteria: ["c"],
        status: "planned",
      },
      null,
      2,
    ),
    "utf-8",
  );
}

test("computeLinearOrder sem dependências → ordem por ID", () => {
  const items = [
    { id: "003", title: "c", dependencies: [], dependenciesDeclared: [] },
    { id: "001", title: "a", dependencies: [], dependenciesDeclared: [] },
    { id: "002", title: "b", dependencies: [], dependenciesDeclared: [] },
  ];
  const r = computeLinearOrder(items);
  assert.strictEqual(r.had_cycle, false);
  assert.deepStrictEqual(r.order, ["001", "002", "003"]);
});

test("computeLinearOrder dependência simples: predecessor antes", () => {
  const items = [
    {
      id: "001",
      title: "a",
      dependencies: [],
      dependenciesDeclared: [],
    },
    {
      id: "002",
      title: "b",
      dependencies: ["001"],
      dependenciesDeclared: ["001"],
    },
  ];
  const r = computeLinearOrder(items);
  assert.deepStrictEqual(r.order, ["001", "002"]);
});

test("computeLinearOrder dependência inexistente → warning", () => {
  const items = [
    {
      id: "001",
      title: "a",
      dependencies: [],
      dependenciesDeclared: ["999"],
    },
  ];
  const r = computeLinearOrder(items);
  assert.ok(r.dependency_warnings.some((w) => w.includes("999")));
  assert.deepStrictEqual(r.order, ["001"]);
});

test("computeLinearOrder ciclo → fallback por ID e warning", () => {
  const items = [
    {
      id: "001",
      title: "a",
      dependencies: ["002"],
      dependenciesDeclared: ["002"],
    },
    {
      id: "002",
      title: "b",
      dependencies: ["001"],
      dependenciesDeclared: ["001"],
    },
  ];
  const r = computeLinearOrder(items);
  assert.strictEqual(r.had_cycle, true);
  assert.deepStrictEqual(r.order, ["001", "002"]);
  assert.ok(r.dependency_warnings.some((w) => w.includes("Ciclo")));
});

test("buildExecutionOrder integra pasta strategy", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-exord-"));
  try {
    const strat = path.join(root, "strategy");
    const sub = path.join(strat, "subtasks");
    fs.mkdirSync(sub, { recursive: true });
    writeSubtask(sub, "001", "A", []);
    writeSubtask(sub, "002", "B", ["001"]);
    const r = buildExecutionOrder({ strategyDir: strat });
    assert.strictEqual(r.ok, true);
    const doc = /** @type {any} */ (r.doc);
    assert.strictEqual(doc.ordering_mode, "linear");
    assert.strictEqual(doc.ordered_subtasks.length, 2);
    assert.strictEqual(doc.ordered_subtasks[0].subtask_id, "001");
    assert.strictEqual(doc.ordered_subtasks[1].subtask_id, "002");
    assert.ok(Array.isArray(doc.blocking_subtasks));
    assert.ok(doc.blocking_subtasks.includes("001"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
