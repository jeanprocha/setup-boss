"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  MARKER,
  parseClarificationQuestionsResponse,
  validateClarificationQuestions,
} = require("./question-generator");

const VALID_JSON = `${MARKER}
{
  "questions": [
    {
      "id": "q_scope_1",
      "prompt": "Confirma o âmbito?",
      "type": "confirm",
      "blocking": true,
      "options": [],
      "evidence_refs": ["task-discovery"]
    }
  ],
  "recommendations": ["Priorizar leitura da documentação."]
}
`;

test("parseClarificationQuestionsResponse aceita payload válido", () => {
  const r = parseClarificationQuestionsResponse(VALID_JSON);
  assert.strictEqual(r.ok, true);
  assert.ok(r.ok && Array.isArray(r.payload.questions));
  assert.strictEqual(r.ok && r.payload.questions.length, 1);
});

test("parseClarificationQuestionsResponse falha sem marcador", () => {
  const r = parseClarificationQuestionsResponse('{"questions":[]}');
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.error.code === "CLARIFY_QUESTIONS_PARSE_MISSING_MARKER");
});

test("validateClarificationQuestions bloqueia IDs duplicados", () => {
  const r = validateClarificationQuestions({
    questions: [
      {
        id: "dup",
        prompt: "A?",
        type: "free_text",
        blocking: false,
        options: [],
        evidence_refs: [],
      },
      {
        id: "dup",
        prompt: "B?",
        type: "free_text",
        blocking: false,
        options: [],
        evidence_refs: [],
      },
    ],
    recommendations: [],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("duplicado")));
});

test("validateClarificationQuestions single_choice sem options falha", () => {
  const r = validateClarificationQuestions({
    questions: [
      {
        id: "q1",
        prompt: "Escolha?",
        type: "single_choice",
        blocking: true,
        options: [],
        evidence_refs: [],
      },
    ],
    recommendations: [],
  });
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("single_choice")));
});

test("validateClarificationQuestions aceita questions vazio", () => {
  const r = validateClarificationQuestions({
    questions: [],
    recommendations: [],
  });
  assert.strictEqual(r.ok, true);
});

test("validateClarificationQuestions rejeita mais de 7 perguntas", () => {
  const questions = [];
  for (let i = 0; i < 8; i++) {
    questions.push({
      id: `q${i}`,
      prompt: `P${i}?`,
      type: "free_text",
      blocking: false,
      options: [],
      evidence_refs: [],
    });
  }
  const r = validateClarificationQuestions({ questions, recommendations: [] });
  assert.strictEqual(r.ok, false);
});
