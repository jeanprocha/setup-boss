"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  parseAnswersInput,
  validateClarificationAnswers,
} = require("./answers");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("validateClarificationAnswers falha com question_id duplicado no payload", () => {
  const r = validateClarificationAnswers(
    {
      questions: [
        {
          id: "a",
          prompt: "p",
          type: "free_text",
          blocking: false,
          options: [],
          evidence_refs: [],
        },
      ],
    },
    {
      answers: [
        { question_id: "a", value: "1", source: "user" },
        { question_id: "a", value: "2", source: "user" },
      ],
    },
  );
  assert.strictEqual(r.ok, false);
  assert.ok(!r.ok && r.errors.some((e) => e.includes("duplicado")));
});

test("parseAnswersInput detecta duplicados no ficheiro", () => {
  const dir = tmp("sb-ans-dup-");
  try {
    const fp = path.join(dir, "a.json");
    fs.writeFileSync(
      fp,
      JSON.stringify({
        answers: [
          { question_id: "x", value: "1" },
          { question_id: "x", value: "2" },
        ],
      }),
      "utf-8",
    );
    const r = parseAnswersInput({ answersPath: fp, answerPairs: [], cwd: dir });
    assert.strictEqual(r.ok, false);
    assert.ok(!r.ok && r.error.code === "CLARIFY_ANSWERS_DUPLICATE_ID");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
