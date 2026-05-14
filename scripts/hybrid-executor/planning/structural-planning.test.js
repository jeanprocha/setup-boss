"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  runStructuralPlanningShadowIfEnabled,
  runStructuralPlanningShadow,
} = require("./structural-planner");

function hybridEnvSnap() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_LANGUAGES_ENABLED: process.env.STRUCTURAL_LANGUAGES_ENABLED,
    STRUCTURAL_PLANNING_ENABLED: process.env.STRUCTURAL_PLANNING_ENABLED,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const INITIAL = hybridEnvSnap();
after(() => restoreEnv(INITIAL));

test("mapping import search → MVP ImportDeclaration selector", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-planner-"));

  fs.writeFileSync(
    path.join(tmpRoot, "mod.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-planner-out-"));

  try {
    const res = runStructuralPlanningShadow({
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

    const planDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-planning.json"), "utf8"));
    assert.ok(Array.isArray(planDoc.entries));

    assert.equal(planDoc.entries[0].chosen_kind, "ImportDeclaration");

    assert.ok(["mapped", "mapped_ambiguous_minspan"].includes(planDoc.entries[0].status));

    const hintsDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-hints.json"), "utf8"));    assert.ok(hintsDoc.hints.length > 0);
    assert.equal(hintsDoc.hints[0].node_kind, "ImportDeclaration");

    const confDoc = JSON.parse(fs.readFileSync(path.join(outDir, "structural-confidence-report.json"), "utf8"));
    assert.ok(confDoc.confidence_entries[0].score >= 30);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("STRUCTURAL_PLANNING OFF ⇒ ifEnabled não grava artefacts", () => {
  restoreEnv(INITIAL);
  delete process.env.HYBRID_EXECUTOR_ENABLED;
  delete process.env.STRUCTURAL_AST_READONLY_ENABLED;
  delete process.env.STRUCTURAL_PLANNING_ENABLED;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pl-off-"));
  fs.writeFileSync(path.join(tmpRoot, "x.js"), "export const z = 1;\n");

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-pl-off-o-"));

  try {
    const res = runStructuralPlanningShadowIfEnabled({
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

    assert.equal(res.ran, false);
    assert.ok(!fs.existsSync(path.join(outDir, "structural-planning.json")));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});
