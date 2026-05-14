/**
 * Testes — Risk Runtime (Fase 4.3).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { runRiskEngine } = require("./engine/risk-engine");
const { buildRiskPropagation } = require("./propagation/risk-propagation");
const { validationEscalationRecommendations } = require("./validation/risk-aware-validation");
const { computeConfidence } = require("./scoring/risk-scoring");
const { runRiskAnalysisAfterValidation } = require("./index");

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

test("scoring e risk_analysis_id determinísticos para os mesmos artefactos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-"));
  const runId = "run-determinism";
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "plan-det",
    run_id: runId,
    operations: Array.from({ length: 8 }, (_, i) => ({
      operation_id: `op-${i}`,
      type: "FILE_SCOPE",
      file: `src/f${i}.js`,
    })),
  });
  writeJson(
    path.join(dir, "executor-changes.json"),
    Array.from({ length: 8 }, (_, i) => ({
      path: `src/f${i}.js`,
      search: "a",
      replace: "b",
    })),
  );
  writeJson(path.join(dir, "execution-reconciliation.json"), {
    status: "ok",
    unexpected_changes: [],
    unmatched_operations: [],
    coverage: { matched: 1 },
  });
  writeJson(path.join(dir, "validation-results.json"), {
    validators: [],
    summary: {
      status: "ok",
      total_validators: 0,
      failed_validators: 0,
      executed_validators: 0,
    },
  });

  const a = runRiskEngine({ ctx: null, outputDir: dir, runId });
  const b = runRiskEngine({ ctx: null, outputDir: dir, runId });
  assert.equal(a.analysis.summary.risk_score, b.analysis.summary.risk_score);
  assert.equal(a.analysis.risk_analysis_id, b.analysis.risk_analysis_id);
  assert.equal(a.manifest.semantic_propagation.propagation_mode, "off");
});

test("validation escalation: critical inclui strict e telemetria estendida", () => {
  const v = validationEscalationRecommendations("critical", { validation_failures: true });
  assert.equal(v.recommended_profile, "strict");
  assert.equal(v.extended_telemetry, true);
  assert.equal(v.semantic_validation_escalation, true);
});

test("propagation define cinco camadas", () => {
  const factors = [
    { type: "mutation_scope", severity: "low", score: 10, factor_id: "x1" },
    { type: "validation_failures", severity: "low", score: 5, factor_id: "x2" },
  ];
  const p = buildRiskPropagation({ factors, aggregate: 12, tier: "low" });
  assert.ok(p.layers.plan_risk);
  assert.ok(p.layers.reconciliation_risk);
  assert.ok(p.layers.validation_risk);
  assert.ok(p.layers.operation_risk);
  assert.ok(p.layers.runtime_risk);
});

test("confidence penaliza plano ausente e resultados de validação em falta", () => {
  const hi = computeConfidence({
    has_execution_plan: false,
    plan_present_but_empty_operations: false,
    validation_expected_but_missing_results: true,
    plan_present_but_reconciliation_missing: true,
    partial_validation: false,
    validators_skipped: 0,
    tooling_missing_signals: 0,
  });
  const lo = computeConfidence({
    has_execution_plan: true,
    plan_present_but_empty_operations: false,
    validation_expected_but_missing_results: false,
    plan_present_but_reconciliation_missing: false,
    partial_validation: false,
    validators_skipped: 0,
    tooling_missing_signals: 0,
  });
  assert.ok(hi < lo);
});

test("reconciliation_divergence aumenta score", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-"));
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p-div",
    run_id: "r1",
    operations: [{ operation_id: "o1", type: "FILE_SCOPE", file: "src/a.js" }],
  });
  writeJson(path.join(dir, "executor-changes.json"), [{ path: "src/other.js", search: "x", replace: "y" }]);
  writeJson(path.join(dir, "execution-reconciliation.json"), {
    unexpected_changes: [{ path: "src/other.js" }],
    unmatched_operations: [{ path: "src/a.js" }],
  });
  writeJson(path.join(dir, "validation-results.json"), { validators: [], summary: {} });

  const r = runRiskEngine({ ctx: null, outputDir: dir, runId: "r1" });
  const fac = r.analysis.factors.find((f) => f.type === "reconciliation_divergence");
  assert.ok(fac);
  assert.ok(fac.score >= 40);
});

test("validation failures elevam tier", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-"));
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p-fail",
    run_id: "rf",
    operations: [],
  });
  writeJson(path.join(dir, "executor-changes.json"), []);
  writeJson(path.join(dir, "validation-results.json"), {
    validators: [
      {
        validator_id: "v1",
        validator_type: "structural",
        status: "failed",
        errors: ["boom"],
      },
      {
        validator_id: "v2",
        validator_type: "syntax",
        status: "error",
        errors: ["x"],
      },
    ],
    summary: { failed_validators: 2 },
  });

  const r = runRiskEngine({ ctx: null, outputDir: dir, runId: "rf" });
  const vf = r.analysis.factors.find((f) => f.type === "validation_failures");
  assert.ok(vf.score > 20);
});

test("SETUP_BOSS_RISK_ENGINE=off faz skip em runRiskAnalysisAfterValidation", async () => {
  const prev = process.env.SETUP_BOSS_RISK_ENGINE;
  process.env.SETUP_BOSS_RISK_ENGINE = "off";
  try {
    const out = await runRiskAnalysisAfterValidation({
      ctx: null,
      outputDir: "/tmp",
      runId: "x",
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "risk_engine_off");
  } finally {
    if (prev === undefined) delete process.env.SETUP_BOSS_RISK_ENGINE;
    else process.env.SETUP_BOSS_RISK_ENGINE = prev;
  }
});

test("manifest/replay: plano vazio não quebra engine", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-risk-"));
  writeJson(path.join(dir, "execution-plan.json"), {
    plan_id: "p-empty",
    operations: [],
  });
  writeJson(path.join(dir, "executor-changes.json"), []);
  const r = runRiskEngine({ ctx: null, outputDir: dir, runId: "e" });
  assert.ok(typeof r.analysis.summary.risk_score === "number");
});
