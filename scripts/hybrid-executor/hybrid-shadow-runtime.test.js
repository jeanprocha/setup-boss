const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { parseJavaScript } = require("./languages/javascript/js-parser");
const { parseTypeScript } = require("./languages/typescript/ts-parser");
const { detectStructuralLanguage } = require("./languages/language-detector");
const {
  runHybridShadowReadonlyIfEnabled,
  analyzeOneAllowedFile,
} = require("./hybrid-shadow-runtime");
const {
  isHybridShadowReadonlyActive,
  getStructuralLanguagesEnabled,
} = require("./feature-flags");

function saveHybridEnv() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_LANGUAGES_ENABLED: process.env.STRUCTURAL_LANGUAGES_ENABLED,
  };
}

function restoreHybridEnv(prev) {
  for (const k of Object.keys(prev)) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

const INITIAL_ENV = saveHybridEnv();
after(() => restoreHybridEnv(INITIAL_ENV));

test("detectStructuralLanguage reconhece JS/TS", () => {
  assert.equal(detectStructuralLanguage("a.js"), "javascript");
  assert.equal(detectStructuralLanguage("a.mjs"), "javascript");
  assert.equal(detectStructuralLanguage("b.ts"), "typescript");
  assert.equal(detectStructuralLanguage("c.tsx"), "typescript");
  assert.equal(detectStructuralLanguage("d.go"), null);
});

test("JS válido parseia", () => {
  const { ast, error } = parseJavaScript("export const x = 1;\n", { isJsx: false });
  assert.ok(!error);
  assert.ok(ast && ast.type === "File");
});

test("TS válido parseia", () => {
  const { ast, error } = parseTypeScript("interface A { x: number }\n", "file.ts");
  assert.ok(!error);
  assert.ok(ast && ast.type === "File");
});

test("TSX válido parseia", () => {
  const { ast, error } = parseTypeScript("export function T(){ return <div/> }\n", "file.tsx");
  assert.ok(!error);
  assert.ok(ast && ast.type === "File");
});

test("arquivo sintaxe inválida gera diagnóstico sem lançar", () => {
  const prevLang = process.env.STRUCTURAL_LANGUAGES_ENABLED;
  process.env.STRUCTURAL_LANGUAGES_ENABLED = "javascript,typescript";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-exec-test-"));
  try {
    fs.writeFileSync(path.join(dir, "bad.js"), "const x = (((", "utf8");
    const row = analyzeOneAllowedFile(dir, "bad.js");
    assert.ok(row.parserError);
    assert.equal(row.parserError.phase, "parse");
    assert.equal(row.summaryRow.parse_ok, false);
  } finally {
    if (prevLang === undefined) delete process.env.STRUCTURAL_LANGUAGES_ENABLED;
    else process.env.STRUCTURAL_LANGUAGES_ENABLED = prevLang;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("extensão não suportada ignora sem summary row", () => {
  const prevLang = process.env.STRUCTURAL_LANGUAGES_ENABLED;
  process.env.STRUCTURAL_LANGUAGES_ENABLED = "javascript,typescript";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-exec-test-"));
  try {
    const row = analyzeOneAllowedFile(dir, "x.go");
    assert.ok(!row.summaryRow);
    assert.ok(row.skippedUnsupported);
  } finally {
    if (prevLang === undefined) delete process.env.STRUCTURAL_LANGUAGES_ENABLED;
    else process.env.STRUCTURAL_LANGUAGES_ENABLED = prevLang;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("flags OFF: shadow não corre e não grava artefacts", () => {
  restoreHybridEnv(INITIAL_ENV);
  delete process.env.HYBRID_EXECUTOR_ENABLED;
  delete process.env.STRUCTURAL_AST_READONLY_ENABLED;

  assert.equal(isHybridShadowReadonlyActive(), false);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-out-"));
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-proj-"));
    fs.writeFileSync(path.join(dir, "ok.js"), "exports.x=1;", "utf8");
    runHybridShadowReadonlyIfEnabled({
      outputDir: outDir,
      projectRoot: dir,
      allowedFiles: ["ok.js"],
      outputFs: null,
    });
    assert.ok(!fs.existsSync(path.join(outDir, "hybrid-shadow-runtime.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("flags ON: grava os três artefacts e resume parse TS/TSX", () => {
  restoreHybridEnv(INITIAL_ENV);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_LANGUAGES_ENABLED = "javascript,typescript";

  assert.equal(isHybridShadowReadonlyActive(), true);

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-out2-"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-proj2-"));
  try {
    fs.writeFileSync(path.join(dir, "mod.js"), "module.exports = { a: 1 };\n", "utf8");
    fs.writeFileSync(path.join(dir, "iface.ts"), "export type Id = string;\n", "utf8");
    fs.writeFileSync(path.join(dir, "view.tsx"), "export const X = () => <span/>;\n", "utf8");

    runHybridShadowReadonlyIfEnabled({
      outputDir: outDir,
      projectRoot: dir,
      allowedFiles: ["mod.js", "iface.ts", "view.tsx", "readme.go"],
      outputFs: null,
    });

    assert.ok(fs.existsSync(path.join(outDir, "hybrid-shadow-runtime.json")));
    assert.ok(fs.existsSync(path.join(outDir, "structural-ast-summary.json")));
    assert.ok(fs.existsSync(path.join(outDir, "structural-parser-errors.json")));

    const summary = JSON.parse(fs.readFileSync(path.join(outDir, "structural-ast-summary.json"), "utf8"));
    assert.ok(Array.isArray(summary.files));
    const paths = summary.files.map((x) => x.path).sort();
    assert.deepEqual(paths, ["iface.ts", "mod.js", "view.tsx"]);
    for (const f of summary.files) {
      assert.equal(f.parse_ok, true);
      assert.equal(f.validate_ok, true);
    }
    assert.ok(summary.skipped_unsupported_extension.some((s) => s.path === "readme.go"));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    restoreHybridEnv(INITIAL_ENV);
  }
});

test("STRUCTURAL_LANGUAGES_ENABLED só typescript marca JS como language_disabled", () => {
  restoreHybridEnv(INITIAL_ENV);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_LANGUAGES_ENABLED = "typescript";

  const langs = [...getStructuralLanguagesEnabled()];
  assert.ok(langs.includes("typescript"));
  assert.ok(!langs.includes("javascript"));

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-out3-"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-proj3-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "1", "utf8");
    fs.writeFileSync(path.join(dir, "b.ts"), "export const n = 2;\n", "utf8");
    runHybridShadowReadonlyIfEnabled({
      outputDir: outDir,
      projectRoot: dir,
      allowedFiles: ["a.js", "b.ts"],
      outputFs: null,
    });
    const summary = JSON.parse(fs.readFileSync(path.join(outDir, "structural-ast-summary.json"), "utf8"));
    assert.equal(summary.skipped_language_disabled.some((x) => x.path === "a.js"), true);
    const okTs = summary.files.find((x) => x.path === "b.ts");
    assert.ok(okTs);
    assert.equal(okTs.parse_ok, true);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
    restoreHybridEnv(INITIAL_ENV);
  }
});

test("executor carrega como módulo (sem regressão de require)", () => {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const ex = require("../executor.js");
  assert.equal(typeof ex.runExecutor, "function");
  assert.equal(typeof ex.validatePatchSet, "function");
});
