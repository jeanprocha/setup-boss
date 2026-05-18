"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { buildNextAction, ST } = require("./clarification-status");

const rid = "test-run-id";

test("buildNextAction cobre cada estado phase2", () => {
  const na0 = buildNextAction({ runId: rid, hasPhase2: false, phase2Status: "" });
  assert.ok(na0.command_hint.includes(rid));
  assert.ok(na0.reason.length > 0);

  const naI = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.INITIAL,
  });
  assert.ok(naI.optional_flags.includes("--skip-llm"));

  const naQ = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.QUESTIONS,
  });
  assert.ok(naQ.command_hint.includes("--answer") || naQ.command_hint.includes("--answers"));

  const naA = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.ANSWERS,
  });
  assert.ok(naA.command_hint.includes("--refine"));

  const naP = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.PLAN_REFINED,
  });
  assert.ok(naP.command_hint.includes("--approve") || naP.command_hint.includes("--reject"));

  const naR = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.READY,
  });
  assert.ok(naR.reason.toLowerCase().includes("pronto") || naR.reason.includes("Fase 3"));

  const naX = buildNextAction({
    runId: rid,
    hasPhase2: true,
    phase2Status: ST.REJECTED,
  });
  assert.ok(
    naX.reason.toLowerCase().includes("revis") ||
      naX.reason.toLowerCase().includes("rever"),
  );
});
