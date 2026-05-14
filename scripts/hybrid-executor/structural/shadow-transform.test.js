"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  runStructuralShadowTransformsShadowIfEnabled,
  runStructuralShadowTransformsShadow,
} = require("./shadow-transform-runtime");

const { analyzeShadowTransformDiff } = require("./transform-diff-analyzer");

function hybridSnap() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_LANGUAGES_ENABLED: process.env.STRUCTURAL_LANGUAGES_ENABLED,
    STRUCTURAL_PLANNING_ENABLED: process.env.STRUCTURAL_PLANNING_ENABLED,
    STRUCTURAL_SHADOW_TRANSFORMS_ENABLED: process.env.STRUCTURAL_SHADOW_TRANSFORMS_ENABLED,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const INITIAL = hybridSnap();
after(() => restoreEnv(INITIAL));

test("replace_node sobre ImportDeclaration — textual e structural iguais (normalizado)", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-tr-"));

  fs.writeFileSync(
    path.join(tmpRoot, "mod.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-tr-out-"));

  try {
    const res = runStructuralShadowTransformsShadow({
      force: true,
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["mod.ts"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "mod.ts",
          search: `"alpha-mod"`,
          replace: `"omega-mod"`,
          reason: "test",
        },
      ],
      outputFs: null,
    });

    assert.equal(res.ran, true);

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-transform-plan.json"), "utf8"));
    assert.ok(Array.isArray(planDoc.entries));
    assert.equal(planDoc.phase, "4.9.3.1");
    assert.equal(planDoc.schema_version, 2);

    assert.equal(planDoc.entries[0].op, "replace_node");

    const resultsDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-results.json"), "utf8"));
    assert.equal(resultsDoc.schema_version, 2);

    assert.equal(resultsDoc.per_file[0].equal_normalized, true);
    assert.ok(resultsDoc.per_file[0].content_sha256_normalized.textual);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("FunctionDeclaration — patch parcial dentro do nó converge com textual em memória", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-fn-"));

  fs.writeFileSync(
    path.join(tmpRoot, "fn.js"),
    "export function hello() {\n  return 'a';\n}\n",
    "utf8",
  );

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-fn-out-"));

  try {
    runStructuralShadowTransformsShadow({
      force: true,
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["fn.js"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "fn.js",
          search: "'a'",
          replace: "'b'",
          reason: "t",
        },
      ],
      outputFs: null,
    });

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-transform-plan.json"), "utf8"));
    assert.equal(planDoc.entries[0].op, "replace_node");
    assert.equal(planDoc.entries[0].node_kind, "FunctionDeclaration");

    const resultsDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-results.json"), "utf8"));
    assert.equal(resultsDoc.per_file[0].equal_normalized, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("replace_node sobre VariableDeclaration", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-vd-"));

  fs.writeFileSync(path.join(tmpRoot, "v.js"), "const foo = UNIQUE_TOKEN;\nexport { foo };\n", "utf8");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-vd-out-"));

  try {
    runStructuralShadowTransformsShadow({
      force: true,
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["v.js"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "v.js",
          search: "UNIQUE_TOKEN",
          replace: "OTHER",
          reason: "t",
        },
      ],
      outputFs: null,
    });

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-transform-plan.json"), "utf8"));
    assert.equal(planDoc.entries[0].op, "replace_node");
    assert.equal(planDoc.entries[0].node_kind, "VariableDeclaration");

    const resultsDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-results.json"), "utf8"));
    assert.equal(resultsDoc.per_file[0].equal_normalized, true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("search duplicado no ficheiro — diagnóstico e abort textual", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-dup-"));

  fs.writeFileSync(
    path.join(tmpRoot, "d.js"),
    "const x = 'dup';\nconst y = 'dup';\n",
    "utf8",
  );

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-dup-out-"));

  try {
    runStructuralShadowTransformsShadow({
      force: true,
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["d.js"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "d.js",
          search: "'dup'",
          replace: "'solo'",
          reason: "t",
        },
      ],
      outputFs: null,
    });

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-transform-plan.json"), "utf8"));

    assert.equal(planDoc.entries[0].skip_reason, "bounds_miss");
    assert.equal(planDoc.entries[0].search_match_stats.literal_matches, 2);

    const diffDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-diff.json"), "utf8"));
    assert.ok(diffDoc.summary.patches_search_non_unique_file >= 1);
    assert.ok(diffDoc.summary.textual_abort);
    const rp = diffDoc.patches[0];
    assert.ok(rp.diagnostics_shadow_4931.search_non_unique_in_file_literal);
    assert.ok(rp.divergence_codes.includes("SEARCH_NON_UNIQUE_IN_FILE_LITERAL"));
    assert.ok(rp.divergence_codes.includes("TEXTUAL_PATCH_REJECTED"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("patch em ClassDeclaration MVP — divergence textual≠structural (sem replace_node)", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-clz-"));

  fs.writeFileSync(
    path.join(tmpRoot, "c.ts"),
    "export class C {\n  m(): number {\n    return 1;\n  }\n}\n",
    "utf8",
  );

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-shadow-clz-out-"));

  try {
    runStructuralShadowTransformsShadow({
      force: true,
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["c.ts"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "c.ts",
          search: "return 1",
          replace: "return 2",
          reason: "t",
        },
      ],
      outputFs: null,
    });

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-transform-plan.json"), "utf8"));
    assert.equal(planDoc.entries[0].op, null);
    assert.equal(planDoc.entries[0].skip_reason, "node_kind_not_mvp_shadow");

    const resultsDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-results.json"), "utf8"));
    assert.equal(resultsDoc.per_file[0].equal_normalized, false);

    const diffDoc = JSON.parse(fs.readFileSync(path.join(outDir, "shadow-transform-diff.json"), "utf8"));
    const codes = diffDoc.patches[0].divergence_codes;
    assert.ok(codes.includes("NO_REPLACE_NODE_PLAN_STRUCTURAL_IDLE"));
    assert.ok(codes.includes("AFTER_PATCH_TEXTUAL_VS_STRUCTURAL_SNAPSHOT_DIFFERS"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("analyzeShadowTransformDiff — SEARCH_NON_UNIQUE_IN_MVP_INNER e histogram", () => {
  const raw = analyzeShadowTransformDiff({
    textual_abort: null,
    structural_abort: null,
    per_patch: [
      {
        patch_index: 0,
        path: "x.js",
        had_replace_node_plan: true,
        skipped_structural_no_replace_node: false,
        structural_apply_error: null,
        divergence_after_patch: true,
        textual_chain_ok: true,
        structural_chain_ok: true,
        diagnostics_shadow_4931: {
          search_non_unique_in_mvp_inner: true,
          plan_confidence_degraded: true,
          patch_bounds_extend_outside_mvp_span: true,
        },
      },
    ],
    per_file: [
      {
        path: "x.js",
        textual_final: "aaa",
        structural_final: "aab",
        equal_normalized: false,
      },
    ],
  });

  assert.equal(raw.schema_version, 2);
  const p0 = raw.patches[0];
  assert.ok(p0.divergence_codes.includes("SEARCH_NON_UNIQUE_IN_MVP_INNER"));
  assert.ok(p0.divergence_codes.includes("PLAN_CONFIDENCE_DEGRADED"));
  assert.ok(p0.divergence_codes.includes("PATCH_BOUNDS_NOT_FULLY_INSIDE_MVP_NODE"));
  assert.ok(Number(raw.summary.divergence_code_histogram.SEARCH_NON_UNIQUE_IN_MVP_INNER) >= 1);
});

test("flags OFF ⇒ ifEnabled não grava artefacts", () => {
  restoreEnv(INITIAL);
  delete process.env.HYBRID_EXECUTOR_ENABLED;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-off-"));
  fs.writeFileSync(path.join(tmpRoot, "x.js"), "export const z = 1;\n");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-st-off-o-"));

  try {
    const r = runStructuralShadowTransformsShadowIfEnabled({
      outputDir: outDir,
      projectRoot: tmpRoot,
      allowedFiles: ["x.js"],
      overlay: null,
      changes: [
        {
          operation: "patch",
          path: "x.js",
          search: "export const z",
          replace: "export const y",
          reason: "t",
        },
      ],
      outputFs: null,
    });

    assert.equal(r.ran, false);
    assert.ok(!fs.existsSync(path.join(outDir, "structural-transform-plan.json")));
    assert.ok(!fs.existsSync(path.join(outDir, "shadow-transform-results.json")));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});
