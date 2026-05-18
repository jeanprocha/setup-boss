"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  normalizeAllowedFiles,
  pathHasWildcard,
  isValidArchitectHandoffDoc,
} = require("./build-architect-handoff");

test("normalizeAllowedFiles remove duplicados e mantém ordem", () => {
  const out = normalizeAllowedFiles(["b/a.js", "a/x.ts", "b/a.js", "  ", "a/x.ts"]);
  assert.deepStrictEqual(out, ["b/a.js", "a/x.ts"]);
});

test("normalizeAllowedFiles rejeita wildcard e vazio", () => {
  assert.deepStrictEqual(normalizeAllowedFiles(["ok.js", "src/*.ts", ""]), ["ok.js"]);
  assert.deepStrictEqual(normalizeAllowedFiles(["**/*.js"]), []);
});

test("pathHasWildcard", () => {
  assert.strictEqual(pathHasWildcard("a.js"), false);
  assert.strictEqual(pathHasWildcard("src/*.js"), true);
  assert.strictEqual(pathHasWildcard("x**"), true);
});

test("isValidArchitectHandoffDoc aceita contrato mínimo", () => {
  const doc = {
    version: 1,
    phase: "4.3",
    subtask_id: "001",
    title: "t",
    goal: "g",
    execution_mode: "architect_preparation",
    allowed_files: ["a.js"],
    shared_context_refs: [],
    dependencies: [],
    acceptance_criteria: ["c"],
    architect_context: {
      summary: "s",
      complexity: { overall: 1, classification: "low", risk: 0 },
      ai_strategy: { recommended_mode: "basic" },
      execution_constraints: [
        "linear_execution",
        "no_parallelism",
        "isolated_subtask_scope",
        "patch_only_allowed_files",
      ],
    },
    status: "prepared",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.strictEqual(isValidArchitectHandoffDoc(doc), true);
});

test("isValidArchitectHandoffDoc falha sem execution_constraints completas", () => {
  const doc = {
    version: 1,
    phase: "4.3",
    subtask_id: "001",
    title: "t",
    goal: "g",
    execution_mode: "architect_preparation",
    allowed_files: [],
    shared_context_refs: [],
    dependencies: [],
    acceptance_criteria: ["c"],
    architect_context: {
      summary: "s",
      complexity: { overall: null, classification: "x", risk: null },
      ai_strategy: { recommended_mode: "basic" },
      execution_constraints: ["linear_execution"],
    },
    status: "prepared",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  assert.strictEqual(isValidArchitectHandoffDoc(doc), false);
});
