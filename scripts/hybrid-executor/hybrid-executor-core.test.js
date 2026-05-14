"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { applyChanges } = require("../executor");

function snapEnvHybrid() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_LANGUAGES_ENABLED: process.env.STRUCTURAL_LANGUAGES_ENABLED,
    STRUCTURAL_PLANNING_ENABLED: process.env.STRUCTURAL_PLANNING_ENABLED,
    HYBRID_EXECUTION_ENABLED: process.env.HYBRID_EXECUTION_ENABLED,
    STRUCTURAL_EXECUTION_MIN_CONFIDENCE: process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE,
    STRUCTURAL_GOVERNANCE_ENABLED: process.env.STRUCTURAL_GOVERNANCE_ENABLED,
    STRUCTURAL_REPLAY_FOUNDATION_ENABLED: process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED,
    STRUCTURAL_IDEMPOTENCY_ENABLED: process.env.STRUCTURAL_IDEMPOTENCY_ENABLED,
    STRUCTURAL_REPLAY_SHADOW_ENABLED: process.env.STRUCTURAL_REPLAY_SHADOW_ENABLED,
    HYBRID_RUNTIME_OBSERVABILITY_ENABLED: process.env.HYBRID_RUNTIME_OBSERVABILITY_ENABLED,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const INITIAL = snapEnvHybrid();
after(() => restoreEnv(INITIAL));

