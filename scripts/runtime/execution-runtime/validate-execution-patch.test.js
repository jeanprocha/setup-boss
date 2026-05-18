"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  evaluatePatchAgainstRules,
  validatePathShape,
  patchValidationFilename,
  shouldRunPatchValidation,
  isValidPatchValidationDoc,
} = require("./validate-execution-patch");

test("evaluatePatchAgainstRules aceita patch coerente", () => {
  const r = evaluatePatchAgainstRules({
    executionResult: {
      allowed_files: ["src/a.js"],
      modified_files: ["src/a.js"],
    },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.checks.allowed_scope_respected, true);
  assert.strictEqual(r.checks.wildcard_detected, false);
});

test("evaluatePatchAgainstRules falha fora de allowed_files", () => {
  const r = evaluatePatchAgainstRules({
    executionResult: {
      allowed_files: ["src/a.js"],
      modified_files: ["evil.js"],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.checks.unexpected_files_detected, true);
});

test("evaluatePatchAgainstRules falha com wildcard", () => {
  const r = evaluatePatchAgainstRules({
    executionResult: {
      allowed_files: ["src/*.js"],
      modified_files: ["src/a.js"],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.checks.wildcard_detected, true);
});

test("evaluatePatchAgainstRules falha com path vazio", () => {
  const r = evaluatePatchAgainstRules({
    executionResult: {
      allowed_files: ["src/a.js", ""],
      modified_files: ["src/a.js"],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.checks.empty_paths_detected, true);
});

test("evaluatePatchAgainstRules falha com duplicados", () => {
  const r = evaluatePatchAgainstRules({
    executionResult: {
      allowed_files: ["src/a.js"],
      modified_files: ["src/a.js", "src/a.js"],
    },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.checks.duplicate_paths_detected, true);
});

test("validatePathShape rejeita path traversal", () => {
  assert.strictEqual(validatePathShape("a/../b"), "PATH_TRAVERSAL");
  assert.strictEqual(validatePathShape("../x"), "PATH_TRAVERSAL");
});

test("patchValidationFilename", () => {
  assert.strictEqual(patchValidationFilename("001"), "001-patch-validation.json");
  assert.strictEqual(patchValidationFilename("bad"), "");
});

test("shouldRunPatchValidation idempotência e --force", () => {
  assert.strictEqual(shouldRunPatchValidation("patch_validated", "patch_validated", false), false);
  assert.strictEqual(shouldRunPatchValidation("patch_validated", "patch_validated", true), true);
  assert.strictEqual(shouldRunPatchValidation("execution_completed", "execution_completed", false), true);
});

test("isValidPatchValidationDoc passed e failed", () => {
  assert.strictEqual(
    isValidPatchValidationDoc({
      version: 1,
      phase: "4.5",
      subtask_id: "001",
      status: "validated",
      validation_state: "passed",
      validated_at: "t",
      allowed_files: [],
      modified_files: [],
      validation_summary: "ok",
      checks: {
        allowed_scope_respected: true,
        unexpected_files_detected: false,
        wildcard_detected: false,
        empty_paths_detected: false,
        duplicate_paths_detected: false,
      },
      warnings: [],
      errors: [],
    }),
    true,
  );
  assert.strictEqual(
    isValidPatchValidationDoc({
      version: 1,
      phase: "4.5",
      subtask_id: "001",
      status: "validation_failed",
      validation_state: "failed",
      validated_at: "t",
      allowed_files: [],
      modified_files: [],
      validation_summary: "bad",
      checks: {
        allowed_scope_respected: false,
        unexpected_files_detected: true,
        wildcard_detected: false,
        empty_paths_detected: false,
        duplicate_paths_detected: false,
      },
      warnings: [],
      errors: ["x"],
    }),
    true,
  );
});
