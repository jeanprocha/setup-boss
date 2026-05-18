"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  resolveProjectIaDir,
  resolveProjectIaOutputsDir,
  resolveProjectIaOutputDir,
  isInsideProjectIa,
  isInsideProjectIaOutputs,
} = require("./ia-path-resolver");

function mktempProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("resolveProjectIaDir: apenas docs/.IA existente", () => {
  const dir = mktempProject("sb-ia-pref-");
  const preferred = path.join(dir, "docs", ".IA");
  fs.mkdirSync(preferred, { recursive: true });
  try {
    const r = resolveProjectIaDir(dir);
    assert.strictEqual(r.source, "preferred");
    assert.strictEqual(r.isLegacy, false);
    assert.strictEqual(r.iaDir, path.normalize(path.resolve(dir, "docs", ".IA")));
    assert.deepStrictEqual(r.warnings, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaDir: apenas .IA legado existente", () => {
  const dir = mktempProject("sb-ia-leg-");
  const legacy = path.join(dir, ".IA");
  fs.mkdirSync(legacy, { recursive: true });
  try {
    const r = resolveProjectIaDir(dir);
    assert.strictEqual(r.source, "legacy");
    assert.strictEqual(r.isLegacy, true);
    assert.strictEqual(r.iaDir, path.normalize(path.resolve(dir, ".IA")));
    assert.strictEqual(r.warnings.length, 1);
    assert.strictEqual(r.warnings[0].code, "IA_LEGACY_FALLBACK");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaDir: ambos existentes prioriza docs/.IA e avisa", () => {
  const dir = mktempProject("sb-ia-both-");
  fs.mkdirSync(path.join(dir, "docs", ".IA"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".IA"), { recursive: true });
  try {
    const r = resolveProjectIaDir(dir);
    assert.strictEqual(r.source, "preferred");
    assert.strictEqual(r.isLegacy, false);
    assert.strictEqual(r.iaDir, path.normalize(path.resolve(dir, "docs", ".IA")));
    assert.strictEqual(r.warnings.length, 1);
    assert.strictEqual(r.warnings[0].code, "IA_LEGACY_COEXIST");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaDir: nenhum existente → preferred-missing em docs/.IA", () => {
  const dir = mktempProject("sb-ia-none-");
  try {
    const r = resolveProjectIaDir(dir);
    assert.strictEqual(r.source, "preferred-missing");
    assert.strictEqual(r.isLegacy, false);
    assert.strictEqual(r.iaDir, path.normalize(path.resolve(dir, "docs", ".IA")));
    assert.deepStrictEqual(r.warnings, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaOutputsDir: path outputs coerente com iaDir resolvido", () => {
  const dir = mktempProject("sb-ia-out-");
  fs.mkdirSync(path.join(dir, "docs", ".IA"), { recursive: true });
  try {
    const out = resolveProjectIaOutputsDir(dir);
    const expected = path.normalize(path.resolve(dir, "docs", ".IA", "outputs"));
    assert.strictEqual(out, expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaOutputsDir: com legado apenas, outputs sob .IA", () => {
  const dir = mktempProject("sb-ia-outleg-");
  fs.mkdirSync(path.join(dir, ".IA"), { recursive: true });
  try {
    const out = resolveProjectIaOutputsDir(dir);
    const expected = path.normalize(path.resolve(dir, ".IA", "outputs"));
    assert.strictEqual(out, expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaOutputDir: run-id seguro", () => {
  const dir = mktempProject("sb-ia-run-");
  fs.mkdirSync(path.join(dir, "docs", ".IA"), { recursive: true });
  try {
    const out = resolveProjectIaOutputDir(dir, "run-01_ab");
    const expected = path.normalize(path.resolve(dir, "docs", ".IA", "outputs", "run-01_ab"));
    assert.strictEqual(out, expected);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveProjectIaOutputDir: rejeita traversal no runId", () => {
  const dir = mktempProject("sb-ia-badrun-");
  try {
    assert.throws(() => resolveProjectIaOutputDir(dir, "../x"), /runId inválido/);
    assert.throws(() => resolveProjectIaOutputDir(dir, "a/b"), /runId inválido/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: positivo (docs/.IA)", () => {
  const dir = mktempProject("sb-ia-in1-");
  const inner = path.join(dir, "docs", ".IA", "x.txt");
  fs.mkdirSync(path.dirname(inner), { recursive: true });
  fs.writeFileSync(inner, "x");
  try {
    assert.strictEqual(isInsideProjectIa(dir, inner), true);
    assert.strictEqual(isInsideProjectIa(dir, path.join("docs", ".IA", "x.txt")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: positivo (.IA legado)", () => {
  const dir = mktempProject("sb-ia-in2-");
  const inner = path.join(dir, ".IA", "y.txt");
  fs.mkdirSync(path.dirname(inner), { recursive: true });
  fs.writeFileSync(inner, "y");
  try {
    assert.strictEqual(isInsideProjectIa(dir, inner), true);
    assert.strictEqual(isInsideProjectIa(dir, path.join(".IA", "y.txt")), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: negativo (fora do projeto)", () => {
  const a = mktempProject("sb-ia-a-");
  const b = mktempProject("sb-ia-b-");
  try {
    const foreign = path.join(b, "docs", ".IA", "z.txt");
    fs.mkdirSync(path.dirname(foreign), { recursive: true });
    fs.writeFileSync(foreign, "z");
    assert.strictEqual(isInsideProjectIa(a, foreign), false);
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: negativo (path traversal)", () => {
  const dir = mktempProject("sb-ia-tr-");
  fs.mkdirSync(path.join(dir, "docs", ".IA"), { recursive: true });
  try {
    const rel = path.join("docs", ".IA", "..", "..", "secret");
    assert.strictEqual(isInsideProjectIa(dir, rel), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIaOutputs: positivo e negativo", () => {
  const dir = mktempProject("sb-ia-outv-");
  const good = path.join(dir, "docs", ".IA", "outputs", "r1", "f.json");
  fs.mkdirSync(path.dirname(good), { recursive: true });
  fs.writeFileSync(good, "{}");
  try {
    assert.strictEqual(isInsideProjectIaOutputs(dir, good), true);
    assert.strictEqual(
      isInsideProjectIaOutputs(dir, path.join("docs", ".IA", "outputs", "r1", "f.json")),
      true,
    );
    assert.strictEqual(isInsideProjectIaOutputs(dir, path.join(dir, "docs", ".IA", "x.txt")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIaOutputs: legado .IA/outputs", () => {
  const dir = mktempProject("sb-ia-outlegv-");
  const good = path.join(dir, ".IA", "outputs", "run", "a.json");
  fs.mkdirSync(path.dirname(good), { recursive: true });
  fs.writeFileSync(good, "[]");
  try {
    assert.strictEqual(isInsideProjectIaOutputs(dir, good), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: path sob pasta com prefixo docs/.IA- não conta como dentro", () => {
  const dir = mktempProject("sb-ia-pfx-");
  const decoy = path.join(dir, "docs", ".IA-backup", "nope.txt");
  fs.mkdirSync(path.dirname(decoy), { recursive: true });
  fs.writeFileSync(decoy, "n");
  fs.mkdirSync(path.join(dir, "docs", ".IA"), { recursive: true });
  try {
    assert.strictEqual(isInsideProjectIa(dir, decoy), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isInsideProjectIa: absoluto fora do projectRoot é rejeitado", () => {
  const dir = mktempProject("sb-ia-esc-");
  try {
    const escaped = path.resolve(dir, "..", path.basename(dir) + "_other", "x");
    assert.strictEqual(isInsideProjectIa(dir, escaped), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
