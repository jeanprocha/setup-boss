/**
 * Testes do núcleo Execution Plan (Fase 4.1).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  computePlanFingerprint,
  stableStringify,
} = require("./fingerprint/plan-fingerprint");
const { canTransition, applyTransition } = require("./lifecycle/lifecycle-engine");
const { validateExecutionPlanStructural } = require("./validation/structural-validation");
const { generateShadowExecutionPlanDraft } = require("./compiler/shadow-plan-generator");
const {
  PLAN_LIFECYCLE_STATE,
} = require("./schema/constants");

test("stableStringify é determinístico para chaves", () => {
  const a = { z: 1, b: { y: 2, a: 3 } };
  const b = { b: { a: 3, y: 2 }, z: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test("fingerprint coincide para snapshots equivalentes", () => {
  const p1 = {
    schema_version: 1,
    intent: { summary: "hello", task_path: "tasks/a.md" },
    operations: [{ operation_id: "op-1", type: "X", mode: "m", reasoning: "hello" }],
    allowed_files: ["src/a.js"],
    execution_strategy: { kind: "LEGACY_PATCH_EXECUTOR" },
    revision_lineage: { lineage_id: "run", revision_ids: ["run-rev-1"] },
  };
  const p2 = {
    schema_version: 1,
    intent: { summary: "hello", task_path: "tasks/a.md" },
    operations: [{ operation_id: "op-1", type: "X", mode: "m", reasoning: "hello" }],
    allowed_files: ["src/a.js"],
    execution_strategy: { kind: "LEGACY_PATCH_EXECUTOR" },
    revision_lineage: { lineage_id: "run", revision_ids: ["run-rev-1"] },
  };
  assert.equal(
    computePlanFingerprint(p1).fingerprint_sha256,
    computePlanFingerprint(p2).fingerprint_sha256,
  );
});

test("motor de lifecycle aceita sequência shadow executor/review/pipeline", () => {
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.DRAFT, PLAN_LIFECYCLE_STATE.VALIDATED).ok, true);
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.VALIDATED, PLAN_LIFECYCLE_STATE.APPROVED).ok, true);
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.APPROVED, PLAN_LIFECYCLE_STATE.EXECUTING).ok, true);
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.EXECUTING, PLAN_LIFECYCLE_STATE.APPROVED).ok, true);
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.APPROVED, PLAN_LIFECYCLE_STATE.COMPLETED).ok, true);

  let plan = {
    lifecycle_state: PLAN_LIFECYCLE_STATE.DRAFT,
    lifecycle_transitions: [],
  };
  for (const to of [
    PLAN_LIFECYCLE_STATE.VALIDATED,
    PLAN_LIFECYCLE_STATE.APPROVED,
    PLAN_LIFECYCLE_STATE.EXECUTING,
    PLAN_LIFECYCLE_STATE.APPROVED,
    PLAN_LIFECYCLE_STATE.COMPLETED,
  ]) {
    const r = applyTransition(plan, to, { reason: "test" });
    assert.equal(r.ok, true);
    plan = r.plan;
  }
});

test("validação estrutural deteta dup operation_id e ciclo de dependências", () => {
  const badDup = {
    schema_version: 1,
    plan_id: "p",
    run_id: "r",
    revision_id: "r1",
    lineage_id: "l",
    generated_at: new Date().toISOString(),
    generated_by: {},
    lifecycle_state: PLAN_LIFECYCLE_STATE.DRAFT,
    intent: {},
    operations: [
      { operation_id: "x", type: "A", mode: "m" },
      { operation_id: "x", type: "B", mode: "m" },
    ],
    allowed_files: [],
    metadata: {},
    fingerprints: {},
    telemetry: {},
    execution_strategy: {},
    validation: {},
    risk_hints: {},
  };
  const r1 = validateExecutionPlanStructural(badDup);
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => e.code === "DUPLICATE_OPERATION_ID"));

  const badCycle = {
    ...badDup,
    operations: [
      { operation_id: "a", type: "A", mode: "m", dependencies: ["b"] },
      { operation_id: "b", type: "B", mode: "m", dependencies: ["a"] },
    ],
  };
  const r2 = validateExecutionPlanStructural(badCycle);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => e.code === "DEPENDENCY_CYCLE"));
});

test("shadow generator produz plano que passa validação estrutural", () => {
  const md = "## Plano\n\n- Passo um\n- Passo dois\n";
  const runContext = {
    version: "1.0.0",
    architect: {
      allowed_files: ["src/App.tsx"],
      plan_summary: "Resumo curto",
      risks: ["r1"],
      stop_criteria: ["s1"],
    },
    task: {
      path: "tasks/exemplo.md",
      title: "Exemplo",
      acceptance_criteria: ["crit"],
    },
    execution_context: { scan_skipped: false },
  };
  const draft = generateShadowExecutionPlanDraft({
    runId: "run-test",
    runContext,
    architectOutputMd: md,
    metadata: null,
  });
  const v = validateExecutionPlanStructural(draft);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});
