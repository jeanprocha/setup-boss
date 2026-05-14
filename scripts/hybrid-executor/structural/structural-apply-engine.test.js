"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { applyChanges } = require("../../executor");
const {
  runControlledStructuralApply,
  createStructuralApplySession,
  writeStructuralApplyArtifacts,
} = require("./structural-apply-engine");
const { postValidateStructuralResult } = require("./structural-post-validate");

function snapEnv() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_PLANNING_ENABLED: process.env.STRUCTURAL_PLANNING_ENABLED,
    HYBRID_EXECUTION_ENABLED: process.env.HYBRID_EXECUTION_ENABLED,
    STRUCTURAL_APPLY_ENABLED: process.env.STRUCTURAL_APPLY_ENABLED,
    STRUCTURAL_EXECUTION_MIN_CONFIDENCE: process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const INITIAL = snapEnv();
after(() => restoreEnv(INITIAL));

test("4.9.5 — apply controlado aceita structural + grava artefactos", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-"));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-out-"));
  const session = createStructuralApplySession();

  fs.writeFileSync(
    path.join(tmpRoot, "m.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["m.ts"], [
      {
        operation: "patch",
        path: "m.ts",
        search: `"alpha-mod"`,
        replace: `"omega-mod"`,
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
    });

    assert.equal(tel.length, 1);
    assert.equal(tel[0].execution_mode_used, "structural");
    assert.equal(tel[0].controlled_structural_apply.accepted, true);

    writeStructuralApplyArtifacts({
      outputDir: outDir,
      outputFs: null,
      session,
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });

    const a = JSON.parse(fs.readFileSync(path.join(outDir, "structural-apply-results.json"), "utf8"));
    const v = JSON.parse(fs.readFileSync(path.join(outDir, "structural-post-validate.json"), "utf8"));
    const r = JSON.parse(fs.readFileSync(path.join(outDir, "structural-rollback-report.json"), "utf8"));

    assert.equal(a.phase, "4.9.5.1");
    assert.equal(a.schema_version, 2);
    assert.equal(a.summary.structural_committed, 1);
    assert.equal(a.diagnostics.apply_ordering.length, 1);
    assert.equal(a.diagnostics.apply_ordering[0].sequence_same_file, 0);
    assert.equal(v.schema_version, 2);
    assert.equal(r.schema_version, 2);
    assert.equal(v.entries[0].ok, true);
    assert.equal(r.summary.rollback_count, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5 — pós-validação rejeita → fallback textual + rollback report", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-fail-"));
  const session = createStructuralApplySession();

  fs.writeFileSync(
    path.join(tmpRoot, "m.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["m.ts"], [
      {
        operation: "patch",
        path: "m.ts",
        search: `"alpha-mod"`,
        replace: `"omega-mod"`,
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
      structuralApplyTestHooks: {
        postValidateStructuralResult: () => ({
          ok: false,
          reasons: ["ast_reparse_failed"],
          parse_error: "injected",
          ast_ok: false,
        }),
      },
    });

    assert.equal(tel[0].execution_mode_used, "textual");
    assert.equal(tel[0].fallback_trigger, "post_structural_validate");
    assert.equal(session.rollbackBuffer.buildReport().summary.rollback_count, 1);
    const lineage = session.rollbackBuffer.buildReport().rollback_lineage;
    assert.equal(lineage[0].linked_apply_sequence, 1);
    assert.deepEqual(lineage[0].prior_patches_same_file, [0]);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5 — formatter drift fora do span detetado", () => {
  const before = 'import x from "a";\n';
  const after = 'Import x from "b";\n';
  const res = postValidateStructuralResult({
    before,
    after,
    planEntry: {
      node_span: { start: before.indexOf('"a"'), end: before.indexOf('"a"') + 3 },
      node_kind: "ImportDeclaration",
    },
    relativePath: "z.ts",
  });

  assert.equal(res.ok, false);
  assert.ok(res.reasons.some((x) => String(x).includes("formatter_drift")));
});

