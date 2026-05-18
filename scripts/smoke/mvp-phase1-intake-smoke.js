#!/usr/bin/env node
/**
 * Smoke operacional — MVP Fase 1 (task intake & discovery runtime).
 * Cenários: projeto sem docs/.IA, legado .IA, task inline/file + --skip-llm,
 * mock LLM (sem rede), validateIntakeArtifacts, run-index com run_type intake.
 *
 * Uso: node scripts/smoke/mvp-phase1-intake-smoke.js
 *      npm run smoke:mvp-phase1-intake
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { executeIntake } = require("../runtime/intake/intake-runtime");
const { validateIntakeArtifacts } = require("../runtime/intake/intake-manifest");
const { resolveRunIndexPath } = require("../../core/run-resolver");

const LONG_INLINE =
  "Descrição longa o suficiente para evitar task_description_short no discovery durante o smoke MVP Fase 1 intake.";

/** Resposta mínima válida para o parser (sem rede). */
const MOCK_LLM_VALID = `---TASK_DISCOVERY---
## Entendimento da Task
- Pedido de smoke automatizado.

## Contexto IA Relevante
- Resumo injectado no prompt.

## Ambiguidades Identificadas
- Nenhuma crítica para o smoke.

## Gaps de Contexto
- N/A no smoke.

## Arquivos Prováveis de Impacto
- (hipótese) \`src/\` se existir.

## Riscos Iniciais
- Baixo (smoke).

## Recomendação de Classificação
Provisório: seguir para clarificação apenas se necessário (não é decisão de sistema).
---TASK_PLAN_INITIAL---
## Objetivo
Validar geração de artefactos no smoke.

## Escopo Preliminar
Só intake markdown.

## Passos Propostos
1. Rever \`task-discovery.md\`.
2. Rever \`task-plan-initial.md\`.

## Critérios de Aceite Iniciais
- Ficheiros existem e têm secções.

## Bloqueadores Conhecidos
- Nenhum neste smoke.
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

/**
 * @param {string} outputDir
 * @param {{ requireMarkdown: boolean }} opts
 */
function assertCoreIntakeArtifacts(outputDir, opts) {
  const out = path.resolve(outputDir);
  const required = [
    "metadata.json",
    "run-context.json",
    "intake-context-summary.json",
    "intake-discovery-analysis.json",
    "intake-classification.json",
    "intake-manifest.json",
  ];
  for (const name of required) {
    assert.ok(fs.existsSync(path.join(out, name)), `artefacto em falta: ${name}`);
  }

  const meta = JSON.parse(fs.readFileSync(path.join(out, "metadata.json"), "utf-8"));
  assert.strictEqual(meta.run_type, "intake");

  const disc = JSON.parse(
    fs.readFileSync(path.join(out, "intake-discovery-analysis.json"), "utf-8"),
  );
  assert.strictEqual(disc.schema_version, "1.0.0");

  const v = validateIntakeArtifacts(out);
  assert.ok(v.ok, v.errors && v.errors.length ? v.errors.join("; ") : "validateIntakeArtifacts");

  if (opts.requireMarkdown) {
    assert.ok(fs.existsSync(path.join(out, "task-discovery.md")), "task-discovery.md");
    assert.ok(fs.existsSync(path.join(out, "task-plan-initial.md")), "task-plan-initial.md");
  }
}

function assertRunIndexIntake(runId) {
  const idx = resolveRunIndexPath(runId);
  assert.ok(fs.existsSync(idx), "run-index global em falta");
  const row = JSON.parse(fs.readFileSync(idx, "utf-8"));
  assert.strictEqual(row.run_type, "intake");
  assert.ok(row.project_root);
  assert.ok(row.output_dir);
}

async function scenarioNewProjectNoDocsIa() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p1-new-"));
  let runId = null;
  try {
    assert.ok(!fs.existsSync(path.join(root, "docs", ".IA")), "pré-condição: sem docs/.IA");
    const res = await executeIntake({
      projectArg: root,
      taskArg: LONG_INLINE,
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(fs.existsSync(path.join(root, "docs", ".IA")), "deve criar docs/.IA");
    assert.ok(
      res.outputDir.replace(/\\/g, "/").includes("docs/.IA/outputs"),
      "output sob docs/.IA/outputs",
    );
    assertCoreIntakeArtifacts(res.outputDir, { requireMarkdown: false });
    assertRunIndexIntake(runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function scenarioLegacyRootIa() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p1-leg-"));
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  let runId = null;
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: LONG_INLINE,
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(
      res.outputDir.replace(/\\/g, "/").includes(".IA/outputs"),
      "legado: output sob .IA/outputs",
    );
    assert.ok(!res.outputDir.replace(/\\/g, "/").includes("docs/.IA"), "não forçar docs/.IA");
    assertCoreIntakeArtifacts(res.outputDir, { requireMarkdown: false });
    assertRunIndexIntake(runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function scenarioInlineSkipLlm() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p1-inline-"));
  let runId = null;
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: LONG_INLINE,
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const disc = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-discovery-analysis.json"), "utf-8"),
    );
    assert.strictEqual(disc.task.source, "inline");
    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase1.llm.status, "skipped");
    assertCoreIntakeArtifacts(res.outputDir, { requireMarkdown: false });
    assertRunIndexIntake(runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function scenarioTaskFileSkipLlm() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p1-file-"));
  let runId = null;
  try {
    const fp = path.join(root, "smoke-task.md");
    fs.writeFileSync(
      fp,
      "# Smoke task file\n\nConteúdo suficientemente longo para não ser considerado curto no discovery.",
      "utf-8",
    );
    const res = await executeIntake({
      projectArg: root,
      taskArg: "smoke-task.md",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const disc = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-discovery-analysis.json"), "utf-8"),
    );
    assert.strictEqual(disc.task.source, "file");
    assertCoreIntakeArtifacts(res.outputDir, { requireMarkdown: false });
    assertRunIndexIntake(runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function scenarioMockLlmCompleted() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-smoke-p1-mock-"));
  let runId = null;
  try {
    const llmClient = {
      responses: {
        create: async () => ({ output_text: MOCK_LLM_VALID }),
      },
    };
    const res = await executeIntake({
      projectArg: root,
      taskArg: LONG_INLINE,
      cwd: root,
      skipLlm: false,
      llmClient,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase1.llm.status, "completed");
    assert.deepStrictEqual(ctx.phase1.llm.artifacts, [
      "task-discovery.md",
      "task-plan-initial.md",
    ]);
    assertCoreIntakeArtifacts(res.outputDir, { requireMarkdown: true });
    assertRunIndexIntake(runId);
  } finally {
    if (runId) cleanupRunIndex(runId);
    rmrf(root);
  }
}

async function main() {
  await scenarioNewProjectNoDocsIa();
  await scenarioLegacyRootIa();
  await scenarioInlineSkipLlm();
  await scenarioTaskFileSkipLlm();
  await scenarioMockLlmCompleted();
  console.log(
    "OK: mvp-phase1-intake-smoke (greenfield, legado .IA, inline/file skip-llm, mock LLM, validateIntakeArtifacts, run-index intake)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
