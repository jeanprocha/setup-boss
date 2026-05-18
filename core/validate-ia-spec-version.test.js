"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  parseSpecVersionFromIndexContent,
  validateIaSpecVersion,
  buildSpecVersionFailure,
  SUPPORTED_SPEC_VERSIONS,
} = require("./validate-ia-spec-version");

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeIndex(root, content) {
  const full = path.join(root, "docs", ".IA", "index.md");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

test("parseSpecVersionFromIndexContent: Version: 1.0", () => {
  const p = parseSpecVersionFromIndexContent("Version: 1.0\n");
  assert.strictEqual(p.status, "ok");
  assert.strictEqual(p.detected, "1.0");
});

test("parseSpecVersionFromIndexContent: markdown bold", () => {
  const p = parseSpecVersionFromIndexContent("**Version:** 1.0\n");
  assert.strictEqual(p.status, "ok");
  assert.strictEqual(p.detected, "1.0");
});

test("parseSpecVersionFromIndexContent: ausente", () => {
  const p = parseSpecVersionFromIndexContent("# .IA\n\nSem versão.\n");
  assert.strictEqual(p.status, "missing");
});

test("parseSpecVersionFromIndexContent: inválida abc", () => {
  const p = parseSpecVersionFromIndexContent("Version: abc\n");
  assert.strictEqual(p.status, "invalid");
  assert.strictEqual(p.detected, "abc");
});

test("validateIaSpecVersion: 1.0 passa", () => {
  const root = tmpRoot("sb-ver-ok-");
  writeIndex(root, "Version: 1.0\n");
  const r = validateIaSpecVersion(root);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.specVersion, "1.0");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaSpecVersion: ausente bloqueia", () => {
  const root = tmpRoot("sb-ver-miss-");
  writeIndex(root, "# index\n");
  const r = validateIaSpecVersion(root);
  assert.strictEqual(r.valid, false);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_VERSION_MISSING");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaSpecVersion: inválida bloqueia", () => {
  const root = tmpRoot("sb-ver-bad-");
  writeIndex(root, "Version: abc\n");
  const r = validateIaSpecVersion(root);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_VERSION_INVALID");
  assert.strictEqual(r.detectedSpecVersion, "abc");
  fs.rmSync(root, { recursive: true, force: true });
});

test("validateIaSpecVersion: 2.0 não suportada", () => {
  const root = tmpRoot("sb-ver-20-");
  writeIndex(root, "Version: 2.0\n");
  const r = validateIaSpecVersion(root);
  assert.strictEqual(r.code, "KNOWLEDGE_BASE_UNSUPPORTED_VERSION");
  assert.strictEqual(r.specVersion, "2.0");
  fs.rmSync(root, { recursive: true, force: true });
});

test("buildSpecVersionFailure: payload estruturado", () => {
  const err = buildSpecVersionFailure(
    {
      valid: false,
      versionValid: false,
      code: "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
      specVersion: "2.0",
      detectedSpecVersion: "2.0",
      supportedVersions: [...SUPPORTED_SPEC_VERSIONS],
      indexPath: "docs/.IA/index.md",
    },
    "/tmp/docs/.IA",
  );
  assert.strictEqual(err.phase, "validate_knowledge_spec_version");
  assert.strictEqual(err.specVersion, "2.0");
  assert.deepStrictEqual(err.supportedVersions, ["1.0"]);
});
