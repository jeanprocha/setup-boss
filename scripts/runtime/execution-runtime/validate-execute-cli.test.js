"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { validateExecuteCliFlagCombinations } = require("./validate-execute-cli");

test("CLI: combinações inválidas observability+rollback", () => {
  const r = validateExecuteCliFlagCombinations({
    run: "x",
    json: false,
    force: false,
    resume: false,
    rollback: true,
    observability: true,
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.length >= 1);
});

test("CLI: combinação inválida rollback+resume", () => {
  const r = validateExecuteCliFlagCombinations({
    run: "x",
    json: false,
    force: false,
    resume: true,
    rollback: true,
    observability: false,
  });
  assert.strictEqual(r.ok, false);
});

test("CLI: combinação válida resume sem rollback", () => {
  const r = validateExecuteCliFlagCombinations({
    run: "x",
    json: false,
    force: false,
    resume: true,
    rollback: false,
    observability: false,
  });
  assert.strictEqual(r.ok, true);
});
