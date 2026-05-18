"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  buildIaValidation,
  compactDiagnosticEvent,
  formatIaDiagnosticCopy,
  isIaKnowledgeCode,
} = require("./ia-validation-diagnostics");
const { enrichPreRunError } = require("./pre-run-error");

test("isIaKnowledgeCode reconhece KNOWLEDGE_BASE_*", () => {
  assert.strictEqual(isIaKnowledgeCode("KNOWLEDGE_BASE_UNTRACKED"), true);
  assert.strictEqual(isIaKnowledgeCode("task_too_short"), false);
});

test("iaValidation: erro versão inclui check version e specVersion detectada", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
    message: "versão não suportada",
    specVersion: "2.0",
    detectedSpecVersion: "2.0",
    supportedVersions: ["1.0"],
    indexPath: "docs/.IA/index.md",
  });
  const ia = buildIaValidation(e);
  assert.ok(ia);
  assert.strictEqual(ia.specVersion, "2.0");
  assert.deepStrictEqual(ia.supportedVersions, ["1.0"]);
  assert.strictEqual(ia.checks.find((c) => c.id === "version")?.status, "fail");
  assert.strictEqual(ia.checks.find((c) => c.id === "git")?.status, "ok");
});

test("iaValidation: erro Git untracked", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_UNTRACKED",
    message: "não versionada",
    docsIaPath: "docs/.IA",
  });
  const ia = buildIaValidation(e);
  assert.ok(ia);
  assert.strictEqual(ia.valid, false);
  assert.strictEqual(ia.specVersion, null);
  const gitCheck = ia.checks.find((c) => c.id === "git");
  assert.strictEqual(gitCheck.status, "fail");
  const seedCheck = ia.checks.find((c) => c.id === "seed");
  assert.strictEqual(seedCheck.status, "skip");
  assert.strictEqual(/** @type {{ ok: boolean }} */ (ia.git).ok, false);
});

test("iaValidation: erro seed", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_INVALID_SEED",
    message: "seed incompleto",
    missingFiles: ["docs/.IA/system/seed-rules.md"],
    requiredFiles: ["docs/.IA/index.md"],
  });
  const ia = buildIaValidation(e);
  assert.ok(ia);
  assert.strictEqual(ia.checks.find((c) => c.id === "git").status, "ok");
  assert.strictEqual(ia.checks.find((c) => c.id === "seed").status, "fail");
  assert.ok(
    /** @type {{ missingFiles?: string[] }} */ (ia.seed).missingFiles?.includes(
      "docs/.IA/system/seed-rules.md",
    ),
  );
});

test("iaValidation: erro structure", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_INVALID_STRUCTURE",
    message: "estrutura incompleta",
    missingDirectories: ["docs/.IA/architecture"],
    missingIndexFiles: ["docs/.IA/prompts/index-prompts.md"],
  });
  const ia = buildIaValidation(e);
  assert.strictEqual(ia.checks.find((c) => c.id === "structure").status, "fail");
  assert.ok(
    /** @type {{ missingDirectories?: string[] }} */ (ia.structure).missingDirectories
      ?.length,
  );
});

test("iaValidation: erro drift", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
    message: "drift",
    criticalDrift: ["legado"],
    duplicatedBootstrapPrompts: ["docs/.IA/prompts/bootstrap-create.md"],
    legacyIaPath: ".IA",
  });
  const ia = buildIaValidation(e);
  assert.strictEqual(ia.checks.find((c) => c.id === "drift").status, "fail");
  assert.strictEqual(/** @type {{ legacyIaPath?: string }} */ (ia.drift).legacyIaPath, ".IA");
});

test("compactDiagnosticEvent inclui iaValidation e summary", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_UNTRACKED",
    message: "untracked",
  });
  const compact = compactDiagnosticEvent(e);
  assert.ok(compact.iaValidation);
  assert.ok(String(compact.summary).includes("git"));
  assert.strictEqual(compact.code, "KNOWLEDGE_BASE_UNTRACKED");
});

test("formatIaDiagnosticCopy inclui bloco iaValidation", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_INVALID_SEED",
    message: "seed",
    missingFiles: ["docs/.IA/index.md"],
  });
  const text = formatIaDiagnosticCopy(e);
  assert.ok(text.includes("iaValidation:"));
  assert.ok(text.includes('"supportedVersions"'));
  assert.ok(text.includes("missingFiles"));
});

test("iaValidation: erro policy (sensitive data)", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_SENSITIVE_DATA",
    message: "A `.IA` contém possível dado sensível.",
    matchedFiles: ["docs/.IA/environment/access.md"],
    ruleIds: ["password_assignment"],
    redactedSamples: ["docs/.IA/environment/access.md: pass****ue [password_assignment]"],
  });
  const ia = buildIaValidation(e);
  assert.ok(ia);
  assert.strictEqual(ia.checks.find((c) => c.id === "policy")?.status, "fail");
  assert.strictEqual(/** @type {{ ok: boolean }} */ (ia.policy).ok, false);
  assert.ok(
    /** @type {{ matchedFiles?: string[] }} */ (ia.policy).matchedFiles?.includes(
      "docs/.IA/environment/access.md",
    ),
  );
});

test("iaValidation: aviso language em policy (warn)", () => {
  const ia = buildIaValidation({
    code: "KNOWLEDGE_BASE_LANGUAGE_WARNING",
    message: "A `.IA` parece conter documentação fora do padrão de idioma esperado.",
    policyWarnings: [
      {
        code: "KNOWLEDGE_BASE_LANGUAGE_WARNING",
        message: "A `.IA` parece conter documentação fora do padrão de idioma esperado.",
      },
    ],
    languageScan: {
      ok: false,
      suspectedFiles: ["docs/.IA/architecture/overview.md"],
      confidence: 0.42,
      sampleReason: "stopwords PT/ES: 8/50 (16%)",
    },
  });
  assert.ok(ia);
  assert.strictEqual(ia.checks.find((c) => c.id === "policy")?.status, "warn");
  assert.ok(ia.warnings.length > 0);
});

test("formatIaDiagnosticCopy inclui policy", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_SENSITIVE_DATA",
    message: "sensível",
    matchedFiles: ["docs/.IA/x.md"],
    ruleIds: ["api_key_assignment"],
  });
  const text = formatIaDiagnosticCopy(e);
  assert.ok(text.includes("iaValidation:"));
  assert.ok(text.includes('"policy"'));
});

test("enrichPreRunError anexa iaValidation em KNOWLEDGE_*", () => {
  const e = enrichPreRunError({
    code: "KNOWLEDGE_BASE_IGNORED",
    message: "ignored",
  });
  assert.ok(e.iaValidation);
  assert.ok(Array.isArray(e.iaValidation.supportedVersions));
});
