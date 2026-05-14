/**
 * Estabilização Execution Plan — Fase 4.1.1
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { reconcileExecutionPlan, saveExecutionReconciliation, loadExecutionReconciliation } = require("./reconciliation/reconciliation-engine");
const { normalizeOperations, hashNormalizedOperation } = require("./normalization/operation-normalizer");
const { applyTransition, canTransition } = require("./lifecycle/lifecycle-engine");
const { diffExecutionPlans } = require("./diff/plan-diff");
const {
  savePlanArtifactsManifest,
  loadPlanArtifactsManifest,
} = require("./manifest/plan-artifacts-manifest");
const { collectPlanDiagnostics } = require("./diagnostics/plan-diagnostics");
const { PLAN_LIFECYCLE_STATE, PLAN_OPERATION_TYPE } = require("./schema/constants");
const { computePlanFingerprint } = require("./fingerprint/plan-fingerprint");
const { generateShadowExecutionPlanDraft } = require("./compiler/shadow-plan-generator");

const minimalPlan = {
  schema_version: 1,
  plan_id: "p",
  run_id: "r",
  revision_id: "r1",
  lineage_id: "l",
  generated_at: new Date().toISOString(),
  generated_by: {},
  lifecycle_state: PLAN_LIFECYCLE_STATE.DRAFT,
  intent: { summary: "s", task_path: "t.md" },
  operations: [],
  allowed_files: [],
  metadata: {},
  fingerprints: {},
  telemetry: {},
  execution_strategy: { kind: "X" },
  validation: {},
  risk_hints: {},
};

test("reconciliation: partial, full, divergent", () => {
  const plan = {
    plan_id: "p1",
    run_id: "r1",
    operations: [
      { operation_id: "a", type: PLAN_OPERATION_TYPE.FILE_SCOPE, file: "src/x.ts" },
      { operation_id: "b", type: PLAN_OPERATION_TYPE.FILE_SCOPE, file: "src/y.ts" },
    ],
  };
  const r0 = reconcileExecutionPlan(plan, [], {});
  assert.equal(r0.status, "partial");
  assert.ok(r0.coverage.unmatched >= 1);

  const r1 = reconcileExecutionPlan(plan, [{ path: "src/x.ts", search: "//a", replace: "//b" }], {});
  assert.equal(r1.status, "partial");

  const r2 = reconcileExecutionPlan(plan, [
    { path: "src/x.ts", search: "s", replace: "r" },
    { path: "src/y.ts", search: "s", replace: "r" },
  ], {});
  assert.equal(r2.status, "full");

  const r3 = reconcileExecutionPlan(plan, [{ path: "src/other.ts", search: "a", replace: "b" }], {});
  assert.equal(r3.status, "divergent");
});

test("reconciliation persistência round-trip", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-recon-"));
  const doc = reconcileExecutionPlan(
    { plan_id: "p", run_id: "r", operations: [] },
    [],
    {},
  );
  saveExecutionReconciliation(tmp, doc);
  const again = loadExecutionReconciliation(tmp);
  assert.equal(again.status, doc.status);
});

test("applyTransition noop não cresce audit trail", () => {
  const plan = { lifecycle_state: PLAN_LIFECYCLE_STATE.APPROVED, lifecycle_transitions: [] };
  const r = applyTransition(plan, PLAN_LIFECYCLE_STATE.APPROVED, { reason: "rep" });
  assert.equal(r.ok, true);
  assert.equal(r.noop, true);
  assert.equal(r.plan.lifecycle_transitions.length, 0);
});

test("canTransition NOOP explícito vs allowNoop", () => {
  assert.equal(canTransition(PLAN_LIFECYCLE_STATE.APPROVED, PLAN_LIFECYCLE_STATE.APPROVED).ok, false);
  assert.equal(
    canTransition(PLAN_LIFECYCLE_STATE.APPROVED, PLAN_LIFECYCLE_STATE.APPROVED, {
      allowNoop: true,
    }).ok,
    true,
  );
});

test("applyTransition expectFrom bloqueia estado obsoleto", () => {
  const plan = { lifecycle_state: PLAN_LIFECYCLE_STATE.EXECUTING, lifecycle_transitions: [] };
  const r = applyTransition(plan, PLAN_LIFECYCLE_STATE.COMPLETED, {
    expectFrom: PLAN_LIFECYCLE_STATE.APPROVED,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "STALE_TRANSITION");
});

test("applyTransition terminal COMPLETED bloqueado", () => {
  const plan = { lifecycle_state: PLAN_LIFECYCLE_STATE.COMPLETED, lifecycle_transitions: [] };
  const r = applyTransition(plan, PLAN_LIFECYCLE_STATE.FAILED, {});
  assert.equal(r.ok, false);
});

test("diffExecutionPlans é determinístico", () => {
  const a = {
    ...minimalPlan,
    operations: [{ operation_id: "1", type: "T", mode: "m", dependencies: [] }],
  };
  const b = {
    ...minimalPlan,
    operations: [
      { operation_id: "1", type: "T", mode: "m", dependencies: [] },
      { operation_id: "2", type: "T", mode: "m", dependencies: [] },
    ],
    allowed_files: ["a.js"],
    lifecycle_state: PLAN_LIFECYCLE_STATE.APPROVED,
  };
  const d1 = diffExecutionPlans(a, b);
  const d2 = diffExecutionPlans(a, b);
  assert.deepEqual(d1.operations_added, d2.operations_added);
  assert.ok(d1.operations_added.includes("2"));
  assert.ok(d1.lifecycle_changes);
});

test("plan-artifacts inclui dependency_graph e propagation quando existem", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-art-"));
  fs.writeFileSync(path.join(tmp, "dependency-graph.json"), JSON.stringify({ version: 1, nodes: [], edges: [] }));
  fs.writeFileSync(
    path.join(tmp, "validation-propagation-manifest.json"),
    JSON.stringify({ schema_version: "validation-propagation-manifest/1", propagation_mode: "off" }),
  );
  const plan = {
    plan_id: "p",
    run_id: "r",
    operations: [],
    validation: {},
    telemetry: { events: [] },
    fingerprints: {},
  };
  savePlanArtifactsManifest(tmp, { plan });
  const m = loadPlanArtifactsManifest(tmp);
  assert.equal(m.artifacts.dependency_graph, "dependency-graph.json");
  assert.equal(m.artifacts.validation_propagation_manifest, "validation-propagation-manifest.json");
  const ext = m.artifacts.extensions && m.artifacts.extensions.validation_execution_plan;
  assert.ok(ext && ext.dependency_graph_ref === "dependency-graph.json");
  assert.ok(ext && ext.validation_propagation_manifest_ref === "validation-propagation-manifest.json");
});

test("manifest merge preserva extensions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-man-"));
  const prev = {
    schema_version: 1,
    plan_id: "p",
    run_id: "r",
    artifacts: { extensions: { custom: [1] } },
    extensions: { note: "keep" },
    generated_at: "2000-01-01T00:00:00.000Z",
  };
  fs.writeFileSync(path.join(tmp, "plan-artifacts.json"), JSON.stringify(prev));
  const plan = {
    plan_id: "p",
    run_id: "r",
    operations: [],
    validation: {},
    telemetry: { events: [] },
    fingerprints: {},
  };
  savePlanArtifactsManifest(tmp, { plan });
  const m = loadPlanArtifactsManifest(tmp);
  assert.ok(m.artifacts.extensions && m.artifacts.extensions.custom);
  assert.equal(m.extensions.note, "keep");
});

test("collectPlanDiagnostics detecta lineage malformado", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-diag-"));
  const bad = {
    ...minimalPlan,
    revision_lineage: { revision_ids: "não-array" },
  };
  fs.writeFileSync(path.join(tmp, "execution-plan.json"), JSON.stringify(bad));
  const d = collectPlanDiagnostics(tmp);
  assert.ok(d.revision_lineage_issues.some((i) => i.code === "REVISION_IDS_BAD_TYPE"));
});

test("normalizeOperations + fingerprint shadow generator estável", () => {
  const runContext = {
    architect: {
      allowed_files: ["src/A.tsx"],
      plan_summary: "X",
      risks: [],
      stop_criteria: [],
    },
    task: { path: "t.md", title: "T", acceptance_criteria: [] },
    execution_context: { scan_skipped: false },
  };
  const draft = generateShadowExecutionPlanDraft({
    runId: "run-x",
    runContext,
    architectOutputMd: "## Plano\n\n- Um\n",
    metadata: null,
  });
  const ops = normalizeOperations(draft.operations);
  assert.ok(ops.length >= 1);
  const h = hashNormalizedOperation(draft.operations[0]);
  assert.ok(h && h.length === 64);
  const fp = computePlanFingerprint(draft);
  assert.ok(fp.fingerprint_sha256.length === 64);
});
