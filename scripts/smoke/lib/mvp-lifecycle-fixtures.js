"use strict";

const fs = require("fs");
const path = require("path");
const { QUESTIONS_FILE } = require("../../runtime/clarification/question-generator");

/**
 * Artefactos mínimos para refine/approve skip-llm após intake.
 * @param {string} outputDir
 */
function seedSkipLlmIntakeArtifacts(outputDir) {
  fs.writeFileSync(
    path.join(outputDir, "task-plan-initial.md"),
    `# Plano inicial (smoke)

## Objetivo
Validar lifecycle MVP Web UI.

## Escopo
Fluxo operacional end-to-end.
`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(outputDir, "task-discovery.md"),
    "# Discovery\n\nContexto mínimo para refine skip-llm.\n",
    "utf-8",
  );
}

/**
 * @param {string} outputDir
 */
function seedSkipLlmQuestions(outputDir) {
  fs.writeFileSync(
    path.join(outputDir, QUESTIONS_FILE),
    JSON.stringify(
      {
        schema_version: "1.0.0",
        generated_at: new Date().toISOString(),
        round: 1,
        questions: [
          {
            id: "q-scope",
            prompt: "Confirma o escopo principal?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
          {
            id: "q-risk",
            prompt: "Aceita os riscos listados?",
            type: "confirm",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
        recommendations: [],
        source: { mode: "smoke-fixture" },
      },
      null,
      2,
    ),
    "utf-8",
  );
}

/**
 * @param {string} outputDir
 * @param {string} questionsFile
 */
function seedClarificationRequiredContext(outputDir, questionsFile = QUESTIONS_FILE) {
  const ctxPath = path.join(outputDir, "run-context.json");
  const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
  ctx.phase2 = {
    ...(ctx.phase2 || {}),
    schema_version: "1.0.0",
    status: "questions_generated",
    current_round: 1,
    artifacts: [...new Set([...(ctx.phase2?.artifacts || []), questionsFile])],
  };
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), "utf-8");
}

const LONG_TASK =
  "Descrição longa o suficiente para evitar task_description_short no smoke MVP Web UI end-to-end operacional.";

module.exports = {
  seedSkipLlmIntakeArtifacts,
  seedSkipLlmQuestions,
  seedClarificationRequiredContext,
  LONG_TASK,
  QUESTIONS_FILE,
};
