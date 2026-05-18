"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { createRunFromTask } = require("./run-intake-api");
const { executeClarification } = require("../../runtime/clarification/clarification-runtime");
const {
  runClarificationMutation,
  collectClarificationForRun,
  collectClarificationBundle,
  mergeAnswerPairsWithExisting,
} = require("./run-clarification");
const { resolveOutputDir } = require("../../../core/run-resolver");
const { QUESTIONS_FILE } = require("../../runtime/clarification/question-generator");

function seedSkipLlmIntakeArtifacts(outputDir) {
  const plan = `# Plano inicial (teste)

## Objetivo
Validar hardening de clarificação.

## Escopo
Fluxo HITL operacional.
`;
  fs.writeFileSync(path.join(outputDir, "task-plan-initial.md"), plan, "utf-8");
  fs.writeFileSync(
    path.join(outputDir, "task-discovery.md"),
    "# Discovery\n\nContexto mínimo para refine skip-llm.\n",
    "utf-8",
  );
}

function seedSkipLlmQuestions(outputDir) {
  const fp = path.join(outputDir, QUESTIONS_FILE);
  fs.writeFileSync(
    fp,
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
        source: { mode: "test-fixture" },
      },
      null,
      2,
    ),
    "utf-8",
  );
}
test("mergeAnswerPairsWithExisting combina respostas anteriores com novas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-merge-"));
  try {
    fs.writeFileSync(
      path.join(dir, "clarification-answers.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        answers: [{ question_id: "q1", value: "a1", source: "user" }],
      }),
      "utf-8",
    );
    const merged = mergeAnswerPairsWithExisting(dir, [
      { question_id: "q2", value: "a2" },
    ]);
    assert.strictEqual(merged.overwrite, true);
    assert.strictEqual(merged.answerPairs.length, 2);
    const q1 = merged.answerPairs.find((p) => p.question_id === "q1");
    const q2 = merged.answerPairs.find((p) => p.question_id === "q2");
    assert.strictEqual(q1?.value, "a1");
    assert.strictEqual(q2?.value, "a2");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runClarificationMutation answers+refine+approve end-to-end", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-e2e-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const created = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar hardening do fluxo de clarificação real com submit answers approve reject e strategy bootstrap.",
    metadata: { skipLlm: true, source: "test" },
  });
  assert.strictEqual(created.ok, true, created.error?.message);
  const runId = created.data.runId;

  const outputDir = resolveOutputDir(runId, { warnLegacy: false });
  seedSkipLlmIntakeArtifacts(outputDir);
  seedSkipLlmQuestions(outputDir);
  const ctxPath = path.join(outputDir, "run-context.json");
  const ctx = JSON.parse(fs.readFileSync(ctxPath, "utf-8"));
  ctx.phase2 = {
    ...(ctx.phase2 || {}),
    schema_version: "1.0.0",
    status: "questions_generated",
    current_round: 1,
    artifacts: [...new Set([...(ctx.phase2?.artifacts || []), QUESTIONS_FILE])],
  };
  fs.writeFileSync(ctxPath, JSON.stringify(ctx, null, 2), "utf-8");

  const bundle0 = collectClarificationBundle(outputDir, runId);
  assert.strictEqual(bundle0.ok, true);
  const questions = bundle0.data.questions;
  assert.ok(questions.length > 0, "esperado perguntas no fixture skip-llm");

  const answersPayload = questions.map((q) => ({
    question_id: q.id,
    value:
      q.kind === "confirm"
        ? "yes"
        : q.options && q.options.length
          ? q.options[0]
          : `resposta-${q.id}`,
  }));

  const submitted = await runClarificationMutation(runId, {
    answerPairs: answersPayload,
    skipLlm: true,
    cwd: root,
  });
  assert.strictEqual(submitted.ok, true, submitted.message);
  assert.ok(
    submitted.phase2Status === "plan_refined" ||
      submitted.runtimePhase === "awaiting_approval",
    `phase2=${submitted.phase2Status} runtime=${submitted.runtimePhase}`,
  );
  assert.strictEqual(submitted.refinement?.available, true);

  const approved = await runClarificationMutation(runId, {
    approve: true,
    skipLlm: true,
    cwd: root,
  });
  assert.strictEqual(approved.ok, true, approved.message);
  assert.ok(
    approved.phase2Status === "ready_for_execution" ||
      approved.runtimePhase === "ready_for_execution" ||
      approved.runtimePhase === "strategy_pending",
  );

  const bundleFinal = collectClarificationForRun(runId, null);
  assert.strictEqual(bundleFinal.ok, true);
  assert.strictEqual(bundleFinal.data.approval.status, "approved");
});

test("runClarificationMutation approve bloqueado sem refinement", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-block-"));
  const projectRoot = path.join(root, "demo-block");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const created = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Testar bloqueio de approve sem plano refinado no fluxo de clarificação operacional.",
    metadata: { skipLlm: true, source: "test" },
  });
  assert.strictEqual(created.ok, true);
  const runId = created.data.runId;

  const blocked = await runClarificationMutation(runId, {
    approve: true,
    skipLlm: true,
    cwd: root,
  });
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.code, "clarification_not_ready");
});

test("runClarificationMutation answers + refine sem task-plan/md intake (skipLlm fallback)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-clar-no-plan-"));
  const projectRoot = path.join(root, "demo-no-plan");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const created = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task:
      "Descrição longa o suficiente para validar fluxo skip LLM com perguntas locais e submissão de respostas sem task-plan-initial gerado no intake.",
    metadata: { skipLlm: true, source: "test-no-plan" },
  });
  assert.strictEqual(created.ok, true, created.error?.message);
  const runId = created.data.runId;

  const outputDir = resolveOutputDir(runId, { warnLegacy: false });

  assert.ok(!fs.existsSync(path.join(outputDir, "task-plan-initial.md")));
  assert.ok(!fs.existsSync(path.join(outputDir, "task-discovery.md")));

  const {
    persistLocalFallbackClarificationQuestions,
  } = require("../../runtime/clarification/local-fallback-questions");
  const fb = persistLocalFallbackClarificationQuestions({
    outputDirAbs: outputDir,
    runId,
  });
  assert.strictEqual(fb.ok, true, fb.error?.message);

  const qDoc = JSON.parse(
    fs.readFileSync(path.join(outputDir, QUESTIONS_FILE), "utf-8"),
  );
  const answersPayload = qDoc.questions.map((q) => ({
    question_id: q.id,
    value: `resposta-${q.id}`,
  }));

  const submitted = await runClarificationMutation(runId, {
    answerPairs: answersPayload,
    skipLlm: true,
    cwd: root,
    jobId: "job_test_fallback",
    projectId: "proj_test",
  });
  assert.strictEqual(submitted.ok, true, JSON.stringify(submitted));
  assert.ok(fs.existsSync(path.join(outputDir, "task-plan-initial.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "task-discovery.md")));
  assert.ok(fs.existsSync(path.join(outputDir, "clarification-answers.json")));
  assert.ok(fs.existsSync(path.join(outputDir, "task-plan-refined.md")));
  assert.strictEqual(submitted.phase2Status, "plan_refined");
  assert.strictEqual(submitted.refinement?.available, true);
  assert.strictEqual(submitted.refineSideEffects?.localInitialPlanWritten, true);
});
