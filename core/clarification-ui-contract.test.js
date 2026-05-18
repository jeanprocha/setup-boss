"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  deriveUiStateAfterIntake,
  classifyOperationalClarificationBucket,
} = require("./clarification-ui-contract.js");

test("deriveUiStateAfterIntake: clarification_initialized + 0 perguntas ≠ waiting_approval", () => {
  assert.equal(
    deriveUiStateAfterIntake(
      "clarification_required",
      "clarification_initialized",
      0,
    ),
    "waiting_clarification_questions",
  );
});

test("deriveUiStateAfterIntake: needs_context com perguntas ⇒ waiting_clarification_answers", () => {
  assert.equal(
    deriveUiStateAfterIntake("clarification_required", "questions_generated", 3),
    "waiting_clarification_answers",
  );
});

test("deriveUiStateAfterIntake: clarification_ready ⇒ running", () => {
  assert.equal(
    deriveUiStateAfterIntake("clarification_ready", "plan_refined", 0),
    "running",
  );
});

test("classifyOperationalClarificationBucket: needs_context + perguntas ⇒ answering", () => {
  assert.equal(
    classifyOperationalClarificationBucket({
      classification: "needs_context",
      phase2Status: "questions_generated",
      questionsCount: 2,
    }),
    "answering",
  );
});

test("classifyOperationalClarificationBucket: needs_context + 0 perguntas ⇒ empty_or_waiting_questions", () => {
  assert.equal(
    classifyOperationalClarificationBucket({
      classification: "needs_context",
      phase2Status: "clarification_initialized",
      questionsCount: 0,
    }),
    "empty_or_waiting_questions",
  );
});

test("classifyOperationalClarificationBucket: refinement + plan_refined ⇒ approval", () => {
  assert.equal(
    classifyOperationalClarificationBucket({
      classification: "needs_context",
      phase2Status: "plan_refined",
      questionsCount: 1,
      refinementAvailable: true,
    }),
    "approval",
  );
});

test("classifyOperationalClarificationBucket: executorRunning ⇒ executing", () => {
  assert.equal(
    classifyOperationalClarificationBucket({
      executorRunning: true,
      classification: "needs_context",
      questionsCount: 0,
    }),
    "executing",
  );
});
