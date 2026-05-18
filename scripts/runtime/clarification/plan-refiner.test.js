"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  MARKER,
  parseTaskPlanRefinedResponse,
  validateTaskPlanRefinedMarkdown,
  refineTaskPlan,
  PLAN_REFINED_FILE,
  buildDeterministicRefinedMarkdown,
} = require("./plan-refiner");
const { QUESTIONS_FILE } = require("./question-generator");
const { ANSWERS_FILE } = require("./answers");

const REPO_ROOT = path.resolve(__dirname, "../../..");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const VALID_CORE = `${MARKER}
## Objetivo
Obj.

## Escopo Refinado
Esc.

## Decisões Confirmadas
Dec.

## Passos Propostos
1. Um passo.

## Critérios de Aceite
- Critério.

## Fora de Escopo
Fora.

## Riscos Restantes
Risco.
`;

test("parseTaskPlanRefinedResponse aceita markdown válido", () => {
  const r = parseTaskPlanRefinedResponse(VALID_CORE);
  assert.strictEqual(r.ok, true);
  assert.ok(String(r.coreMarkdown).startsWith(MARKER));
});

test("parseTaskPlanRefinedResponse falha sem marcador", () => {
  const r = parseTaskPlanRefinedResponse("## Objetivo\nx");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "CLARIFY_REFINE_PARSE_MISSING_MARKER");
});

test("validateTaskPlanRefinedMarkdown exige secções H2", () => {
  const bad = `${MARKER}
## Objetivo
Só uma secção.
`;
  const v = validateTaskPlanRefinedMarkdown(bad);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes("Escopo Refinado")));
});

test("validateTaskPlanRefinedMarkdown aceita documento completo", () => {
  const v = validateTaskPlanRefinedMarkdown(VALID_CORE);
  assert.strictEqual(v.ok, true);
});

