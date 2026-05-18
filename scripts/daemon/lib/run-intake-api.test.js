"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createRunFromTask, MIN_TASK_CHARS } = require("./run-intake-api");
const { deriveProjectId } = require("./project-registry");
const { ensureDocsIaDir } = require("../../test-helpers/ensure-docs-ia-dir");
const { resolveOutputDir } = require("../../../core/run-resolver");

function withIsolatedDataDir(fn) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-reg-"));
  const dataDir = path.join(repo, "sb-data");
  fs.mkdirSync(path.join(dataDir, "daemon"), { recursive: true });
  const prevRoot = process.env.SETUP_BOSS_CLI_ROOT;
  const prevData = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_CLI_ROOT = repo;
  process.env.SETUP_BOSS_DATA_DIR = dataDir;
  try {
    fn({ repo, dataDir });
  } finally {
    if (prevRoot === undefined) delete process.env.SETUP_BOSS_CLI_ROOT;
    else process.env.SETUP_BOSS_CLI_ROOT = prevRoot;
    if (prevData === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prevData;
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("createRunFromTask rejeita task curta", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-"));
  const r = await createRunFromTask({
    repoRoot: root,
    projectId: "proj_missing",
    task: "curta",
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "task_too_short");
  assert.ok(MIN_TASK_CHARS >= 10);
});

test("createRunFromTask aceita projectId derivado com registry legado", async () => {
  await new Promise((resolve, reject) => {
    withIsolatedDataDir(async ({ repo, dataDir }) => {
      try {
        const projectRoot = path.join(repo, "demo-project");
        fs.mkdirSync(projectRoot, { recursive: true });
        ensureDocsIaDir(projectRoot);
        const derivedId = deriveProjectId(projectRoot);
        fs.writeFileSync(
          path.join(dataDir, "projects.json"),
          JSON.stringify({
            schemaVersion: 1,
            projects: [
              {
                projectId: "proj_legacy_stale",
                projectRoot: projectRoot,
                displayName: "demo-project",
                firstSeenAt: "2020-01-01T00:00:00.000Z",
                lastSeenAt: "2025-01-01T00:00:00.000Z",
                lastJobId: null,
                jobCounts: {},
                metadata: {},
              },
            ],
          }),
          "utf-8",
        );
        fs.mkdirSync(path.join(repo, ".setup-boss", "daemon"), { recursive: true });
        fs.writeFileSync(
          path.join(dataDir, "daemon", "queue.json"),
          JSON.stringify({ jobs: [] }),
          "utf-8",
        );

        const r = await createRunFromTask({
          repoRoot: repo,
          projectId: derivedId,
          task: "Implementar POST /runs com projectId derivado do path para validar reconciliação do registry.",
          metadata: { skipLlm: true, source: "test" },
        });

        assert.notStrictEqual(
          r.error?.code,
          "project_not_found",
          r.error?.message || "deve resolver projectId derivado",
        );
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
});

test("createRunFromTask: docs/.IA untracked retorna erro estruturado", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-untracked-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(path.join(projectRoot, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", ".IA", "index.md"), "# x\n", "utf-8");
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });
  const { execFileSync } = require("child_process");
  execFileSync("git", ["init"], { cwd: projectRoot, stdio: "pipe" });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar validação obrigatória da base de conhecimento docs/.IA antes do intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "KNOWLEDGE_BASE_UNTRACKED");
  assert.strictEqual(r.error.phase, "validate_docs_ia");
  assert.ok(
    String(r.error.message).includes("ainda não está versionada no Git"),
  );
  assert.ok(Array.isArray(r.error.suggestedActions));
  assert.ok(r.error.projectRoot);
  assert.ok(r.error.timestamp);
  fs.rmSync(root, { recursive: true, force: true });
});

test("createRunFromTask: estrutura governada incompleta retorna INVALID_STRUCTURE", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-gov-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  const { ensureRequiredKnowledgeSeed } = require("../../test-helpers/ensure-docs-ia-dir");
  const { execFileSync } = require("child_process");
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });
  execFileSync("git", ["init"], { cwd: projectRoot, stdio: "pipe" });
  ensureRequiredKnowledgeSeed(projectRoot);

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Validar estrutura governada docs/.IA SPEC v1.0 antes de iniciar intake no Mission Control.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "KNOWLEDGE_BASE_INVALID_STRUCTURE");
  assert.strictEqual(r.error.phase, "validate_knowledge_structure");
  assert.ok(Array.isArray(r.error.missingIndexFiles));
  fs.rmSync(root, { recursive: true, force: true });
});

test("createRunFromTask: seed incompleto retorna INVALID_SEED estruturado", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-seed-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(path.join(projectRoot, "docs", ".IA"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "docs", ".IA", "index.md"), "# x\n", "utf-8");
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });
  const { execFileSync } = require("child_process");
  execFileSync("git", ["init"], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("git", ["add", "docs/.IA/index.md"], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: projectRoot, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "seed partial"], { cwd: projectRoot, stdio: "pipe" });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar validação obrigatória do seed mínimo docs/.IA v1.0 antes do intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "KNOWLEDGE_BASE_INVALID_SEED");
  assert.strictEqual(r.error.phase, "validate_knowledge_seed");
  assert.ok(Array.isArray(r.error.missingFiles));
  assert.ok(r.error.missingFiles.length >= 3);
  fs.rmSync(root, { recursive: true, force: true });
});

