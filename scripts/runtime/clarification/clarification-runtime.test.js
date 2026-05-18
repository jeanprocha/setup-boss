"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const { executeIntake } = require("../intake/intake-runtime");
const {
  executeClarification,
  parseClarifyCliArgs,
  PHASE2_INITIAL_STATUS,
  PHASE2_QUESTIONS_STATUS,
  PHASE2_ANSWERS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
  SESSION_FILE,
  QUESTIONS_FILE,
  ANSWERS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
} = require("./clarification-runtime");
const { validateIntakeArtifacts } = require("../intake/intake-manifest");
const { resolveRunIndexPath } = require("../../../core/run-resolver");
const { MARKER: TASK_PLAN_REFINE_MARKER } = require("./plan-refiner");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const { ensureDocsIaDir } = require("../../test-helpers/ensure-docs-ia-dir");

function tmp(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  ensureDocsIaDir(root);
  return root;
}

function cleanupRunIndex(runId) {
  const p = resolveRunIndexPath(runId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

test("parseClarifyCliArgs lê --run, --json e --skip-llm", () => {
  const a = parseClarifyCliArgs(["--json", "--skip-llm", "--run", "abc-def"]);
  assert.strictEqual(a.run, "abc-def");
  assert.strictEqual(a.json, true);
  assert.strictEqual(a.skipLlm, true);
  const b = parseClarifyCliArgs(["--run=xyz"]);
  assert.strictEqual(b.run, "xyz");
  assert.strictEqual(b.json, false);
  assert.strictEqual(b.skipLlm, false);
});

test("executeClarification sem runOrPath", async () => {
  const r = await executeClarification({ runOrPath: "", cwd: REPO_ROOT });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "CLARIFY_RUN_OR_PATH_MISSING");
  assert.strictEqual(r.runId, null);
  assert.deepStrictEqual(r.artifacts, []);
});

test("executeClarification run inexistente", async () => {
  const r = await executeClarification({
    runOrPath: "nonexistent-run-id-zzzzzz-999999",
    cwd: REPO_ROOT,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "CLARIFY_RESOLVE_FAILED");
  assert.strictEqual(r.runId, null);
});

test("executeClarification rejeita corrida não-intake", async () => {
  const root = tmp("sb-clarify-not-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task só para clarify not intake",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    const rcPath = path.join(intake.outputDir, "run-context.json");
    const rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
    rc.run_type = "architect";
    fs.writeFileSync(rcPath, JSON.stringify(rc, null, 2), "utf-8");

    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_NOT_INTAKE_RUN");
    assert.strictEqual(r.runId, runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification falha se validateIntakeArtifacts falha", async () => {
  const root = tmp("sb-clarify-bad-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task para validação clarify",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    fs.unlinkSync(path.join(intake.outputDir, "intake-manifest.json"));

    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_INTAKE_ARTIFACTS_INVALID");
    assert.ok(
      r.error.message.includes("intake-manifest.json"),
      "mensagem deve refletir validateIntakeArtifacts",
    );
    assert.strictEqual(validateIntakeArtifacts(intake.outputDir).ok, false);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification inicializa phase2 e clarification-session", async () => {
  const root = tmp("sb-clarify-ok-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task clarify base",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;

    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.answersCount, 0);
    assert.strictEqual(r.pendingBlockingCount, 0);
    assert.strictEqual(r.runId, runId);
    assert.strictEqual(r.phase2Status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(r.currentRound, 1);
    assert.strictEqual(r.questionsCount, 5);
    assert.ok(r.artifacts.includes(SESSION_FILE));
    assert.ok(r.artifacts.includes("run-context.json"));
    assert.ok(r.artifacts.includes(QUESTIONS_FILE));

    const ctx = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.ok(ctx.phase1);
    assert.strictEqual(ctx.phase1.status, "classified");
    assert.strictEqual(ctx.phase2.schema_version, "1.0.0");
    assert.strictEqual(ctx.phase2.status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(ctx.phase2.current_round, 1);
    assert.ok(typeof ctx.phase2.started_at === "string");
    assert.ok(ctx.phase2.artifacts.includes(QUESTIONS_FILE));

    const session = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, SESSION_FILE), "utf-8"),
    );
    assert.strictEqual(session.schema_version, "1.0.0");
    assert.strictEqual(session.run_id, runId);
    assert.strictEqual(session.status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(session.current_round, 1);
    assert.strictEqual(session.rounds.length, 1);
    assert.strictEqual(session.rounds[0].round, 1);
    assert.strictEqual(session.rounds[0].status, "questions_generated");

    const qf0 = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, QUESTIONS_FILE), "utf-8"),
    );
    assert.strictEqual(qf0.source, "local_fallback");
    assert.strictEqual(qf0.reason, "skip_llm_needs_context_without_questions");
    assert.strictEqual(qf0.questions.length, 5);

    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.answersCount, 0);
    assert.strictEqual(r2.pendingBlockingCount, 0);
    assert.strictEqual(r2.phase2Status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(r2.currentRound, 1);
    assert.strictEqual(r2.questionsCount, 5);
    assert.deepStrictEqual(r2.artifacts, []);
    assert.ok(fs.existsSync(path.join(intake.outputDir, QUESTIONS_FILE)));
    const qf = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, QUESTIONS_FILE), "utf-8"),
    );
    assert.strictEqual(qf.source, "local_fallback");
    assert.strictEqual(qf.questions.length, 5);

    const sessionAfter = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, SESSION_FILE), "utf-8"),
    );
    assert.strictEqual(sessionAfter.status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(sessionAfter.current_round, 1);
    assert.strictEqual(sessionAfter.rounds.length, 1);
    assert.strictEqual(sessionAfter.rounds[0].round, 1);
    assert.strictEqual(sessionAfter.rounds[0].status, "questions_generated");
    assert.strictEqual(sessionAfter.rounds[0].questions_artifact, QUESTIONS_FILE);

    const ctx2 = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx2.phase2.status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(ctx2.phase2.current_round, 1);
    assert.ok(ctx2.phase2.artifacts.includes(QUESTIONS_FILE));

    const r3 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r3.ok, true);
    assert.strictEqual(r3.answersCount, 0);
    assert.strictEqual(r3.pendingBlockingCount, 0);
    assert.deepStrictEqual(r3.artifacts, []);
    assert.strictEqual(r3.questionsCount, 5);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification resolve por runId via índice", async () => {
  const root = tmp("sb-clarify-idx-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task index clarify",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;

    const r = await executeClarification({
      runOrPath: runId,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.answersCount, 0);
    assert.strictEqual(r.pendingBlockingCount, 0);
    assert.strictEqual(r.runId, runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scripts/clarify.js --json devolve JSON válido", async () => {
  const root = tmp("sb-clarify-cli-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task cli json clarify",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;

    const clarifyJs = path.join(REPO_ROOT, "scripts", "clarify.js");
    const pr = spawnSync(
      process.execPath,
      [clarifyJs, "--run", intake.outputDir, "--json"],
      {
        cwd: REPO_ROOT,
        encoding: "utf-8",
      },
    );
    assert.strictEqual(pr.status, 0, pr.stderr || pr.stdout);
    const out = JSON.parse(pr.stdout.trim());
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.runId, runId);
    assert.strictEqual(out.status, PHASE2_INITIAL_STATUS);
    assert.strictEqual(out.phase2_status, PHASE2_INITIAL_STATUS);
    assert.strictEqual(out.round, 0);
    assert.strictEqual(out.current_round, 0);
    assert.strictEqual(out.questions_count, 0);
    assert.strictEqual(out.answers_count, 0);
    assert.strictEqual(out.pending_blocking_count, 0);
    assert.ok("artifact" in out);
    assert.ok(Array.isArray(out.operation_artifacts));
    assert.ok(Array.isArray(out.artifacts));
    assert.ok(out.next_action && typeof out.next_action.command_hint === "string");
    assert.strictEqual(out.passive_resume, true);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification sem markdown intake falha na geração sem skip-llm", async () => {
  const root = tmp("sb-clarify-no-md-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task curta",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    const r1 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r1.ok, true);
    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: false,
    });
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.error.code, "CLARIFY_QUESTIONS_MISSING_INPUT");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const MOCK_LLM_INTAKE = `---TASK_DISCOVERY---
## Entendimento da Task
- Pedido de teste clarify 2.2.

## Contexto IA Relevante
- Resumo injectado.

## Ambiguidades Identificadas
- Nenhuma crítica.

## Gaps de Contexto
- N/A.

## Arquivos Prováveis de Impacto
- src/

## Riscos Iniciais
- Baixo.

## Recomendação de Classificação
Provisório: clarificar se necessário.
---TASK_PLAN_INITIAL---
## Objetivo
Testar clarify.

## Escopo Preliminar
Só testes.

## Passos Propostos
1. Passo um.

## Critérios de Aceite Iniciais
- OK.

## Bloqueadores Conhecidos
- Nenhum.
`;