test("4.9.4 — structural-first quando gate passa", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-"));

  fs.writeFileSync(
    path.join(tmpRoot, "m.ts"),
    'import foo from "alpha-mod";\nexport const BAR = foo;\n',
    "utf8",
  );

  const hybridTel = [];

  try {
    const { isHybridExecutionApplyActive } = require("./feature-flags");

    assert.equal(isHybridExecutionApplyActive(), true);

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
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: {},
    });

    assert.equal(hybridTel.length, 1);
    assert.equal(hybridTel[0].execution_mode_used, "structural");
    assert.ok(!hybridTel[0].fallback_reason);

    const disk = fs.readFileSync(path.join(tmpRoot, "m.ts"), "utf8");

    assert.ok(disk.includes("alpha-mod"), "dry-run não escreveu no disco");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.4 — fallback textual quando confidence abaixo do threshold", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.99";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-th-"));

  fs.writeFileSync(
    path.join(tmpRoot, "fn.js"),
    "export function hello() {\n  return 'a';\n}\n",
    "utf8",
  );

  const hybridTel = [];

  try {
    applyChanges(tmpRoot, ["fn.js"], [
      {
        operation: "patch",
        path: "fn.js",
        search: "'a'",
        replace: "'b'",
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: {},
    });

    assert.equal(hybridTel[0].execution_mode_used, "textual");
    assert.ok(String(hybridTel[0].fallback_reason || "").includes("confidence_below_threshold"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.4 — ClassDeclaration fora do MVP ⇒ fallback textual", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.50";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-cl-"));

  fs.writeFileSync(
    path.join(tmpRoot, "c.ts"),
    "export class C {\n  m(): number {\n    return 1;\n  }\n}\n",
    "utf8",
  );

  const hybridTel = [];

  try {
    applyChanges(tmpRoot, ["c.ts"], [
      {
        operation: "patch",
        path: "c.ts",
        search: "return 1",
        replace: "return 2",
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: {},
    });

    assert.equal(hybridTel[0].execution_mode_used, "textual");
    assert.ok(String(hybridTel[0].fallback_reason || "").includes("not_replace_node_plan"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.4 — writeHybridExecutionArtifacts escreve JSON", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-art-"));

  try {
    const {
      writeHybridExecutionArtifacts,
    } = require("./hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [
        {
          patch_index: 0,
          path: "a.js",
          execution_mode_used: "structural",
          fallback_reason: null,
          fallback_reason_codes: null,
          fallback_trigger: "none",
          gate_snapshot: {
            allowed: true,
            confidence_score: 91,
            min_score_required: 90,
          },
        },
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
    });

    const h = JSON.parse(fs.readFileSync(path.join(outDir, "hybrid-execution-results.json"), "utf8"));
    const r = JSON.parse(fs.readFileSync(path.join(outDir, "structural-fallback-report.json"), "utf8"));

    assert.equal(h.phase, "4.9.4.1");
    assert.equal(h.schema_version, 2);
    assert.equal(h.summary.execution_mode_structural, 1);
    assert.ok(h.diagnostics && h.diagnostics.overlay_sequencing);
    assert.equal(h.diagnostics.overlay_sequencing.max_patches_single_file, 1);

    assert.equal(r.phase, "4.9.4.1");
    assert.equal(r.schema_version, 2);
    assert.ok(Array.isArray(r.entries));
    assert.equal(r.entries[0].execution_mode_used, "structural");
    assert.ok(r.counts.execution_mode_structural >= 1);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("4.9.4.1 — artefactos: mixed_execution_modes e histograma de fallback", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-art2-"));

  try {
    const { writeHybridExecutionArtifacts } = require("./hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [
        {
          patch_index: 0,
          path: "a.js",
          execution_mode_used: "structural",
          fallback_reason: null,
          fallback_reason_codes: null,
          fallback_trigger: "none",
        },
        {
          patch_index: 1,
          path: "b.ts",
          execution_mode_used: "textual",
          fallback_reason: "confidence_below_threshold",
          fallback_reason_codes: ["confidence_below_threshold"],
          fallback_trigger: "gate",
        },
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 2,
    });

    const h = JSON.parse(fs.readFileSync(path.join(outDir, "hybrid-execution-results.json"), "utf8"));
    const r = JSON.parse(fs.readFileSync(path.join(outDir, "structural-fallback-report.json"), "utf8"));

    assert.equal(h.summary.mixed_execution_modes, true);
    assert.equal(h.summary.fallback_reason_histogram.confidence_below_threshold, 1);
    assert.equal(r.counts.textual_via_gate, 1);
    assert.equal(r.fallback_reason_histogram.confidence_below_threshold, 1);
    assert.equal(r.overlay_sequencing.max_patches_single_file, 1);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("4.9.4.1 — vários patches no mesmo ficheiro: sequence_same_file e overlay", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-multi-"));

  fs.writeFileSync(
    path.join(tmpRoot, "multi.ts"),
    'import foo from "one";\nexport const N = 10;\n',
    "utf8",
  );

  const hybridTel = [];
  const ovl = { "multi.ts": 'import foo from "one";\nexport const N = 10;\n' };

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
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: ovl,
    });

    assert.equal(hybridTel.length, 2);
    assert.equal(hybridTel[0].sequence_same_file, 0);
    assert.equal(hybridTel[1].sequence_same_file, 1);
    assert.equal(hybridTel[0].path, "multi.ts");
    assert.equal(hybridTel[1].path, "multi.ts");
    assert.ok(hybridTel[0].overlay_active);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.4.1 — mixed execution_mode_used structural + textual no mesmo run", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-mix-"));

  fs.writeFileSync(
    path.join(tmpRoot, "ok.ts"),
    'import z from "mod-a";\nexport const Q = z;\n',
    "utf8",
  );

  fs.writeFileSync(
    path.join(tmpRoot, "class.ts"),
    "export class C {\n  m(): number {\n    return 1;\n  }\n}\n",
    "utf8",
  );

  const hybridTel = [];

  try {
    applyChanges(tmpRoot, ["ok.ts", "class.ts"], [
      {
        operation: "patch",
        path: "ok.ts",
        search: `"mod-a"`,
        replace: `"mod-b"`,
        reason: "imp",
      },
      {
        operation: "patch",
        path: "class.ts",
        search: "return 1",
        replace: "return 2",
        reason: "cls",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: {},
    });

    const modes = hybridTel.map((t) => t.execution_mode_used);
    assert.ok(modes.includes("structural"));
    assert.ok(modes.includes("textual"));
    assert.ok(
      modes[0] === "structural" || modes[1] === "structural",
      "pelo menos um patch structural esperado no import",
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});

test("4.9.4.1 — flags OFF: hybridTelemetry não é registado (executor textual seguro)", () => {
  restoreEnv(INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "false";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-hyb-off-"));

  fs.writeFileSync(
    path.join(tmpRoot, "x.js"),
    "export const v = 1;\n",
    "utf8",
  );

  const hybridTel = [];

  try {
    applyChanges(tmpRoot, ["x.js"], [
      {
        operation: "patch",
        path: "x.js",
        search: "1",
        replace: "2",
        reason: "t",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: hybridTel,
      dryRun: false,
      overlay: null,
    });

    assert.equal(hybridTel.length, 0);
    const disk = fs.readFileSync(path.join(tmpRoot, "x.js"), "utf8");
    assert.ok(disk.includes("2"), "patch textual aplicado sem telemetria híbrida");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(INITIAL);
  }
});
