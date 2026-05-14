"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDeterministicReviewGate,
  riskMeetsOrExceedsThreshold,
  applyDeterministicReviewGateCliEffects,
} = require("./deterministic-review-gate");

test("gate — mode off ignora risco (pass, sem triggers)", () => {
  const env = { SETUP_BOSS_REVIEW_GATE_MODE: "off", SETUP_BOSS_REVIEW_GATE_THRESHOLD: "low" };
  const g = buildDeterministicReviewGate({ overall_risk_level: "critical", top_risk_findings: [] }, [], env);
  assert.equal(g.mode, "off");
  assert.equal(g.decision, "pass");
  assert.deepEqual(g.triggered_by, []);
});

test("gate — enforce: high >= threshold high → fail + triggers", () => {
  const env = { SETUP_BOSS_REVIEW_GATE_MODE: "enforce", SETUP_BOSS_REVIEW_GATE_THRESHOLD: "high" };
  const rs = {
    overall_risk_level: "high",
    top_risk_findings: [
      { finding_id: "a", code: "validation_command_failed", type: "validation", severity: "error", risk_weight: 42 },
    ],
  };
  const g = buildDeterministicReviewGate(rs, [], env);
  assert.equal(g.decision, "fail");
  assert.ok(g.triggered_by.length >= 2);
  assert.equal(g.triggered_by[0].kind, "risk_threshold");
  assert.equal(g.triggered_by[1].kind, "finding");
});

test("gate — enforce: medium com threshold high → pass", () => {
  const env = { SETUP_BOSS_REVIEW_GATE_MODE: "enforce", SETUP_BOSS_REVIEW_GATE_THRESHOLD: "high" };
  const g = buildDeterministicReviewGate({ overall_risk_level: "medium", top_risk_findings: [] }, [], env);
  assert.equal(g.decision, "pass");
  assert.deepEqual(g.triggered_by, []);
});

test("gate — advisory: atinge limiar → warn (sem exit)", () => {
  const env = { SETUP_BOSS_REVIEW_GATE_MODE: "advisory", SETUP_BOSS_REVIEW_GATE_THRESHOLD: "medium" };
  const g = buildDeterministicReviewGate({ overall_risk_level: "medium", top_risk_findings: [] }, [], env);
  assert.equal(g.decision, "warn");
  assert.ok(g.triggered_by.length >= 1);
});

test("riskMeetsOrExceedsThreshold — ordinal determinístico", () => {
  assert.equal(riskMeetsOrExceedsThreshold("low", "high"), false);
  assert.equal(riskMeetsOrExceedsThreshold("high", "high"), true);
  assert.equal(riskMeetsOrExceedsThreshold("critical", "high"), true);
});

test("applyDeterministicReviewGateCliEffects — enforce fail define exitCode", () => {
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  const doc = {
    gate: buildDeterministicReviewGate(
      {
        overall_risk_level: "critical",
        top_risk_findings: [],
      },
      [],
      { SETUP_BOSS_REVIEW_GATE_MODE: "enforce", SETUP_BOSS_REVIEW_GATE_THRESHOLD: "critical" },
    ),
    risk_summary: { overall_risk_level: "critical" },
  };
  applyDeterministicReviewGateCliEffects(doc);
  assert.equal(process.exitCode, 1);
  process.exitCode = prevExit;
});