const MOCK_CLARIFY_LLM = `---CLARIFICATION_QUESTIONS_JSON---
{
  "questions": [
    {
      "id": "q_test_1",
      "prompt": "Confirma prioridade?",
      "type": "confirm",
      "blocking": true,
      "options": [],
      "evidence_refs": []
    }
  ],
  "recommendations": []
}
`;

test("executeClarification com llmClient mock gera clarification-questions.json", async () => {
  const root = tmp("sb-clarify-mock-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg:
        "task para mock clarify com descrição suficientemente longa para não disparar task_description_short no discovery.",
      cwd: root,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: MOCK_LLM_INTAKE }),
        },
      },
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;

    const r1 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.answersCount, 0);
    assert.strictEqual(r1.pendingBlockingCount, 0);

    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: MOCK_CLARIFY_LLM }),
        },
      },
    });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.answersCount, 0);
    assert.strictEqual(r2.pendingBlockingCount, 0);
    assert.strictEqual(r2.phase2Status, PHASE2_QUESTIONS_STATUS);
    assert.strictEqual(r2.questionsCount, 1);
    assert.ok(r2.artifacts.includes(QUESTIONS_FILE));

    const qf = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, QUESTIONS_FILE), "utf-8"),
    );
    assert.strictEqual(qf.schema_version, "1.0.0");
    assert.strictEqual(qf.round, 1);
    assert.strictEqual(qf.source.agent, "task-clarify.md");
    assert.strictEqual(qf.source.mode, "llm");
    assert.strictEqual(qf.questions[0].id, "q_test_1");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeCustomQuestions(outputDir) {
  const questionsDoc = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    round: 1,
    questions: [
      {
        id: "qb",
        prompt: "Descrição?",
        type: "free_text",
        blocking: true,
        options: [],
        evidence_refs: [],
      },
      {
        id: "qc",
        prompt: "Escolha",
        type: "single_choice",
        blocking: false,
        options: ["A", "B"],
        evidence_refs: [],
      },
      {
        id: "qd",
        prompt: "Confirma?",
        type: "confirm",
        blocking: false,
        options: [],
        evidence_refs: [],
      },
    ],
    recommendations: [],
    source: { agent: "test", mode: "test" },
  };
  fs.writeFileSync(
    path.join(outputDir, QUESTIONS_FILE),
    JSON.stringify(questionsDoc, null, 2),
    "utf-8",
  );
}

