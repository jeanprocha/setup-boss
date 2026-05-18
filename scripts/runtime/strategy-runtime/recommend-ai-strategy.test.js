"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { decideRecommendedMode } = require("./recommend-ai-strategy");

function cx(overrides) {
  return {
    scores: {
      overall: 5,
      scope: 5,
      risk: 2,
      context_pressure: 4,
      execution_difficulty: 4,
    },
    classification: "moderate",
    ...overrides,
  };
}

test("decideRecommendedMode → basic (baixa complexidade)", () => {
  const r = decideRecommendedMode(cx({ scores: { overall: 2, scope: 2, risk: 2, context_pressure: 1, execution_difficulty: 1 } }), "");
  assert.strictEqual(r.mode, "basic");
});

test("decideRecommendedMode → standard (média)", () => {
  const r = decideRecommendedMode(cx({ scores: { overall: 5, scope: 5, risk: 4, context_pressure: 5, execution_difficulty: 5 } }), "");
  assert.strictEqual(r.mode, "standard");
});

test("decideRecommendedMode → expert (risco alto)", () => {
  const r = decideRecommendedMode(cx({ scores: { overall: 5, scope: 5, risk: 8, context_pressure: 4, execution_difficulty: 4 } }), "");
  assert.strictEqual(r.mode, "expert");
});

test("decideRecommendedMode → expert (critical)", () => {
  const r = decideRecommendedMode(
    cx({ classification: "critical", scores: { overall: 2, scope: 2, risk: 2, context_pressure: 1, execution_difficulty: 1 } }),
    "",
  );
  assert.strictEqual(r.mode, "expert");
});

test("decideRecommendedMode → expert (pressão + risco)", () => {
  const r = decideRecommendedMode(
    cx({
      scores: { overall: 5, scope: 5, risk: 6, context_pressure: 8, execution_difficulty: 4 },
    }),
    "",
  );
  assert.strictEqual(r.mode, "expert");
});