test("createRunFromTask rejeita projecto sem docs/.IA", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-noia-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar validação obrigatória da base de conhecimento docs/.IA antes do intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "KNOWLEDGE_BASE_MISSING");
  assert.ok(r.error.description?.includes("docs/.IA"));
});

test("createRunFromTask rejeita projecto com apenas docs/IA", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-wrong-ia-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(path.join(projectRoot, "docs", "IA"), { recursive: true });
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar validação obrigatória da base de conhecimento docs/.IA antes do intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "KNOWLEDGE_BASE_WRONG_PATH");
  assert.ok(r.error.description?.includes("docs/IA"));
  assert.ok(r.error.description?.includes("docs/.IA"));
});

test("createRunFromTask rejeita projectRoot igual ao Setup-Boss", async () => {
  const { ROOT_DIR } = require("../../../core/run-resolver");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-sbroot-"));
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: ROOT_DIR,
    task: "Implementar validação obrigatória da base de conhecimento docs/.IA antes do intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error.code, "PROJECT_ROOT_UNRESOLVED");
});

test("createRunFromTask cria run real com intake+clarify", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-intake-api-ok-"));
  const projectRoot = path.join(root, "demo-project");
  fs.mkdirSync(projectRoot, { recursive: true });
  ensureDocsIaDir(projectRoot);
  fs.mkdirSync(path.join(root, ".setup-boss", "daemon"), { recursive: true });

  const r = await createRunFromTask({
    repoRoot: root,
    projectId: projectRoot,
    task: "Implementar endpoint POST /runs para criar atividades reais no Mission Control com intake.",
    metadata: { skipLlm: true, source: "test" },
  });

  assert.strictEqual(r.ok, true, r.error?.message);
  assert.ok(r.data.runId);
  assert.ok(r.data.jobId);
  assert.ok(r.data.createdAt);
  assert.strictEqual(r.data.phase2Status, "questions_generated");
  assert.strictEqual(r.data.uiState, "waiting_clarification_answers");
  const od = resolveOutputDir(r.data.runId, { warnLegacy: false });
  assert.ok(fs.existsSync(path.join(od, "clarification-questions.json")));
  assert.ok(
    r.data.initialState === "intake_running" ||
      r.data.initialState === "clarification_required" ||
      r.data.initialState === "clarification_ready",
  );
});
