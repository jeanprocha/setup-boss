import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPreRunDiagnosticCopy,
  intakeInlineBody,
  intakeInlineTitle,
  parseStructuredPreRunError,
} from "./pre-run-error.ts";

test("parseStructuredPreRunError: erro API aninhado", () => {
  const parsed = parseStructuredPreRunError({
    code: "KNOWLEDGE_BASE_UNTRACKED",
    phase: "validate_docs_ia",
    title: "Base de conhecimento não versionada",
    message:
      "A base de conhecimento existe localmente, mas ainda não está versionada no Git.",
    suggestedActions: ["git add docs/.IA"],
  });
  assert.ok(parsed);
  assert.strictEqual(parsed!.code, "KNOWLEDGE_BASE_UNTRACKED");
  assert.strictEqual(parsed!.suggestedActions?.length, 1);
});

test("intakeInlineTitle/Body: INVALID_SEED com missingFiles", () => {
  const err = {
    code: "KNOWLEDGE_BASE_INVALID_SEED",
    message: "A estrutura mínima obrigatória da `.IA` está incompleta.",
    missingFiles: ["docs/.IA/system/seed-rules.md"],
  };
  assert.strictEqual(
    intakeInlineTitle(err),
    "Estrutura mínima da `.IA` incompleta",
  );
  assert.ok(intakeInlineBody(err).includes("seed `.IA` v1.0"));
});

test("intakeInlineTitle/Body: INVALID_STRUCTURE", () => {
  const err = {
    code: "KNOWLEDGE_BASE_INVALID_STRUCTURE",
    message: "A estrutura governada da `.IA` está incompleta.",
    missingDirectories: ["docs/.IA/architecture"],
    missingIndexFiles: ["docs/.IA/prompts/index-prompts.md"],
  };
  assert.strictEqual(
    intakeInlineTitle(err),
    "Estrutura governada da `.IA` incompleta",
  );
  assert.ok(intakeInlineBody(err).includes("estrutura core"));
});

test("intakeInlineTitle/Body: BOOTSTRAP_OWNERSHIP", () => {
  const err = {
    code: "KNOWLEDGE_BASE_BOOTSTRAP_OWNERSHIP_VIOLATION",
    message: "Bootstrap prompts devem existir apenas em docs/.IA/system.",
    invalidBootstrapFiles: ["docs/.IA/prompts/bootstrap-create.md"],
  };
  assert.strictEqual(
    intakeInlineTitle(err),
    "Bootstrap prompts em local incorreto",
  );
  assert.ok(intakeInlineBody(err).includes("docs/.IA/system"));
});

test("parseStructuredPreRunError: iaValidation em STRUCTURAL_DRIFT", () => {
  const parsed = parseStructuredPreRunError({
    code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT",
    phase: "validate_knowledge_drift",
    message: "drift",
    iaValidation: {
      valid: false,
      specVersion: "1.0",
      checks: [
        { id: "git", label: "Git", status: "ok" },
        { id: "drift", label: "Drift", status: "fail" },
      ],
      errors: [{ check: "drift", code: "KNOWLEDGE_BASE_STRUCTURAL_DRIFT", message: "drift" }],
      warnings: [],
      git: { ok: true },
      seed: { ok: true },
      structure: { ok: true },
      drift: { ok: false, legacyIaPath: ".IA" },
    },
  });
  assert.ok(parsed?.iaValidation);
  assert.strictEqual(parsed!.iaValidation!.checks.length, 2);
  assert.strictEqual(
    /** @type {{ legacyIaPath?: string }} */ (parsed!.iaValidation!.drift).legacyIaPath,
    ".IA",
  );
});

test("formatPreRunDiagnosticCopy inclui iaValidation", () => {
  const err = parseStructuredPreRunError({
    code: "KNOWLEDGE_BASE_INVALID_SEED",
    message: "seed",
    iaValidation: {
      valid: false,
      specVersion: "1.0",
      checks: [{ id: "seed", label: "Seed", status: "fail" }],
      errors: [],
      warnings: [],
      git: { ok: true },
      seed: { ok: false, missingFiles: ["docs/.IA/index.md"] },
      structure: { ok: true },
      drift: { ok: true },
    },
  });
  assert.ok(err);
  const text = formatPreRunDiagnosticCopy(err);
  assert.ok(text.includes("--- iaValidation ---"));
  assert.ok(text.includes("docs/.IA/index.md"));
});

test("intakeInlineTitle/Body: UNSUPPORTED_VERSION", () => {
  const err = {
    code: "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
    message: "versão não suportada",
    specVersion: "2.0",
    supportedVersions: ["1.0"],
    indexPath: "docs/.IA/index.md",
  };
  assert.strictEqual(intakeInlineTitle(err), "Versão da SPEC `.IA` inválida");
  assert.ok(intakeInlineBody(err).includes("não é suportada"));
});

test("formatPreRunDiagnosticCopy inclui policy em SENSITIVE_DATA", () => {
  const err = parseStructuredPreRunError({
    code: "KNOWLEDGE_BASE_SENSITIVE_DATA",
    message: "sensível",
    iaValidation: {
      valid: false,
      specVersion: "1.0",
      checks: [{ id: "policy", label: "Content Policy", status: "fail" }],
      errors: [],
      warnings: [],
      git: { ok: true },
      seed: { ok: true },
      version: { ok: true },
      structure: { ok: true },
      drift: { ok: true },
      policy: {
        ok: false,
        ruleIds: ["password_assignment"],
        matchedFiles: ["docs/.IA/environment/access.md"],
      },
    },
  });
  assert.ok(err);
  const text = formatPreRunDiagnosticCopy(err!);
  assert.ok(text.includes("--- iaValidation ---"));
  assert.ok(text.includes("password_assignment"));
});

test("intakeInlineTitle/Body: UNTRACKED", () => {
  const err = {
    code: "KNOWLEDGE_BASE_UNTRACKED",
    message:
      "A base de conhecimento existe localmente, mas ainda não está versionada no Git.",
    title: "Base de conhecimento não versionada",
  };
  assert.strictEqual(intakeInlineTitle(err), "Base de conhecimento não versionada");
  assert.ok(intakeInlineBody(err).includes("ainda não foi adicionada ao Git"));
});
