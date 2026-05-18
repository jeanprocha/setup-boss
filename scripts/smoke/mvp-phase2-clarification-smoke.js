#!/usr/bin/env node
/**
 * Smoke operacional — MVP Fase 2 (clarification runtime pós-intake).
 * Sem rede: intake com llmClient mock, clarify init → perguntas --skip-llm,
 * respostas vazias (ficheiro), refine --skip-llm, --approve, validateClarificationArtifacts.
 *
 * Uso: node scripts/smoke/mvp-phase2-clarification-smoke.js
 *      npm run smoke:mvp-phase2-clarification
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { executeIntake } = require("../runtime/intake/intake-runtime");
const {
  executeClarification,
  PHASE2_READY_FOR_EXECUTION,
  SESSION_FILE,
  QUESTIONS_FILE,
  ANSWERS_FILE,
  PLAN_REFINED_FILE,
  APPROVAL_STATE_FILE,
} = require("../runtime/clarification/clarification-runtime");
const { validateClarificationArtifacts } = require("../runtime/clarification/validate-clarification-artifacts");
const { resolveRunIndexPath } = require("../../core/run-resolver");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const LONG_INLINE =
  "Descrição longa o suficiente para evitar task_description_short no discovery durante o smoke MVP Fase 2 clarification.";

/** Resposta mínima válida para o parser de intake (sem rede). */
const MOCK_LLM_INTAKE = `---TASK_DISCOVERY---
## Entendimento da Task
- Smoke Fase 2 clarification.

## Contexto IA Relevante
- Resumo injectado.

## Ambiguidades Identificadas
- Nenhuma crítica.

## Gaps de Contexto
- N/A.

## Arquivos Prováveis de Impacto
- \`src/\` se existir.

## Riscos Iniciais
- Baixo.

## Recomendação de Classificação
Provisório: seguir para clarificação.
---TASK_PLAN_INITIAL---
## Objetivo
Validar clarificação end-to-end no smoke.

## Escopo Preliminar
Só artefactos de clarificação.

## Passos Propostos
1. Perguntas e respostas.
2. Refinar e aprovar.

## Critérios de Aceite Iniciais
- Ficheiros existem.

## Bloqueadores Conhecidos
- Nenhum.
`;

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function cleanupRunIndex(runId) {
  const p = resolveRunIndexPath(runId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

async function scenarioFullClarificationPipeline() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p2-"));
  let runId = null;
  try {
    const llmClient = {
      responses: {
        create: async () => ({ output_text: MOCK_LLM_INTAKE }),
      },
    };
    const intake = await executeIntake({
      projectArg: root,
      taskArg: LONG_INLINE,
      cwd: root,
      skipLlm: false,
      llmClient,
    });
    assert.strictEqual(intake.ok, true, "intake deve concluir com mock LLM");
    runId = intake.runId;
    const out = path.resolve(intake.outputDir);

    const rInit = await executeClarification({
      runOrPath: out,
      cwd: REPO_ROOT,
    });
    assert.strictEqual(rInit.ok, true, "clarify init");
    assert.ok(fs.existsSync(path.join(out, SESSION_FILE)), SESSION_FILE);

    const rQ = await executeClarification({
      runOrPath: out,
      cwd: REPO_ROOT,
      skipLlm: true,
    });
    assert.strictEqual(rQ.ok, true, "gerar perguntas skip-llm");
    assert.ok(fs.existsSync(path.join(out, QUESTIONS_FILE)), QUESTIONS_FILE);
    const qf = JSON.parse(fs.readFileSync(path.join(out, QUESTIONS_FILE), "utf-8"));
    assert.strictEqual(qf.source.mode, "skip-llm");
    assert.ok(Array.isArray(qf.questions));

    const emptyAnswersPath = path.join(out, "_smoke-empty-answers.json");
    fs.writeFileSync(emptyAnswersPath, JSON.stringify({ answers: [] }, null, 2), "utf-8");
    const rA = await executeClarification({
      runOrPath: out,
      cwd: REPO_ROOT,
      answersPath: emptyAnswersPath,
    });
    assert.strictEqual(rA.ok, true, "gravar respostas (vazio permitido sem blocking)");
    assert.ok(fs.existsSync(path.join(out, ANSWERS_FILE)), ANSWERS_FILE);

    const rRef = await executeClarification({
      runOrPath: out,
      cwd: REPO_ROOT,
      refine: true,
      skipLlm: true,
    });
    assert.strictEqual(rRef.ok, true, "refinar plano skip-llm");
    assert.ok(fs.existsSync(path.join(out, PLAN_REFINED_FILE)), PLAN_REFINED_FILE);

    const rAp = await executeClarification({
      runOrPath: out,
      cwd: REPO_ROOT,
      approve: true,
      approvalNotes: "smoke MVP Fase 2",
    });
    assert.strictEqual(rAp.ok, true, "aprovar");
    assert.strictEqual(rAp.phase2Status, PHASE2_READY_FOR_EXECUTION);

    const ctx = JSON.parse(fs.readFileSync(path.join(out, "run-context.json"), "utf-8"));
    assert.strictEqual(ctx.phase2.status, PHASE2_READY_FOR_EXECUTION);
    assert.strictEqual(ctx.phase3.status, "strategy_runtime_initialized");
    assert.strictEqual(ctx.phase3.complexity.status, "complexity_analysis_completed");
    assert.ok(fs.existsSync(path.join(out, "strategy", "complexity-analysis.json")));
    assert.strictEqual(ctx.phase3.ai_strategy.status, "ai_strategy_completed");
    assert.ok(fs.existsSync(path.join(out, "strategy", "ai-strategy.json")));
    assert.strictEqual(ctx.phase3.decomposition.status, "decomposition_completed");
    assert.ok(Number.isInteger(ctx.phase3.decomposition.subtask_count));
    assert.ok(fs.existsSync(path.join(out, "strategy", "decomposition.json")));
    assert.ok(fs.existsSync(path.join(out, "strategy", "execution-order.json")));
    assert.ok(fs.existsSync(path.join(out, "strategy", "subtasks", "001.json")));
    assert.strictEqual(ctx.phase3.execution_order.status, "execution_order_completed");
    assert.strictEqual(ctx.phase3.execution_order.ordering_mode, "linear");
    assert.strictEqual(ctx.phase3.shared_context.status, "shared_runtime_context_completed");
    assert.ok(fs.existsSync(path.join(out, "strategy", "shared-runtime-context.json")));
    assert.strictEqual(ctx.phase3.readiness.status, "strategy_ready");
    assert.ok(fs.existsSync(path.join(out, "strategy", "strategy-readiness.json")));

    assert.ok(fs.existsSync(path.join(out, APPROVAL_STATE_FILE)), APPROVAL_STATE_FILE);
    const adm = JSON.parse(fs.readFileSync(path.join(out, APPROVAL_STATE_FILE), "utf-8"));
    assert.strictEqual(adm.status, "approved");

    const v = validateClarificationArtifacts(out);
    assert.ok(v.ok, v.ok ? "" : (v.errors && v.errors.length ? v.errors.join("; ") : "validateClarificationArtifacts"));

    const mid = path.join(out, "_smoke-empty-answers.json");
    if (fs.existsSync(mid)) {
      fs.unlinkSync(mid);
    }
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function main() {
  await scenarioFullClarificationPipeline();
  console.log(
    "OK: mvp-phase2-clarification-smoke (intake mock LLM, clarify skip-llm, respostas vazias, refine, approve, validateClarificationArtifacts)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
