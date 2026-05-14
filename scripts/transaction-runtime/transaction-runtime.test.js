"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  HOOK_TRANSITIONS,
  validateHookFsm,
  assertMonotonicStages,
} = require("./transaction-stages");

const {
  bootstrapTransactionRuntime,
  recordTransactionalCheckpoint,
  finalizeTransactionalRun,
  readContract,
} = require("./checkpoint-engine");

const { validateReplayContinuity } = require("./replay-continuity-engine");
const { buildRollbackPlan } = require("./rollback-planning");

test("FSM permite ciclo correction → executor → validation → risk → review", () => {
  assert.equal(HOOK_TRANSITIONS.post_correction.includes("post_executor"), true);

  const seq = [
    "post_preflight",
    "post_architect",
    "post_plan",
    "post_executor",
    "post_validation",
    "post_risk",
    "post_review",
    "post_correction",
    "post_executor",
    "post_validation",
    "post_risk",
    "post_review",
    "post_knowledge",
  ];
  const { ok } = validateHookFsm(seq);
  assert.equal(ok, true);
});

test("FSM falha quando se salta obrigatório (architect→review antes do executor)", () => {
  const bad = ["post_preflight", "post_architect", "post_review"];
  const r = assertMonotonicStages(bad);
  assert.equal(r.ok, false);
});

test("checkpoints gravam artefactos (shadow)", async (t) => {
  const prev = process.env.SETUP_BOSS_TRANSACTION_RUNTIME;

  process.env.SETUP_BOSS_TRANSACTION_RUNTIME = "shadow";

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "txnrt-"));

  t.after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (prev === undefined) delete process.env.SETUP_BOSS_TRANSACTION_RUNTIME;
    else process.env.SETUP_BOSS_TRANSACTION_RUNTIME = prev;
  });

  const runId = "test-run-1";

  bootstrapTransactionRuntime(tmp, runId);

  fs.writeFileSync(
    path.join(tmp, "metadata.json"),
    JSON.stringify(
      {
        run_id: runId,
        execution: { lifecycle_state: "EXECUTING", mode: "dry_run" },
        taskArg: "tasks/example.md",
        projectArg: "proj",
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(path.join(tmp, "run-context.json"), "{}", "utf8");

  recordTransactionalCheckpoint(tmp, runId, "post_preflight", {});
  recordTransactionalCheckpoint(tmp, runId, "post_architect", {});

  const doc = readContract(tmp);
  assert.ok(doc && doc.checkpoints.length >= 2);
  finalizeTransactionalRun(tmp, runId, { pipeline: "completed" });

  const fin = readContract(tmp);
  assert.equal(fin.summary.status, "completed");

  assert.ok(fs.existsSync(path.join(tmp, "transaction-runtime.json")));
  assert.ok(fs.existsSync(path.join(tmp, "execution-snapshot.json")));

  const cont = validateReplayContinuity(tmp);
  assert.equal(typeof cont.ok, "boolean");
});

test("rollback planning devolve objeto previsto sem aplicar mutações", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "txnrb-"));
  const p = buildRollbackPlan(tmp);
  assert.equal(typeof p.rollback_possible, "boolean");
  assert.equal(Array.isArray(p.candidates), true);
  fs.rmSync(tmp, { recursive: true, force: true });
});
