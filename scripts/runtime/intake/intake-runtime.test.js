"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { executeIntake, resolveTaskInput } = require("./intake-runtime");
const { resolveRunIndexPath } = require("../../../core/run-resolver");

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

test("intake falha sem docs/.IA", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-noia-"));
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: "tarefa livre de teste MVP fase 1.1",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "KNOWLEDGE_BASE_MISSING");
    assert.ok(!fs.existsSync(path.join(root, "docs", ".IA")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake falha com apenas docs/IA (não aceita pasta sem ponto)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-wrong-ia-"));
  fs.mkdirSync(path.join(root, "docs", "IA"), { recursive: true });
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: "tarefa livre de teste MVP fase 1.1",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "KNOWLEDGE_BASE_WRONG_PATH");
    const errText = String(res.error?.description || res.error?.message || "");
    assert.ok(errText.includes("docs/IA"), errText);
    assert.ok(errText.includes("docs/.IA"), errText);
    assert.ok(!fs.existsSync(path.join(root, "docs", ".IA")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake com docs/.IA gera artefactos correctos", async () => {
  const root = tmp("sb-intake-doc-");
  let runId = null;
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: "tarefa livre de teste MVP fase 1.1",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(fs.existsSync(path.join(root, "docs", ".IA")));
    assert.ok(fs.existsSync(path.join(root, "docs", ".IA", "outputs", runId, "metadata.json")));
    assert.ok(fs.existsSync(path.join(root, "docs", ".IA", "outputs", runId, "run-context.json")));
    assert.strictEqual(res.outputDir, path.join(root, "docs", ".IA", "outputs", runId));

    const meta = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "metadata.json"), "utf-8"),
    );
    assert.strictEqual(meta.run_type, "intake");
    assert.strictEqual(meta.project_root, path.resolve(root));
    assert.ok(meta.ia_dir.includes("docs"));
    assert.ok(meta.ia_dir.includes(".IA"));
    assert.ok(typeof meta.intake_task_preview === "string");

    assert.ok(fs.existsSync(path.join(root, "docs", ".IA", "outputs", runId, "intake-discovery-analysis.json")));
    assert.ok(!fs.existsSync(path.join(res.outputDir, "task-discovery.md")));
    assert.ok(!fs.existsSync(path.join(res.outputDir, "task-plan-initial.md")));
    assert.ok(!fs.existsSync(path.join(res.outputDir, "intake-llm-error.json")));

    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.version, "1.1.0");
    assert.strictEqual(ctx.run_type, "intake");
    assert.strictEqual(ctx.phase1.status, "classified");
    assert.strictEqual(ctx.phase1.llm.status, "skipped");
    assert.strictEqual(ctx.phase1.llm.agent, "task-intake.md");
    assert.deepStrictEqual(ctx.phase1.llm.artifacts, []);
    assert.ok(ctx.phase1.classification);
    assert.strictEqual(ctx.phase1.classification.status, "completed");
    assert.strictEqual(ctx.phase1.classification.value, "needs_context");
    assert.strictEqual(ctx.phase1.classification.artifact, "intake-classification.json");
    assert.ok(["low", "medium", "high"].includes(ctx.phase1.classification.confidence));
    assert.ok(ctx.phase1.ia_context);
    assert.ok(["ok", "partial"].includes(ctx.phase1.ia_context.status));
    assert.strictEqual(typeof ctx.phase1.ia_context.files_found, "number");
    assert.ok(Array.isArray(ctx.phase1.ia_context.files_missing));
    assert.strictEqual(typeof ctx.phase1.ia_context.markdown_markers_found, "number");
    assert.strictEqual(typeof ctx.phase1.ia_context.index_found, "boolean");
    assert.strictEqual(typeof ctx.phase1.ia_context.total_chars, "number");
    assert.strictEqual(ctx.phase1.ia_context.ia_dir, meta.ia_dir);
    assert.strictEqual(ctx.phase1.ia_context.ia_source, meta.ia_source);

    assert.ok(ctx.phase1.discovery);
    assert.strictEqual(ctx.phase1.discovery.status, "analysis_ready");
    assert.strictEqual(ctx.phase1.discovery.artifact, "intake-discovery-analysis.json");
    assert.ok(["low", "medium", "high", "unknown"].includes(ctx.phase1.discovery.complexity_hint));
    assert.ok(["low", "medium", "high", "unknown"].includes(ctx.phase1.discovery.risk_hint));
    assert.ok(["small", "medium", "large", "unknown"].includes(ctx.phase1.discovery.scope_hint));

    const disc = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-discovery-analysis.json"), "utf-8"),
    );
    assert.strictEqual(disc.schema_version, "1.0.0");
    assert.strictEqual(disc.task.source, "inline");
    assert.strictEqual(typeof disc.task.length, "number");
    assert.ok(disc.task.length > 0);
    assert.ok(Array.isArray(disc.ia_context.files_found));
    assert.ok(Array.isArray(disc.ia_context.files_missing));
    assert.ok(disc.discovery_signals);
    assert.ok(Array.isArray(disc.discovery_signals.needs_context_signals));
    assert.ok(Array.isArray(disc.discovery_signals.blocked_signals));

    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-classification.json")));
    const clsFile = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-classification.json"), "utf-8"),
    );
    assert.strictEqual(clsFile.schema_version, "1.0.0");
    assert.strictEqual(clsFile.classification, ctx.phase1.classification.value);

    assert.strictEqual(ctx.phase1.manifest, "intake-manifest.json");
    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-manifest.json")));
    const man = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-manifest.json"), "utf-8"),
    );
    assert.strictEqual(man.schema_version, "1.0.0");
    assert.strictEqual(man.run_id, runId);
    assert.ok(Array.isArray(man.artifacts));
    assert.ok(man.artifacts.every((a) => typeof a.name === "string" && typeof a.exists === "boolean"));

    const { validateIntakeArtifacts } = require("./intake-manifest");
    assert.strictEqual(validateIntakeArtifacts(res.outputDir).ok, true);

    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-context-summary.json")));
    const sum = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-context-summary.json"), "utf-8"),
    );
    assert.strictEqual(sum.files_found, ctx.phase1.ia_context.files_found);
    assert.ok(["ok", "partial"].includes(sum.status));
    assert.ok(Array.isArray(sum.warnings));

    const ctxDump = JSON.stringify(ctx);
    assert.ok(
      !ctxDump.includes("## PROJECT IA:"),
      "run-context não deve incluir o dump agregado de collectIAContext",
    );
    assert.strictEqual(ctx.project.root, path.resolve(root));

    const idx = JSON.parse(fs.readFileSync(resolveRunIndexPath(runId), "utf-8"));
    assert.strictEqual(idx.run_type, "intake");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake com só .IA legado falha (exige docs/.IA)", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-leg-"));
  fs.mkdirSync(path.join(root, ".IA"), { recursive: true });
  try {
    const res = await executeIntake({
      projectArg: root,
      taskArg: "outra tarefa legado",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "KNOWLEDGE_BASE_MISSING");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resolveTaskInput detecta ficheiro", () => {
  const root = tmp("sb-intake-file-");
  try {
    const fp = path.join(root, "task.md");
    fs.writeFileSync(fp, "# Título\n\nCorpo da task.", "utf-8");
    const r = resolveTaskInput("task.md", root, root);
    assert.strictEqual(r.kind, "file");
    assert.strictEqual(r.path, fp);
    assert.ok(r.preview.includes("Título"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("executeIntake falha sem projectArg", async () => {
  const r = await executeIntake({ projectArg: "", taskArg: "x", cwd: os.tmpdir() });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "INTAKE_PROJECT_MISSING");
});

test("run-context não inclui texto completo dos ficheiros IA", async () => {
  const root = tmp("sb-intake-leak-");
  const token = "INTAKE_RC_NO_LEAK_TOKEN_7c4e91a2";
  let runId = null;
  try {
    fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "docs", ".IA", "00-project-profile.md"),
      `# P\n\n${token}\n`,
      "utf-8",
    );
    const res = await executeIntake({
      projectArg: root,
      taskArg: "task mínima",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const ctxRaw = fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8");
    assert.ok(!ctxRaw.includes(token), "conteúdo IA não deve aparecer no run-context");
    const clsRaw = fs.readFileSync(
      path.join(res.outputDir, "intake-classification.json"),
      "utf-8",
    );
    assert.ok(!clsRaw.includes(token), "classificação não deve incluir dump IA completo");
    const manRaw = fs.readFileSync(
      path.join(res.outputDir, "intake-manifest.json"),
      "utf-8",
    );
    assert.ok(!manRaw.includes(token), "manifest não deve incluir conteúdo IA completo");
    const discRaw = fs.readFileSync(
      path.join(res.outputDir, "intake-discovery-analysis.json"),
      "utf-8",
    );
    assert.ok(!discRaw.includes(token), "artefacto discovery não deve incluir dump completo IA");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake com task ficheiro define discovery.task.source=file", async () => {
  const root = tmp("sb-intake-disc-file-");
  let runId = null;
  try {
    const fp = path.join(root, "my-task.md");
    fs.writeFileSync(fp, "# Refactor auth module\n\nDetalhes suficientes para não ser curta.", "utf-8");
    const res = await executeIntake({
      projectArg: root,
      taskArg: "my-task.md",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const disc = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-discovery-analysis.json"), "utf-8"),
    );
    assert.strictEqual(disc.task.source, "file");
    assert.ok(disc.task.length > 20);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake com IA parcial inclui needs_context_signals", async () => {
  const root = tmp("sb-intake-disc-partial-");
  let runId = null;
  try {
    fs.mkdirSync(path.join(root, "docs", ".IA"), { recursive: true });
    const { ensureIAMinimal } = require("../../ensure-ia");
    await ensureIAMinimal(root);
    fs.writeFileSync(path.join(root, "docs", ".IA", "03-coding-standards.md"), "  \n", "utf-8");
    const res = await executeIntake({
      projectArg: root,
      taskArg: "Implementar validação de formulário com regras claras e testes.",
      cwd: root,
      skipLlm: true,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    const disc = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-discovery-analysis.json"), "utf-8"),
    );
    assert.ok(
      disc.discovery_signals.needs_context_signals.includes("ia_missing_required_files"),
    );
    assert.strictEqual(disc.ia_context.status, "partial");

    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase1.status, "classified");
    assert.strictEqual(ctx.phase1.classification.value, "needs_context");
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const MOCK_LLM_VALID = `---TASK_DISCOVERY---
## Entendimento da Task
- Pedido de teste automatizado.

## Contexto IA Relevante
- Resumo injectado no prompt.

## Ambiguidades Identificadas
- Nenhuma crítica para o teste.

## Gaps de Contexto
- N/A no teste.

## Arquivos Prováveis de Impacto
- (hipótese) \`src/\` se existir.

## Riscos Iniciais
- Baixo (teste).

## Recomendação de Classificação
Provisório: seguir para clarificação apenas se necessário (não é decisão de sistema).
---TASK_PLAN_INITIAL---
## Objetivo
Validar geração de artefactos.

## Escopo Preliminar
Só intake markdown.

## Passos Propostos
1. Rever \`task-discovery.md\`.
2. Rever \`task-plan-initial.md\`.

## Critérios de Aceite Iniciais
- Ficheiros existem e têm secções.

## Bloqueadores Conhecidos
- Nenhum neste teste.
`;

test("intake com llmClient mock gera markdowns e intake_markdown_ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-llm-ok-"));
  const { ensureIAMinimal } = require("../../ensure-ia");
  const { initGitRepo } = require("../../test-helpers/ensure-docs-ia-dir");
  const { execFileSync } = require("child_process");
  await ensureIAMinimal(root);
  initGitRepo(root);
  execFileSync("git", ["add", "--", "docs/.IA"], { cwd: root, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "test: track docs/.IA"], {
    cwd: root,
    stdio: "pipe",
  });
  let runId = null;
  try {
    const llmClient = {
      responses: {
        create: async () => ({ output_text: MOCK_LLM_VALID }),
      },
    };
    const res = await executeIntake({
      projectArg: root,
      taskArg:
        "task para mock LLM com descrição suficientemente longa para não disparar task_description_short no discovery.",
      cwd: root,
      skipLlm: false,
      llmClient,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(fs.existsSync(path.join(res.outputDir, "task-discovery.md")));
    assert.ok(fs.existsSync(path.join(res.outputDir, "task-plan-initial.md")));
    assert.ok(!fs.existsSync(path.join(res.outputDir, "intake-llm-error.json")));

    const discMd = fs.readFileSync(
      path.join(res.outputDir, "task-discovery.md"),
      "utf-8",
    );
    assert.ok(discMd.includes("## Entendimento da Task"));
    assert.ok(!discMd.includes("---TASK_DISCOVERY---"));

    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase1.status, "classified");
    assert.strictEqual(ctx.phase1.classification.value, "ready_for_clarification");
    assert.strictEqual(ctx.phase1.manifest, "intake-manifest.json");
    assert.strictEqual(ctx.phase1.llm.status, "completed");
    assert.strictEqual(ctx.phase1.llm.agent, "task-intake.md");
    assert.deepStrictEqual(ctx.phase1.llm.artifacts, [
      "task-discovery.md",
      "task-plan-initial.md",
    ]);
    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-classification.json")));
    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-manifest.json")));
    const { validateIntakeArtifacts } = require("./intake-manifest");
    assert.strictEqual(validateIntakeArtifacts(res.outputDir).ok, true);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("intake com llmClient mock sem marcadores falha de forma controlada", async () => {
  const root = tmp("sb-intake-llm-bad-");
  let runId = null;
  try {
    const llmClient = {
      responses: {
        create: async () => ({ output_text: "Resposta sem marcadores." }),
      },
    };
    const res = await executeIntake({
      projectArg: root,
      taskArg:
        "task para mock inválido com descrição suficientemente longa para não disparar task_description_short no discovery.",
      cwd: root,
      llmClient,
    });
    assert.strictEqual(res.ok, true);
    runId = res.runId;
    assert.ok(!fs.existsSync(path.join(res.outputDir, "task-discovery.md")));
    assert.ok(!fs.existsSync(path.join(res.outputDir, "task-plan-initial.md")));
    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-llm-error.json")));
    const err = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "intake-llm-error.json"), "utf-8"),
    );
    assert.strictEqual(err.schema_version, "1.0.0");
    assert.ok(err.code);
    assert.ok(
      String(err.code).startsWith("INTAKE_LLM_PARSE_"),
      "bloqueio por contrato LLM inválido",
    );

    const ctx = JSON.parse(
      fs.readFileSync(path.join(res.outputDir, "run-context.json"), "utf-8"),
    );
    assert.strictEqual(ctx.phase1.status, "classified");
    assert.strictEqual(ctx.phase1.classification.value, "blocked");
    assert.strictEqual(ctx.phase1.llm.status, "failed");
    assert.deepStrictEqual(ctx.phase1.llm.artifacts, []);
    assert.strictEqual(ctx.phase1.manifest, "intake-manifest.json");
    assert.ok(fs.existsSync(path.join(res.outputDir, "intake-manifest.json")));
    const { validateIntakeArtifacts } = require("./intake-manifest");
    assert.strictEqual(validateIntakeArtifacts(res.outputDir).ok, true);
  } finally {
    if (runId) cleanupRunIndex(runId);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