test("4.9.5 — STRUCTURAL_APPLY off → layer skipped sem passar validação extra", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "false";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-skip-"));

  fs.writeFileSync(
    path.join(tmpRoot, "m.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["m.ts"], [
      {
        operation: "patch",
        path: "m.ts",
        search: `"alpha-mod"`,
        replace: `"omega-mod"`,
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      dryRun: true,
      overlay: {},
    });

    assert.equal(tel[0].execution_mode_used, "structural");
    assert.equal(tel[0].controlled_structural_apply.layer, "skipped_flag_off");
    assert.equal(tel[0].controlled_structural_apply.fallback_transition, "controlled_apply_layer_skipped");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5 — sequencing: dois patches structural com apply controlado", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-seq-"));
  const session = createStructuralApplySession();

  fs.writeFileSync(
    path.join(tmpRoot, "multi.ts"),
    'import foo from "one";\nexport const N = 10;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["multi.ts"], [
      {
        operation: "patch",
        path: "multi.ts",
        search: `"one"`,
        replace: `"two"`,
        reason: "t1",
      },
      {
        operation: "patch",
        path: "multi.ts",
        search: "10",
        replace: "20",
        reason: "t2",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
    });

    assert.equal(tel.length, 2);
    assert.equal(tel.every((r) => r.execution_mode_used === "structural"), true);
    assert.equal(session.steps.length, 2);
    assert.equal(session.steps.every((s) => s.accepted_structural), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5.1 — três applies estruturais sequenciais: ordenação global", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-3-"));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-3o-"));
  const session = createStructuralApplySession();

  fs.writeFileSync(
    path.join(tmpRoot, "tr.ts"),
    'import a from "p";\nimport b from "q";\nexport const Z = 1;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["tr.ts"], [
      { operation: "patch", path: "tr.ts", search: `"p"`, replace: `"p2"`, reason: "r0" },
      { operation: "patch", path: "tr.ts", search: `"q"`, replace: `"q2"`, reason: "r1" },
      { operation: "patch", path: "tr.ts", search: "1", replace: "9", reason: "r2" },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
    });

    assert.equal(tel.length, 3);
    assert.ok(tel.every((t) => t.execution_mode_used === "structural"));
    const order = session.steps.map((s) => s.apply_sequence);
    assert.deepEqual(order, [1, 2, 3]);
    assert.deepEqual(
      session.steps.map((s) => s.sequence_same_file),
      [0, 1, 2],
    );

    writeStructuralApplyArtifacts({
      outputDir: outDir,
      outputFs: null,
      session,
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });

    const a = JSON.parse(fs.readFileSync(path.join(outDir, "structural-apply-results.json"), "utf8"));
    assert.equal(a.diagnostics.fallback_transitions.filter((x) => x.final_mode === "structural").length, 3);
    const rb = JSON.parse(fs.readFileSync(path.join(outDir, "structural-rollback-report.json"), "utf8"));
    assert.equal(rb.sequencing.apply_order.length, 3);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5.1 — falha no patch intermédio: rollback + terceiro patch continua", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-mid-"));
  const session = createStructuralApplySession();
  const { postValidateStructuralResult: realPv } = require("./structural-post-validate");
  let pvCalls = 0;

  fs.writeFileSync(
    path.join(tmpRoot, "tr.ts"),
    'import a from "p";\nimport b from "q";\nexport const Z = 1;\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["tr.ts"], [
      { operation: "patch", path: "tr.ts", search: `"p"`, replace: `"p2"`, reason: "r0" },
      { operation: "patch", path: "tr.ts", search: `"q"`, replace: `"q2"`, reason: "r1" },
      { operation: "patch", path: "tr.ts", search: "const Z = 1", replace: "const Z = 99", reason: "r2" },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
      structuralApplyTestHooks: {
        postValidateStructuralResult: (o) => {
          pvCalls += 1;
          if (pvCalls === 2) {
            return { ok: false, reasons: ["ast_reparse_failed"], ast_ok: false, parse_error: "injected_mid" };
          }
          return realPv(o);
        },
      },
    });

    assert.equal(tel[0].execution_mode_used, "structural");
    assert.equal(tel[1].execution_mode_used, "textual");
    assert.equal(tel[2].execution_mode_used, "structural");
    assert.equal(session.steps.length, 3);
    assert.equal(session.steps.filter((s) => s.accepted_structural).length, 2);
    assert.equal(session.steps.filter((s) => !s.accepted_structural).length, 1);
    assert.equal(session.rollbackBuffer.buildReport().summary.rollback_count, 1);
    assert.ok(session.steps[1].corruption_categories.includes("ast_reparse"));

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-mid-out-"));
    writeStructuralApplyArtifacts({
      outputDir: outDir,
      outputFs: null,
      session,
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });
    const a = JSON.parse(fs.readFileSync(path.join(outDir, "structural-apply-results.json"), "utf8"));
    assert.ok(a.summary.corruption_metrics.ast_reparse >= 1);
    fs.rmSync(outDir, { recursive: true, force: true });
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5.1 — mesmo ficheiro: structural depois textual (gate)", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-sa-mix2-"));
  const session = createStructuralApplySession();

  fs.writeFileSync(
    path.join(tmpRoot, "mix.ts"),
    'import z from "mod";\nexport class C {\n  m(): number { return 1; }\n}\n',
    "utf8",
  );

  const tel = [];

  try {
    applyChanges(tmpRoot, ["mix.ts"], [
      { operation: "patch", path: "mix.ts", search: `"mod"`, replace: `"mod2"`, reason: "imp" },
      { operation: "patch", path: "mix.ts", search: "return 1", replace: "return 2", reason: "cls" },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: tel,
      structuralApplySession: session,
      dryRun: true,
      overlay: {},
    });

    assert.equal(tel[0].execution_mode_used, "structural");
    assert.equal(tel[0].controlled_structural_apply.accepted, true);
    assert.equal(tel[1].execution_mode_used, "textual");
    assert.equal(tel[1].controlled_structural_apply, null);
    assert.equal(session.steps.length, 1);
    assert.equal(session.steps[0].sequence_same_file, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.5 — runControlledStructuralApply injetado rejeita → textual", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_APPLY_ENABLED = "true";

  const sess = createStructuralApplySession();
  const before = "export const x = 1;\n";
  const structuralAfter = "export const x = 2;\n";

  const out = runControlledStructuralApply({
    before,
    structuralAfter,
    change: { search: "1", replace: "2" },
    planEntry: { node_span: { start: 0, end: 1 } },
    relativePath: "nope.x",
    patchIndex: 0,
    session: sess,
    postValidateStructuralResult: () => ({ ok: false, reasons: ["test_reject"] }),
  });

  assert.equal(out.accepted, false);
  assert.equal(out.after, "export const x = 2;\n");
});
