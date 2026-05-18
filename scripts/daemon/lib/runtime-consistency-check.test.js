"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { validateRuntimeConsistency } = require("./runtime-consistency-check");
const { collectOrchestrationBootstrap } = require("./run-execute-api");
const { writeRunIndex } = require("../../../core/run-resolver");
const { buildApprovalState } = require("../../runtime/clarification/approval");
const { seedOutputWithStrategy } = require("../../smoke/fixtures/seed-execution-mvp-strategy-output");
const { runExecutionRuntimeBase } = require("../../runtime/execution-runtime/run-execution-runtime");

function seedApprovedRun(out, runId, projectRoot) {
  fs.mkdirSync(out, { recursive: true });
  writeRunIndex({ runId, projectRoot, outputDir: out });
  const planRef = "task-plan-refined.md";
  fs.writeFileSync(path.join(out, planRef), "# Plano\n\nOK\n", "utf-8");
  fs.writeFileSync(
    path.join(out, "approval-state.json"),
    JSON.stringify(
      buildApprovalState({ decision: "approved", planRef, planSha256: "abc" }),
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(out, "run-context.json"),
    JSON.stringify(
      {
        run_id: runId,
        phase2: { schema_version: "1.0.0", status: "ready_for_execution" },
        phase3: { schema_version: "1.0.0", status: "strategy_ready" },
      },
      null,
      2,
    ),
    "utf-8",
  );
  seedOutputWithStrategy(out, { n: 1 });
}

test("validateRuntimeConsistency OK após execução MVP", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-consist-ok-"));
  const runId = "20260515-130000-test-consistency-ok";
  const out = path.join(root, "docs", ".IA", "outputs", runId);
  seedApprovedRun(out, runId, root);
  const exec = runExecutionRuntimeBase({ outputDirAbs: out, runId });
  assert.strictEqual(exec.ok, true);

  const boot = collectOrchestrationBootstrap(runId, out);
  const report = validateRuntimeConsistency({ runId, outputDir: out, orchestrationBootstrap: boot });
  assert.strictEqual(report.ok, true, JSON.stringify(report.issues));
});

test("validateRuntimeConsistency detecta orch activa sem approval", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sb-consist-bad-"));
  const runId = "20260515-130001-test-consistency-bad";
  const out = path.join(root, "docs", ".IA", "outputs", runId);
  fs.mkdirSync(out, { recursive: true });
  writeRunIndex({ runId, projectRoot: root, outputDir: out });
  fs.writeFileSync(
    path.join(out, "orchestration-state.json"),
    JSON.stringify(
      {
        schema_version: "1.0.0",
        state: "execution_running",
        execution_state: "execution_running",
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );

  const boot = collectOrchestrationBootstrap(runId, out);
  const report = validateRuntimeConsistency({ runId, outputDir: out, orchestrationBootstrap: boot });
  assert.strictEqual(report.ok, false);
  assert.ok(
    report.issues.some((i) => i.code === "ORCH_ACTIVE_WITHOUT_APPROVAL"),
    JSON.stringify(report.issues),
  );
});
