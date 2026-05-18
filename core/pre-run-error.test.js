"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { enrichPreRunError, suggestedActionsForCode } = require("./pre-run-error");

test("enrichPreRunError: KNOWLEDGE_BASE_UNTRACKED com suggestedActions", () => {
  const e = enrichPreRunError(
    {
      code: "KNOWLEDGE_BASE_UNTRACKED",
      message: "Base de conhecimento não versionada",
      title: "Base de conhecimento não versionada",
    },
    { projectId: "proj_x", traceId: "req_1" },
  );
  assert.strictEqual(e.code, "KNOWLEDGE_BASE_UNTRACKED");
  assert.strictEqual(e.phase, "validate_docs_ia");
  assert.ok(Array.isArray(e.suggestedActions));
  assert.ok(e.suggestedActions.length >= 2);
  assert.strictEqual(e.traceId, "req_1");
  assert.strictEqual(e.projectId, "proj_x");
});

test("suggestedActionsForCode: project_not_found", () => {
  const actions = suggestedActionsForCode("project_not_found");
  assert.ok(actions.some((a) => /register/i.test(a) || /Registe/i.test(a)));
});

test("enrichPreRunError: payload estruturado completo para API", () => {
  const e = enrichPreRunError(
    {
      code: "KNOWLEDGE_BASE_MISSING",
      message: "Base de conhecimento obrigatória não encontrada.",
      title: "Base de conhecimento não encontrada",
      description: "docs/.IA em falta.",
    },
    {
      projectId: "p1",
      projectRoot: "/tmp/proj",
      traceId: "req-99",
      timestamp: "2026-05-16T12:00:00.000Z",
    },
  );
  assert.strictEqual(e.code, "KNOWLEDGE_BASE_MISSING");
  assert.strictEqual(e.phase, "validate_docs_ia");
  assert.strictEqual(e.projectId, "p1");
  assert.strictEqual(e.projectRoot, "/tmp/proj");
  assert.strictEqual(e.traceId, "req-99");
  assert.ok(Array.isArray(e.suggestedActions));
  assert.ok(e.suggestedActions.length > 0);
  const api = { ok: false, error: e };
  assert.strictEqual(api.ok, false);
  assert.strictEqual(api.error.code, "KNOWLEDGE_BASE_MISSING");
});

test("enrichPreRunError: KNOWLEDGE_BASE_INVALID_SEED com missingFiles", () => {
  const e = enrichPreRunError(
    {
      code: "KNOWLEDGE_BASE_INVALID_SEED",
      message: "A estrutura mínima obrigatória da `.IA` está incompleta.",
      title: "Estrutura mínima da `.IA` incompleta",
      missingFiles: ["docs/.IA/system/seed-rules.md"],
      requiredFiles: ["docs/.IA/index.md", "docs/.IA/system/seed-rules.md"],
      existingFiles: ["docs/.IA/index.md"],
    },
    { projectId: "p2", traceId: "req-seed" },
  );
  assert.strictEqual(e.code, "KNOWLEDGE_BASE_INVALID_SEED");
  assert.strictEqual(e.phase, "validate_knowledge_seed");
  assert.deepStrictEqual(e.missingFiles, ["docs/.IA/system/seed-rules.md"]);
  assert.ok(e.suggestedActions.some((a) => /seed-rules/i.test(a)));
});

test("enrichPreRunError: KNOWLEDGE_BASE_INVALID_STRUCTURE", () => {
  const e = enrichPreRunError(
    {
      code: "KNOWLEDGE_BASE_INVALID_STRUCTURE",
      message: "A estrutura governada da `.IA` está incompleta.",
      missingDirectories: ["docs/.IA/architecture"],
      missingIndexFiles: ["docs/.IA/prompts/index-prompts.md"],
    },
    { traceId: "req-gov" },
  );
  assert.strictEqual(e.phase, "validate_knowledge_structure");
  assert.deepStrictEqual(e.missingDirectories, ["docs/.IA/architecture"]);
});

test("enrichPreRunError: KNOWLEDGE_BASE_STRUCTURAL_DRIFT", () => {
  const e = enrichPreRunError(
    {
      code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
      message:
        "A estrutura da `.IA` possui arquivos ou caminhos que violam a SPEC v1.0.",
      criticalDrift: ["drift crítico"],
      duplicatedBootstrapPrompts: ["docs/.IA/prompts/bootstrap-create.md"],
      legacyIaPath: ".IA",
      details: {
        driftValidation: {
          driftValid: false,
          warnings: ["aviso"],
          unknownFolders: ["docs/.IA/sandbox"],
        },
      },
    },
    { traceId: "req-drift" },
  );
  assert.strictEqual(e.phase, "validate_knowledge_drift");
  assert.deepStrictEqual(e.criticalDrift, ["drift crítico"]);
  assert.deepStrictEqual(e.duplicatedBootstrapPrompts, [
    "docs/.IA/prompts/bootstrap-create.md",
  ]);
  assert.strictEqual(e.legacyIaPath, ".IA");
  assert.deepStrictEqual(e.warnings, ["aviso"]);
});
