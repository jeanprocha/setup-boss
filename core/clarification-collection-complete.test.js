"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isClarificationCollectionCompletePhase,
} = require("./clarification-collection-complete.js");

test("collection complete quando refinement disponível", () => {
  assert.equal(
    isClarificationCollectionCompletePhase("waiting_answers", {
      refinementAvailable: true,
    }),
    true,
  );
});

test("collection complete em awaiting_approval mesmo com uiState stale", () => {
  assert.equal(
    isClarificationCollectionCompletePhase("awaiting_approval", {}),
    true,
  );
});

test("collection incomplete em waiting_answers com perguntas pendentes", () => {
  assert.equal(
    isClarificationCollectionCompletePhase("waiting_answers", {
      questionsCount: 3,
      answersCount: 1,
      pendingBlockingCount: 2,
    }),
    false,
  );
});

test("collection complete quando todas blocking respondidas", () => {
  assert.equal(
    isClarificationCollectionCompletePhase("waiting_answers", {
      questionsCount: 5,
      answersCount: 5,
      pendingBlockingCount: 0,
    }),
    true,
  );
});