test("refineTaskPlan skip-llm gera task-plan-refined.md", async () => {
  const dir = tmp("sb-refine-skip-");
  try {
    fs.writeFileSync(
      path.join(dir, "task-plan-initial.md"),
      "---TASK_PLAN_INITIAL---\n## Objetivo\nInicial.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "task-discovery.md"),
      "## Entendimento\nDiscovery.",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "intake-classification.json"),
      JSON.stringify({ schema_version: "1.0.0", label: "test" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        questions: [
          {
            id: "q1",
            prompt: "P?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
        recommendations: [],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ANSWERS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        answers: [{ question_id: "q1", value: "resposta", source: "user" }],
      }),
      "utf-8",
    );

    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: true,
      llmClient: null,
    });
    assert.strictEqual(r.ok, true);
    const fp = path.join(dir, PLAN_REFINED_FILE);
    assert.ok(fs.existsSync(fp));
    const raw = fs.readFileSync(fp, "utf-8");
    assert.ok(raw.includes("plan-refine-meta"));
    assert.ok(raw.includes('"mode":"skip-llm"'));
    assert.ok(raw.includes(MARKER));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("refineTaskPlan com mock LLM gera plano refinado", async () => {
  const dir = tmp("sb-refine-mock-");
  const mockBody = VALID_CORE;
  try {
    fs.writeFileSync(path.join(dir, "task-plan-initial.md"), "plan", "utf-8");
    fs.writeFileSync(path.join(dir, "task-discovery.md"), "disc", "utf-8");
    fs.writeFileSync(
      path.join(dir, "intake-classification.json"),
      JSON.stringify({}),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({
        round: 1,
        questions: [
          {
            id: "q1",
            prompt: "P?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ANSWERS_FILE),
      JSON.stringify({
        round: 1,
        answers: [{ question_id: "q1", value: "ok", source: "user" }],
      }),
      "utf-8",
    );

    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: false,
      llmClient: {
        responses: {
          create: async () => ({ output_text: mockBody }),
        },
      },
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.mode, "llm");
    const raw = fs.readFileSync(path.join(dir, PLAN_REFINED_FILE), "utf-8");
    assert.ok(raw.includes('"mode":"llm"'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("refineTaskPlan erro sem answers", async () => {
  const dir = tmp("sb-refine-noans-");
  try {
    fs.writeFileSync(path.join(dir, "task-plan-initial.md"), "p", "utf-8");
    fs.writeFileSync(path.join(dir, "task-discovery.md"), "d", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({ round: 1, questions: [] }),
      "utf-8",
    );
    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: true,
      llmClient: null,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_REFINE_ANSWERS_MISSING");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("refineTaskPlan skip-llm sem task-plan/discovery gera stubs + task-plan-refined.md", async () => {
  const dir = tmp("sb-refine-skip-noinit-");
  try {
    fs.writeFileSync(
      path.join(dir, "intake-classification.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        classification: "needs_context",
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "intake-discovery-analysis.json"),
      JSON.stringify({ schema_version: "1.0.0", stub: true }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, "metadata.json"),
      JSON.stringify({
        intake_task_preview: "Tarefa de teste sem markdown de intake LLM.",
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        questions: [
          {
            id: "local_fallback_q1",
            prompt: "Qual é o objetivo final desta atividade?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
          {
            id: "local_fallback_q2",
            prompt: "Qual parte deve ser feita primeiro?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
          {
            id: "local_fallback_q3",
            prompt: "Quais arquivos?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
          {
            id: "local_fallback_q4",
            prompt: "Fora de escopo?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
          {
            id: "local_fallback_q5",
            prompt: "Critério de sucesso?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
        recommendations: [],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ANSWERS_FILE),
      JSON.stringify({
        schema_version: "1.0.0",
        round: 1,
        answers: [
          { question_id: "local_fallback_q1", value: "Obj X", source: "user" },
          { question_id: "local_fallback_q2", value: "Parte A", source: "user" },
          { question_id: "local_fallback_q3", value: "ficheiro.ts", source: "user" },
          { question_id: "local_fallback_q4", value: "nada externo", source: "user" },
          { question_id: "local_fallback_q5", value: "build ok", source: "user" },
        ],
      }),
      "utf-8",
    );

    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: true,
      llmClient: null,
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.localInitialPlanWritten, true);
    assert.strictEqual(r.localDiscoveryWritten, true);
    assert.ok(fs.existsSync(path.join(dir, "task-plan-initial.md")));
    assert.ok(fs.existsSync(path.join(dir, "task-discovery.md")));
    const fp = path.join(dir, PLAN_REFINED_FILE);
    assert.ok(fs.existsSync(fp));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("refineTaskPlan erro com blocking pendente", async () => {
  const dir = tmp("sb-refine-block-");
  try {
    fs.writeFileSync(path.join(dir, "task-plan-initial.md"), "p", "utf-8");
    fs.writeFileSync(path.join(dir, "task-discovery.md"), "d", "utf-8");
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({
        round: 1,
        questions: [
          {
            id: "qb",
            prompt: "B?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ANSWERS_FILE),
      JSON.stringify({ round: 1, answers: [] }),
      "utf-8",
    );
    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: true,
      llmClient: null,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_REFINE_BLOCKING_PENDING");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("refineTaskPlan sem markdown intake e skipLlm=false falha com mensagem legível", async () => {
  const dir = tmp("sb-refine-noskip-noinit-");
  try {
    fs.writeFileSync(path.join(dir, "intake-classification.json"), "{}", "utf-8");
    fs.writeFileSync(
      path.join(dir, QUESTIONS_FILE),
      JSON.stringify({
        round: 1,
        questions: [
          {
            id: "q1",
            prompt: "P?",
            type: "free_text",
            blocking: true,
            options: [],
            evidence_refs: [],
          },
        ],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(dir, ANSWERS_FILE),
      JSON.stringify({
        round: 1,
        answers: [{ question_id: "q1", value: "ok", source: "user" }],
      }),
      "utf-8",
    );
    const r = await refineTaskPlan({
      outputDirAbs: dir,
      repoRoot: REPO_ROOT,
      skipLlm: false,
      llmClient: null,
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error.code, "CLARIFY_REFINE_PLAN_INITIAL_MISSING");
    assert.ok(
      String(r.error.message).includes("Não foi possível gerar o plano refinado"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("buildDeterministicRefinedMarkdown inclui marcador e secções", () => {
  const md = buildDeterministicRefinedMarkdown({
    taskPlanInitial: "x",
    taskDiscovery: "y",
    questionsJson: {},
    answersJson: { answers: [{ question_id: "a", value: "v" }] },
    classificationJson: {},
  });
  const v = validateTaskPlanRefinedMarkdown(md);
  assert.strictEqual(v.ok, true);
});