test("executeClarification persiste respostas válidas e actualiza session/run-context", async () => {
  const root = tmp("sb-clarify-ans-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task answers clarify",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);

    const ra = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "resposta mínima" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    assert.strictEqual(ra.ok, true);
    assert.strictEqual(ra.phase2Status, PHASE2_ANSWERS_STATUS);
    assert.strictEqual(ra.answersCount, 3);
    assert.strictEqual(ra.pendingBlockingCount, 0);
    assert.ok(ra.artifacts.includes(ANSWERS_FILE));

    const af = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, ANSWERS_FILE), "utf-8"),
    );
    assert.strictEqual(af.schema_version, "1.0.0");
    assert.strictEqual(af.round, 1);
    assert.strictEqual(af.answers.length, 3);
    assert.strictEqual(af.answers.find((x) => x.question_id === "qd").value, true);

    const sess = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, SESSION_FILE), "utf-8"),
    );
    assert.strictEqual(sess.status, PHASE2_ANSWERS_STATUS);
    const r1 = sess.rounds.find((x) => x.round === 1);
    assert.strictEqual(r1.status, "answers_recorded");
    assert.strictEqual(r1.answers_artifact, ANSWERS_FILE);
    assert.strictEqual(r1.answers_count, 3);

    const ctx = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase2.status, PHASE2_ANSWERS_STATUS);
    assert.ok(ctx.phase2.artifacts.includes(ANSWERS_FILE));

    const rb = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [{ question_id: "qb", value: "outro" }],
    });
    assert.strictEqual(rb.ok, true);
    assert.deepStrictEqual(rb.artifacts, []);
    assert.strictEqual(rb.answersCount, 3);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification respostas: question_id inexistente falha", async () => {
  const root = tmp("sb-clarify-ans-badid-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task bad id",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [{ question_id: "nope", value: "x" }],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_ANSWERS_VALIDATION");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification respostas: blocking sem resposta falha", async () => {
  const root = tmp("sb-clarify-ans-block-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task blocking",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qc", value: "B" },
        { question_id: "qd", value: "no" },
      ],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_ANSWERS_VALIDATION");
    assert.ok(typeof r.pendingBlockingCount === "number");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification respostas: single_choice inválido falha", async () => {
  const root = tmp("sb-clarify-ans-sc-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task sc bad",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "ok" },
        { question_id: "qc", value: "Z" },
        { question_id: "qd", value: "yes" },
      ],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_ANSWERS_VALIDATION");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification respostas: confirm aceita boolean", async () => {
  const root = tmp("sb-clarify-ans-bool-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task bool confirm",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    const answersFile = path.join(root, "user-answers.json");
    fs.writeFileSync(
      answersFile,
      JSON.stringify(
        {
          answers: [
            { question_id: "qb", value: "texto", source: "user" },
            { question_id: "qc", value: "A", source: "user" },
            { question_id: "qd", value: false, source: "user" },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answersPath: answersFile,
    });
    assert.strictEqual(r.ok, true);
    const af = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, ANSWERS_FILE), "utf-8"),
    );
    assert.strictEqual(af.answers.find((x) => x.question_id === "qd").value, false);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseClarifyCliArgs lê --answers e --overwrite", () => {
  const p = parseClarifyCliArgs([
    "--run",
    "x",
    "--answers",
    "a.json",
    "--overwrite",
  ]);
  assert.strictEqual(p.answersPath, "a.json");
  assert.strictEqual(p.overwrite, true);
});

