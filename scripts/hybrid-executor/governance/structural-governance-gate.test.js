"use strict";

const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { applyChanges } = require("../../executor");
const { STRUCTURAL_BLOCKER_CODES } = require("./structural-blocker-codes");

function snapGovEnv() {
  return {
    HYBRID_EXECUTOR_ENABLED: process.env.HYBRID_EXECUTOR_ENABLED,
    STRUCTURAL_AST_READONLY_ENABLED: process.env.STRUCTURAL_AST_READONLY_ENABLED,
    STRUCTURAL_PLANNING_ENABLED: process.env.STRUCTURAL_PLANNING_ENABLED,
    HYBRID_EXECUTION_ENABLED: process.env.HYBRID_EXECUTION_ENABLED,
    STRUCTURAL_EXECUTION_MIN_CONFIDENCE: process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE,
    STRUCTURAL_GOVERNANCE_ENABLED: process.env.STRUCTURAL_GOVERNANCE_ENABLED,
    STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE: process.env.STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE,
    STRUCTURAL_REPLAY_FOUNDATION_ENABLED: process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED,
    STRUCTURAL_IDEMPOTENCY_ENABLED: process.env.STRUCTURAL_IDEMPOTENCY_ENABLED,
  };
}

function restoreEnv(s) {
  for (const key of Object.keys(s)) {
    if (s[key] === undefined) delete process.env[key];
    else process.env[key] = s[key];
  }
}

const GOV_INITIAL = snapGovEnv();

after(() => restoreEnv(GOV_INITIAL));

test("4.9.6 — flags OFF: sem artefactos de governança", () => {
  restoreEnv(GOV_INITIAL);
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "false";
  process.env.STRUCTURAL_REPLAY_FOUNDATION_ENABLED = "false";
  process.env.STRUCTURAL_IDEMPOTENCY_ENABLED = "false";

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-off-"));

  try {
    const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [
        {
          patch_index: 0,
          path: "a.js",
          execution_mode_used: "textual",
          fallback_reason: "x",
          fallback_reason_codes: ["confidence_below_threshold"],
          fallback_trigger: "gate",
          gate_snapshot: { allowed: false, block_reasons: ["confidence_below_threshold"] },
        },
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      runDistinctFiles: 2,
    });

    assert.ok(fs.existsSync(path.join(outDir, "hybrid-execution-results.json")));
    assert.ok(!fs.existsSync(path.join(outDir, "structural-governance-report.json")));
    assert.ok(!fs.existsSync(path.join(outDir, "structural-risk-analysis.json")));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(GOV_INITIAL);
  }
});

test("4.9.6 — activação de blockers (drift + corrupt)", () => {
  restoreEnv(GOV_INITIAL);
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const {
    extractStructuralBlockersFromHybridRow,
    buildPatchGovernanceDecision,
  } = require("./structural-governance-gate");

  const driftRow = {
    patch_index: 0,
    path: "z.ts",
    execution_mode_used: "textual",
    controlled_structural_apply: {
      validate: { ok: false, reasons: ["formatter_drift_prefix_outside_span"] },
    },
    gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 90, block_reasons: [] },
  };

  const d1 = extractStructuralBlockersFromHybridRow(driftRow, { run_distinct_files: 1 });
  assert.ok(d1.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_FORMATTER_DRIFT));

  const corruptRow = {
    patch_index: 1,
    path: "z.ts",
    execution_mode_used: "textual",
    controlled_structural_apply: {
      validate: { ok: false, reasons: ["ast_reparse_failed"] },
    },
    gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 90, block_reasons: [] },
  };

  const d2 = extractStructuralBlockersFromHybridRow(corruptRow, { run_distinct_files: 1 });
  assert.ok(d2.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT));

  const dec = buildPatchGovernanceDecision(corruptRow, { run_distinct_files: 1 });
  assert.ok(dec.blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT));
  assert.equal(dec.risk.tier, "high");
});

test("4.9.6 — baixa confiança: warning vs block", () => {
  restoreEnv(GOV_INITIAL);
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const { buildPatchGovernanceDecision } = require("./structural-governance-gate");

  const row = {
    patch_index: 0,
    path: "a.js",
    execution_mode_used: "textual",
    gate_snapshot: {
      allowed: false,
      block_reasons: ["confidence_below_threshold"],
      confidence_score: 40,
      min_score_required: 90,
    },
  };

  process.env.STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE = "warning";
  const w = buildPatchGovernanceDecision(row, { run_distinct_files: 1 });
  assert.ok(w.blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE));
  assert.equal(w.risk.tier, "warning");

  process.env.STRUCTURAL_GOVERNANCE_LOW_CONFIDENCE_MODE = "block";
  const b = buildPatchGovernanceDecision(row, { run_distinct_files: 1 });
  assert.equal(b.risk.tier, "high");

  restoreEnv(GOV_INITIAL);
});

