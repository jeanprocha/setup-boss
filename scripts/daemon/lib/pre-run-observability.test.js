"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildStructuredPreRunError,
  readPreRunDiagnosticEvents,
  isPreRunTraceRow,
  traceKnowledgeBootstrapFailed,
} = require("./pre-run-observability");
const { appendRuntimeTrace, fallbackTraceFileAbs } = require("../../runtime-observability/runtime-trace");

test("buildStructuredPreRunError inclui traceId e timestamp", () => {
  const e = buildStructuredPreRunError(
    { code: "task_too_short", message: "curta" },
    { traceId: "abc", timestamp: "2026-01-01T00:00:00.000Z" },
  );
  assert.strictEqual(e.traceId, "abc");
  assert.strictEqual(e.timestamp, "2026-01-01T00:00:00.000Z");
  assert.strictEqual(e.phase, "submit");
});

test("isPreRunTraceRow reconhece pre_run_failed e knowledge_bootstrap_failed", () => {
  assert.strictEqual(isPreRunTraceRow({ event: "pre_run_failed" }), true);
  assert.strictEqual(
    isPreRunTraceRow({ event: "knowledge_bootstrap_failed", metadata: { code: "KNOWLEDGE_BASE_UNTRACKED" } }),
    true,
  );
  assert.strictEqual(isPreRunTraceRow({ event: "run_created_checkpoint" }), false);
});

test("traceKnowledgeBootstrapFailed grava suggestedActions no trace", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-kb-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    const structured = traceKnowledgeBootstrapFailed({
      projectId: "proj_kb",
      projectRoot: "/tmp/demo",
      raw: {
        code: "KNOWLEDGE_BASE_UNTRACKED",
        message: "A base de conhecimento existe localmente, mas ainda não está versionada no Git.",
        title: "Base de conhecimento não versionada",
      },
    });
    assert.strictEqual(structured.code, "KNOWLEDGE_BASE_UNTRACKED");
    assert.ok(Array.isArray(structured.suggestedActions));
    const events = readPreRunDiagnosticEvents({ channel: "pre_run", limit: 3 });
    assert.ok(events.some((e) => e.code === "KNOWLEDGE_BASE_UNTRACKED"));
    const hit = events.find((e) => e.code === "KNOWLEDGE_BASE_UNTRACKED");
    assert.ok(hit?.suggestedActions?.length);
    assert.ok(hit?.iaValidation);
    assert.ok(hit.iaValidation.checks.find((c) => c.id === "version"));
    assert.strictEqual(hit.iaValidation.checks.find((c) => c.id === "git").status, "fail");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("traceKnowledgeBootstrapFailed: INVALID_SEED usa evento knowledge_seed_validation_failed", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-seed-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    traceKnowledgeBootstrapFailed({
      projectId: "proj_seed",
      projectRoot: "/tmp/demo",
      raw: {
        code: "KNOWLEDGE_BASE_INVALID_SEED",
        message: "A estrutura mínima obrigatória da `.IA` está incompleta.",
        missingFiles: ["docs/.IA/system/bootstrap-create.md"],
      },
    });
    const events = readPreRunDiagnosticEvents({ channel: "pre_run", limit: 5 });
    const hit = events.find((e) => e.code === "KNOWLEDGE_BASE_INVALID_SEED");
    assert.ok(hit);
    assert.strictEqual(hit.phase, "validate_knowledge_seed");
    assert.ok(
      hit.iaValidation?.seed?.missingFiles?.includes(
        "docs/.IA/system/bootstrap-create.md",
      ) ||
        hit.missingFiles?.includes("docs/.IA/system/bootstrap-create.md"),
    );
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("traceKnowledgeBootstrapFailed: STRUCTURAL_DRIFT usa knowledge_structural_drift_failed", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-drift-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    traceKnowledgeBootstrapFailed({
      projectId: "proj_drift",
      projectRoot: "/tmp/demo",
      raw: {
        code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
        message:
          "A estrutura da `.IA` possui arquivos ou caminhos que violam a SPEC v1.0.",
        criticalDrift: ["drift crítico"],
        duplicatedBootstrapPrompts: ["docs/.IA/prompts/bootstrap-create.md"],
        legacyIaPath: ".IA",
      },
    });
    const events = readPreRunDiagnosticEvents({ channel: "pre_run", limit: 5 });
    const hit = events.find((e) => e.code === "KNOWLEDGE_BASE_STRUCTURAL_DRIFT");
    assert.ok(hit);
    assert.strictEqual(hit.phase, "validate_knowledge_drift");
    assert.ok(
      hit.iaValidation?.drift?.criticalDrift?.includes("drift crítico") ||
        hit.criticalDrift?.includes("drift crítico"),
    );
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("traceKnowledgeBootstrapFailed: UNSUPPORTED_VERSION com iaValidation.specVersion", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-ver-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    traceKnowledgeBootstrapFailed({
      projectId: "proj_ver",
      projectRoot: "/tmp/demo",
      raw: {
        code: "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
        message: "versão não suportada",
        specVersion: "2.0",
        supportedVersions: ["1.0"],
      },
    });
    const events = readPreRunDiagnosticEvents({ channel: "pre_run", limit: 5 });
    const hit = events.find((e) => e.code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION");
    assert.ok(hit);
    assert.strictEqual(hit.phase, "validate_knowledge_spec_version");
    assert.strictEqual(hit.iaValidation?.specVersion, "2.0");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("readPreRunDiagnosticEvents filtra por code", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-filter-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    traceKnowledgeBootstrapFailed({
      projectId: "p1",
      projectRoot: "/tmp/a",
      raw: { code: "KNOWLEDGE_BASE_UNTRACKED", message: "u" },
    });
    traceKnowledgeBootstrapFailed({
      projectId: "p1",
      projectRoot: "/tmp/a",
      raw: {
        code: "KNOWLEDGE_BASE_INVALID_SEED",
        message: "s",
        missingFiles: ["docs/.IA/index.md"],
      },
    });
    const seedOnly = readPreRunDiagnosticEvents({
      channel: "pre_run",
      code: "KNOWLEDGE_BASE_INVALID_SEED",
      limit: 10,
    });
    assert.ok(seedOnly.length >= 1);
    assert.ok(seedOnly.every((e) => e.code === "KNOWLEDGE_BASE_INVALID_SEED"));
    assert.ok(seedOnly[0].iaValidation);
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("readPreRunDiagnosticEvents lê eventos do trace global", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pre-run-diag-"));
  const prev = process.env.SETUP_BOSS_DATA_DIR;
  process.env.SETUP_BOSS_DATA_DIR = tmp;
  try {
    appendRuntimeTrace({
      component: "runtime_api",
      event: "pre_run_failed",
      level: "error",
      projectId: "proj_diag",
      message: "KB untracked",
      metadata: {
        channel: "pre_run",
        code: "KNOWLEDGE_BASE_UNTRACKED",
        suggestedActions: ["git add docs/.IA"],
      },
      error: {
        code: "KNOWLEDGE_BASE_UNTRACKED",
        title: "Base de conhecimento não versionada",
        message: "sem tracked",
        phase: "validate_docs_ia",
        timestamp: new Date().toISOString(),
      },
    });
    const events = readPreRunDiagnosticEvents({ channel: "pre_run", limit: 5 });
    assert.ok(events.length >= 1);
    assert.strictEqual(events[0].code, "KNOWLEDGE_BASE_UNTRACKED");
    assert.ok(fs.existsSync(fallbackTraceFileAbs()));
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_DATA_DIR;
    else process.env.SETUP_BOSS_DATA_DIR = prev;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