test("executeClarification rejeita --answer duplicado na CLI", async () => {
  const root = tmp("sb-clarify-dupcli-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task dup cli",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "a", value: "1" },
        { question_id: "a", value: "2" },
      ],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_ANSWERS_DUPLICATE_CLI");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const MOCK_PLAN_REFINED = `---TASK_PLAN_REFINED---
## Objetivo
Objetivo refinado.

## Escopo Refinado
Escopo refinado.

## Decisões Confirmadas
Decisões.

## Passos Propostos
1. Passo refinado.

## Critérios de Aceite
- Aceite.

## Fora de Escopo
Nada extra.

## Riscos Restantes
Baixo.
`;

test("parseClarifyCliArgs lê --refine", () => {
  const p = parseClarifyCliArgs(["--run", "z", "--refine"]);
  assert.strictEqual(p.refine, true);
  assert.strictEqual(p.run, "z");
});

test("executeClarification rejeita --refine com --answer na mesma invocação", async () => {
  const r = await executeClarification({
    runOrPath: "any",
    cwd: REPO_ROOT,
    refine: true,
    answerPairs: [{ question_id: "x", value: "y" }],
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "CLARIFY_CLI_CONFLICT");
});

test("executeClarification --refine skip-llm gera task-plan-refined e actualiza session/run-context", async () => {
  const root = tmp("sb-clarify-refine-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task refine clarify",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "resposta" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });

    fs.writeFileSync(
      path.join(intake.outputDir, "task-discovery.md"),
      "## Entendimento\nConteúdo mínimo para refine.\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(intake.outputDir, "task-plan-initial.md"),
      "---TASK_PLAN_INITIAL---\n## Objetivo\nPlano inicial de teste.\n",
      "utf-8",
    );

    const r1 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.phase2Status, PHASE2_PLAN_REFINED_STATUS);
    assert.ok(r1.artifacts.includes(PLAN_REFINED_FILE));
    assert.ok(fs.existsSync(path.join(intake.outputDir, PLAN_REFINED_FILE)));

    const sess = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, SESSION_FILE), "utf-8"),
    );
    assert.strictEqual(sess.status, PHASE2_PLAN_REFINED_STATUS);
    const r1Entry = sess.rounds.find((x) => x.round === 1);
    assert.strictEqual(r1Entry.status, "plan_refined");
    assert.strictEqual(r1Entry.plan_artifact, PLAN_REFINED_FILE);

    const ctx = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase2.status, PHASE2_PLAN_REFINED_STATUS);
    assert.ok(ctx.phase2.artifacts.includes(PLAN_REFINED_FILE));
    assert.strictEqual(ctx.phase2.plan.artifact, PLAN_REFINED_FILE);
    assert.strictEqual(ctx.phase2.plan.status, "refined");

    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    assert.strictEqual(r2.ok, true);
    assert.deepStrictEqual(r2.artifacts, []);
    assert.strictEqual(r2.phase2Status, PHASE2_PLAN_REFINED_STATUS);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --refine com mock LLM", async () => {
  const root = tmp("sb-clarify-refine-llm-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg:
        "task refine llm com descrição suficientemente longa para não disparar task_description_short no discovery.",
      cwd: root,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: MOCK_LLM_INTAKE }),
        },
      },
    });
    assert.strictEqual(intake.ok, true);
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: MOCK_CLARIFY_LLM }),
        },
      },
    });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [{ question_id: "q_test_1", value: "yes" }],
    });

    const rr = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: MOCK_PLAN_REFINED }),
        },
      },
    });
    assert.strictEqual(rr.ok, true);
    assert.strictEqual(rr.phase2Status, PHASE2_PLAN_REFINED_STATUS);
    const body = fs.readFileSync(
      path.join(intake.outputDir, PLAN_REFINED_FILE),
      "utf-8",
    );
    assert.ok(body.includes("Passo refinado"));
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --refine falha sem clarification-answers.json", async () => {
  const root = tmp("sb-clarify-refine-noa-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task sem answers refine",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_REFINE_ANSWERS_MISSING");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --refine falha com blocking pendente", async () => {
  const root = tmp("sb-clarify-refine-block-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task refine block",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    fs.writeFileSync(
      path.join(intake.outputDir, ANSWERS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        answered_at: new Date().toISOString(),
        answers: [],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(intake.outputDir, "task-discovery.md"),
      "## D\nx\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(intake.outputDir, "task-plan-initial.md"),
      "## Objetivo\nx\n",
      "utf-8",
    );
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_REFINE_BLOCKING_PENDING");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --refine --overwrite regenera task-plan-refined", async () => {
  const root = tmp("sb-clarify-refine-ov-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task refine overwrite",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(
      path.join(intake.outputDir, "task-discovery.md"),
      "## D\nstub\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(intake.outputDir, "task-plan-initial.md"),
      "## Objetivo\nstub\n",
      "utf-8",
    );
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    fs.writeFileSync(
      path.join(intake.outputDir, PLAN_REFINED_FILE),
      "CORROMPIDO",
      "utf-8",
    );
    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
      overwrite: true,
    });
    assert.strictEqual(r2.ok, true);
    assert.ok(r2.artifacts.includes(PLAN_REFINED_FILE));
    const fixed = fs.readFileSync(
      path.join(intake.outputDir, PLAN_REFINED_FILE),
      "utf-8",
    );
    assert.ok(fixed.includes(TASK_PLAN_REFINE_MARKER));
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parseClarifyCliArgs lê --approve, --reject e --approval-notes", () => {
  const p = parseClarifyCliArgs([
    "--run",
    "r",
    "--approve",
    "--approval-notes",
    "nota aqui",
  ]);
  assert.strictEqual(p.approve, true);
  assert.strictEqual(p.reject, false);
  assert.strictEqual(p.approvalNotes, "nota aqui");
  const q = parseClarifyCliArgs(["--run", "r", "--reject", "--approval-notes=xyz"]);
  assert.strictEqual(q.reject, true);
  assert.strictEqual(q.approvalNotes, "xyz");
});

test("executeClarification --approve gera approval-state e ready_for_execution", async () => {
  const root = tmp("sb-appr-approve-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task approve pipeline",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(
      path.join(intake.outputDir, "task-discovery.md"),
      "## D\nx\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(intake.outputDir, "task-plan-initial.md"),
      "## O\nx\n",
      "utf-8",
    );
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });

    const ra = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
      approvalNotes: "segue",
    });
    assert.strictEqual(ra.ok, true);
    assert.strictEqual(ra.phase2Status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(ra.approvalStatus, "approved");
    assert.ok(typeof ra.planSha256 === "string" && ra.planSha256.length === 64);
    assert.ok(fs.existsSync(path.join(intake.outputDir, APPROVAL_STATE_FILE)));
    const adm = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, APPROVAL_STATE_FILE), "utf-8"),
    );
    assert.strictEqual(adm.status, "approved");
    assert.strictEqual(adm.notes, "segue");
    const ctx = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase2.status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(ctx.phase2.approval.status, "approved");
    assert.strictEqual(ctx.phase2.approval.plan_sha256, ra.planSha256);
    assert.strictEqual(ctx.phase2.approval.artifact, APPROVAL_STATE_FILE);
    assert.strictEqual(ctx.phase3.complexity.status, "complexity_analysis_completed");
    assert.ok(Number.isInteger(ctx.phase3.complexity.overall));
    assert.ok(typeof ctx.phase3.complexity.classification === "string");
    assert.strictEqual(ctx.phase3.ai_strategy.status, "ai_strategy_completed");
    assert.ok(["basic", "standard", "expert"].includes(ctx.phase3.ai_strategy.recommended_mode));
    assert.strictEqual(ctx.phase3.decomposition.status, "decomposition_completed");
    assert.ok(Number.isInteger(ctx.phase3.decomposition.subtask_count));
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "decomposition.json")));
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "execution-order.json")));
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "subtasks", "001.json")));
    assert.strictEqual(ctx.phase3.execution_order.status, "execution_order_completed");
    assert.strictEqual(ctx.phase3.execution_order.ordering_mode, "linear");
    assert.strictEqual(ctx.phase3.shared_context.status, "shared_runtime_context_completed");
    assert.strictEqual(ctx.phase3.shared_context.artifact, "strategy/shared-runtime-context.json");
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "shared-runtime-context.json")));
    assert.strictEqual(ctx.phase3.readiness.status, "strategy_ready");
    assert.strictEqual(ctx.phase3.readiness.artifact, "strategy/strategy-readiness.json");
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "strategy-readiness.json")));
    const sess = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, SESSION_FILE), "utf-8"),
    );
    assert.strictEqual(sess.status, PHASE2_READY_FOR_EXECUTION);
    const rr = sess.rounds.find((x) => x.round === 1);
    assert.strictEqual(rr.approval_artifact, APPROVAL_STATE_FILE);
    assert.strictEqual(rr.status, "approved");
    assert.strictEqual(ctx.phase3.status, "strategy_runtime_initialized");
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "strategy-manifest.json")));
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "execution-strategy.json")));
    assert.ok(fs.existsSync(path.join(intake.outputDir, "strategy", "ai-strategy.json")));
    const diag = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "strategy", "strategy-diagnostics.json"), "utf-8"),
    );
    assert.strictEqual(diag.events[0].event, "strategy_runtime_started");
    assert.strictEqual(diag.events[3].event, "ai_strategy_started");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --reject define approval_rejected", async () => {
  const root = tmp("sb-appr-rej-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task reject pipeline",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });

    const rr = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      reject: true,
      approvalNotes: "não",
    });
    assert.strictEqual(rr.ok, true);
    assert.strictEqual(rr.phase2Status, PHASE2_APPROVAL_REJECTED);
    assert.strictEqual(rr.approvalStatus, "rejected");
    const ctx = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase2.status, PHASE2_APPROVAL_REJECTED);
    assert.strictEqual(ctx.phase2.approval.status, "rejected");
    const adm = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, APPROVAL_STATE_FILE), "utf-8"),
    );
    assert.strictEqual(adm.status, "rejected");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --approve falha sem task-plan-refined.md", async () => {
  const root = tmp("sb-appr-noplan-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task sem plano refinado",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_APPROVAL_PLAN_MISSING");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --approve falha com blocking pendente", async () => {
  const root = tmp("sb-appr-block-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task approve block",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    fs.writeFileSync(
      path.join(intake.outputDir, ANSWERS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        answered_at: new Date().toISOString(),
        answers: [],
      }),
      "utf-8",
    );
    const r = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_APPROVAL_BLOCKING_PENDING");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --approve idempotente sem --overwrite", async () => {
  const root = tmp("sb-appr-idem-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task approve idem",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    const r1 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    const r2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    assert.deepStrictEqual(r2.artifacts, []);
    assert.strictEqual(r2.planSha256, r1.planSha256);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification --approve --overwrite recria approval-state", async () => {
  const root = tmp("sb-appr-ov-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task approve overwrite",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    const sha1 = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, APPROVAL_STATE_FILE), "utf-8"),
    ).plan_sha256;
    fs.appendFileSync(path.join(intake.outputDir, PLAN_REFINED_FILE), "\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
      overwrite: true,
    });
    const sha2 = JSON.parse(
      fs.readFileSync(path.join(intake.outputDir, APPROVAL_STATE_FILE), "utf-8"),
    ).plan_sha256;
    assert.notStrictEqual(sha1, sha2);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scripts/clarify.js --approve --json devolve JSON válido", async () => {
  const root = tmp("sb-appr-cli-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task approve cli json",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    const clarifyJs = path.join(REPO_ROOT, "scripts", "clarify.js");
    const pr = spawnSync(
      process.execPath,
      [clarifyJs, "--run", intake.outputDir, "--approve", "--json"],
      { cwd: REPO_ROOT, encoding: "utf-8" },
    );
    assert.strictEqual(pr.status, 0, pr.stderr || pr.stdout);
    const out = JSON.parse(pr.stdout.trim());
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(out.approval_status, "approved");
    assert.ok(typeof out.plan_sha256 === "string" && out.plan_sha256.length === 64);
    assert.strictEqual(out.plan_ref, PLAN_REFINED_FILE);
    assert.strictEqual(out.artifact, APPROVAL_STATE_FILE);
    assert.ok(out.next_action && out.next_action.command_hint);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeClarification passivo em ready_for_execution não altera run-context", async () => {
  const root = tmp("sb-clarify-ready-passive-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task ready passive",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    writeCustomQuestions(intake.outputDir);
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      answerPairs: [
        { question_id: "qb", value: "r" },
        { question_id: "qc", value: "A" },
        { question_id: "qd", value: "yes" },
      ],
    });
    fs.writeFileSync(path.join(intake.outputDir, "task-discovery.md"), "## D\n", "utf-8");
    fs.writeFileSync(path.join(intake.outputDir, "task-plan-initial.md"), "## O\n", "utf-8");
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      approve: true,
    });
    const rcPath = path.join(intake.outputDir, "run-context.json");
    const snap1 = JSON.parse(fs.readFileSync(rcPath, "utf-8")).phase2;
    const p1 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    const p2 = await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(p1.ok, true);
    assert.strictEqual(p2.ok, true);
    assert.strictEqual(p1.phase2Status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(p2.phase2Status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(p1.passiveResume, true);
    const snap2 = JSON.parse(fs.readFileSync(rcPath, "utf-8")).phase2;
    assert.strictEqual(JSON.stringify(snap1), JSON.stringify(snap2));
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scripts/clarify.js sem flags mostra próximo passo sugerido", async () => {
  const root = tmp("sb-clarify-human-next-");
  let runId = null;
  try {
    const intake = await executeIntake({
      projectArg: root,
      taskArg: "task human next step clarify",
      cwd: root,
      skipLlm: true,
    });
    runId = intake.runId;
    await executeClarification({ runOrPath: intake.outputDir, cwd: REPO_ROOT });
    await executeClarification({
      runOrPath: intake.outputDir,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    const clarifyJs = path.join(REPO_ROOT, "scripts", "clarify.js");
    const pr = spawnSync(process.execPath, [clarifyJs, "--run", intake.outputDir], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });
    assert.strictEqual(pr.status, 0, pr.stderr || pr.stdout);
    assert.ok(
      pr.stdout.includes("Próximo passo sugerido:"),
      pr.stdout.slice(0, 500),
    );
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
