"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  validateClarificationQuestions,
} = require("./question-generator");
const {
  LOCAL_FALLBACK_REASON,
  buildLocalFallbackQuestionsDocument,
  persistLocalFallbackClarificationQuestions,
} = require("./local-fallback-questions");

test("buildLocalFallbackQuestionsDocument valida com o contrato existente", () => {
  const doc = buildLocalFallbackQuestionsDocument();
  assert.strictEqual(doc.source, "local_fallback");
  assert.strictEqual(doc.reason, LOCAL_FALLBACK_REASON);
  assert.strictEqual(doc.questions.length, 5);
  const v = validateClarificationQuestions(doc);
  assert.strictEqual(v.ok, true, v.ok ? "" : (v.errors && v.errors.join("; ")) || "");
});

test("persistLocalFallbackClarificationQuestions grava artefactos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-lfb-"));
  try {
    const runId = "test-run-fb";
    fs.writeFileSync(
      path.join(dir, "clarification-session.json"),
      JSON.stringify(
        {
          schema_version: "1.0.0",
          run_id: runId,
          status: "clarification_initialized",
          current_round: 0,
          rounds: [],
        },
        null,
        2,
      ),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "run-context.json"),
      JSON.stringify(
        {
          run_type: "intake",
          phase2: {
            schema_version: "1.0.0",
            status: "clarification_initialized",
            current_round: 0,
            started_at: new Date().toISOString(),
            artifacts: [],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const r = persistLocalFallbackClarificationQuestions({
      outputDirAbs: dir,
      runId,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.questionsCount, 5);
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, "clarification-questions.json"), "utf-8"),
    );
    assert.strictEqual(raw.source, "local_fallback");
    const ctx = JSON.parse(fs.readFileSync(path.join(dir, "run-context.json"), "utf-8"));
    assert.strictEqual(ctx.phase2.status, "questions_generated");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