test("4.9.6 — multi-file cascade no relatório", () => {
  restoreEnv(GOV_INITIAL);
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const { runStructuralGovernancePipeline } = require("./structural-governance-gate");

  const pipe = runStructuralGovernancePipeline(
    [
      {
        patch_index: 0,
        path: "a.js",
        execution_mode_used: "structural",
        fallback_trigger: "none",
        gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 55 },
      },
    ],
    { run_distinct_files: 2 },
  );

  assert.ok(pipe.per_patch[0].blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_MULTI_FILE_CASCADE));
  assert.equal(pipe.per_patch[0].risk.tier, "medium");
});

test("4.9.6 — operação estrutural insegura → escalação textual", () => {
  restoreEnv(GOV_INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-unsafe-"));

  fs.writeFileSync(
    path.join(tmpRoot, "m.js"),
    'import x from "mod";\nexport const k = 1;\n',
    "utf8",
  );

  const hybridTel = [];

  try {
    applyChanges(tmpRoot, ["m.js"], [
      {
        operation: "patch",
        path: "m.js",
        search: 'import x from "mod";',
        replace: "",
        reason: "rm",
      },
    ], {
      hybridExecution: true,
      hybridTelemetryOut: hybridTel,
      dryRun: true,
      overlay: {},
    });

    assert.equal(hybridTel[0].fallback_trigger, "governance_escalation");
    assert.equal(hybridTel[0].execution_mode_used, "textual");
    assert.ok(
      (hybridTel[0].fallback_reason_codes || []).includes(
        STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE,
      ),
    );
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    restoreEnv(GOV_INITIAL);
  }
});

test("4.9.6 — fallback textual sob governança alinha com executor textual", () => {
  restoreEnv(GOV_INITIAL);
  process.env.HYBRID_EXECUTOR_ENABLED = "true";
  process.env.STRUCTURAL_AST_READONLY_ENABLED = "true";
  process.env.STRUCTURAL_PLANNING_ENABLED = "true";
  process.env.HYBRID_EXECUTION_ENABLED = "true";
  process.env.STRUCTURAL_EXECUTION_MIN_CONFIDENCE = "0.55";
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const src = 'import x from "mod";\nexport const k = 1;\n';
  const tmpHybrid = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-fb-h-"));
  const tmpPlain = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-fb-p-"));

  try {
    fs.writeFileSync(path.join(tmpHybrid, "m.js"), src, "utf8");
    fs.writeFileSync(path.join(tmpPlain, "m.js"), src, "utf8");

    const change = {
      operation: "patch",
      path: "m.js",
      search: 'import x from "mod";',
      replace: "",
      reason: "rm",
    };

    applyChanges(tmpHybrid, ["m.js"], [change], { dryRun: false, hybridExecution: true });

    applyChanges(tmpPlain, ["m.js"], [change], { dryRun: false, hybridExecution: false });

    const a = fs.readFileSync(path.join(tmpHybrid, "m.js"), "utf8");
    const b = fs.readFileSync(path.join(tmpPlain, "m.js"), "utf8");

    assert.equal(a, b);
    assert.ok(!a.includes("mod"));
  } finally {
    fs.rmSync(tmpHybrid, { recursive: true, force: true });
    fs.rmSync(tmpPlain, { recursive: true, force: true });
    restoreEnv(GOV_INITIAL);
  }
});

test("4.9.6 — writeHybridExecutionArtifacts com governança ON gera relatórios", () => {
  restoreEnv(GOV_INITIAL);
  process.env.STRUCTURAL_GOVERNANCE_ENABLED = "true";

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-gov-art-"));

  try {
    const { writeHybridExecutionArtifacts } = require("../hybrid-executor-core");

    writeHybridExecutionArtifacts({
      outputDir: outDir,
      outputFs: null,
      rows: [
        {
          patch_index: 0,
          path: "a.js",
          execution_mode_used: "structural",
          fallback_trigger: "none",
          gate_snapshot: { allowed: true, confidence_score: 95, min_score_required: 90 },
        },
      ],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      runDistinctFiles: 2,
    });

    const gov = JSON.parse(fs.readFileSync(path.join(outDir, "structural-governance-report.json"), "utf8"));
    const risk = JSON.parse(
      fs.readFileSync(path.join(outDir, "structural-risk-analysis.json"), "utf8"),
    );

    assert.equal(gov.phase, "4.9.6");
    assert.ok(gov.per_patch.length === 1);
    assert.ok(gov.aggregate);
    assert.equal(risk.phase, "4.9.6");
    assert.ok(risk.per_patch_risk.length === 1);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    restoreEnv(GOV_INITIAL);
  }
});
