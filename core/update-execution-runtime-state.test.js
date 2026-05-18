"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const { buildOperationalExecutableStrategy } = require("./build-operational-executable-strategy");
const {
  materializeExecutionRuntimeFromOes,
  loadExecutionRuntimeState,
  EXECUTION_RUNTIME_STATE_REL,
} = require("./materialize-execution-runtime-from-oes");
const {
  transitionMiniActivity,
  refreshMiniActivityDependencyGates,
  tryTransitionMiniActivity,
  computeAggregatedStatus,
  tryApplyMiniActivityReviewStarted,
  applyMiniActivityReviewOutcome,
  tryApplyMiniActivityCorrectionStarted,
  patchMiniActivityOperational,
} = require("./update-execution-runtime-state");

const FIXTURES = path.join(
  __dirname,
  "fixtures",
  "operational-executable-strategy",
);

function copyFixtureToTmp(name) {
  const src = path.join(FIXTURES, name);
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), `oes-exec-s2-${name}-`));
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

function setupMaterializedRun() {
  const out = copyFixtureToTmp("rich-complete");
  buildOperationalExecutableStrategy({ outputDirAbs: out, write: true });
  const mat = materializeExecutionRuntimeFromOes(out, { runId: "run-s2" });
  assert.strictEqual(mat.ok, true);
  return out;
}

function firstMini(out) {
  const loaded = loadExecutionRuntimeState(out);
  const first = loaded.state.miniActivities.find((m) => Number(m.order) === 1);
  assert.ok(first);
  return first;
}

test("transitionMiniActivity: pending → ready via refresh", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  assert.strictEqual(String(first.status), "ready");
});

test("transitionMiniActivity: ready → running → review → completed", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  const ref = { miniActivityId: String(first.miniActivityId) };

  const run = transitionMiniActivity(out, ref, "running", {
    reason: "subtask_execution_started",
    subtaskRef: String(first.subtaskId),
  });
  assert.strictEqual(run.ok, true);
  assert.strictEqual(run.to, "running");

  const rev = transitionMiniActivity(out, ref, "review", {
    reason: "execution_review_started",
    review: { reviewStatus: "pending" },
  });
  assert.strictEqual(rev.ok, true);
  assert.strictEqual(rev.to, "review");

  const done = transitionMiniActivity(out, ref, "completed", {
    reason: "execution_review_approved",
    review: {
      reviewStatus: "approved",
      reviewSummary: "ok",
      reviewArtifactRef: "execution/results/001-execution-review.json",
      correctionRequired: false,
    },
  });
  assert.strictEqual(done.ok, true);
  assert.strictEqual(done.to, "completed");

  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(ma.status), "completed");
  assert.strictEqual(ma.reviewStatus, "approved");
  assert.ok(Array.isArray(ma.transitionHistory));
  assert.ok(ma.transitionHistory.length >= 3);
});

test("transitionMiniActivity: running → failed", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  const ref = { miniActivityId: String(first.miniActivityId) };

  transitionMiniActivity(out, ref, "running", { reason: "start" });
  const fail = transitionMiniActivity(out, ref, "failed", {
    reason: "subtask_execution_failed",
  });
  assert.strictEqual(fail.ok, true);
  assert.strictEqual(fail.to, "failed");

  const loaded = loadExecutionRuntimeState(out);
  assert.strictEqual(loaded.state.aggregatedStatus, "failed");
});

test("bloqueio por dependência: segunda mini permanece blocked até primeira concluir", () => {
  const out = setupMaterializedRun();
  const loaded0 = loadExecutionRuntimeState(out);
  const second = loaded0.state.miniActivities.find((m) => Number(m.order) === 2);
  assert.ok(second);
  assert.strictEqual(String(second.status), "blocked_by_dependency");

  const first = loaded0.state.miniActivities.find((m) => Number(m.order) === 1);
  const ref = { miniActivityId: String(first.miniActivityId) };
  transitionMiniActivity(out, ref, "running", { reason: "start" });
  transitionMiniActivity(out, ref, "review", { reason: "review" });
  transitionMiniActivity(out, ref, "completed", { reason: "done" });

  const refresh = refreshMiniActivityDependencyGates(out);
  assert.strictEqual(refresh.ok, true);
  assert.ok(refresh.changed >= 1);

  const loaded1 = loadExecutionRuntimeState(out);
  const secondAfter = loaded1.state.miniActivities.find(
    (m) => m.miniActivityId === second.miniActivityId,
  );
  assert.strictEqual(String(secondAfter.status), "ready");
});

test("running bloqueado quando dependências incompletas", () => {
  const out = setupMaterializedRun();
  const loaded = loadExecutionRuntimeState(out);
  const second = loaded.state.miniActivities.find((m) => Number(m.order) === 2);
  const blocked = transitionMiniActivity(
    out,
    { miniActivityId: String(second.miniActivityId) },
    "running",
    { reason: "should_block" },
  );
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.code, "blocked_by_dependency");
});

test("histórico de transições regista miniTaskId e refs", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  transitionMiniActivity(
    out,
    { subtaskId: String(first.subtaskId) },
    "running",
    {
      reason: "subtask_execution_started",
      subtaskRef: "001",
      executionRef: "execution/subtasks/001-execution.json",
    },
  );
  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  const last = ma.transitionHistory[ma.transitionHistory.length - 1];
  assert.strictEqual(last.to, "running");
  assert.ok(last.miniTaskId);
  assert.strictEqual(last.subtaskRef, "001");
  assert.ok(last.executionRef);
});

test("runs legadas: tryTransition não quebra sem state", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "oes-exec-legacy-s2-"));
  const res = tryTransitionMiniActivity(
    out,
    { subtaskId: "001" },
    "running",
    { reason: "noop" },
  );
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.legacy, true);
  assert.strictEqual(res.code, "state_missing");
});

test("aggregate status: review e completed", () => {
  const miniActivities = [
    { status: "completed" },
    { status: "review" },
  ];
  assert.strictEqual(computeAggregatedStatus(miniActivities), "review");

  const allDone = [{ status: "completed" }, { status: "skipped" }];
  assert.strictEqual(computeAggregatedStatus(allDone), "completed");
});

test("tryTransitionMiniActivity: retorna legacy quando state ausente", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "oes-exec-try-legacy-"));
  const res = tryTransitionMiniActivity(out, { subtaskId: "001" }, "running");
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.legacy, true);
});

test("slice3: review inicia com reviewStatus running e evento review_started", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  transitionMiniActivity(
    out,
    { miniActivityId: String(first.miniActivityId) },
    "running",
    { reason: "start" },
  );

  const r = tryApplyMiniActivityReviewStarted(out, {
    subtaskId: String(first.subtaskId),
  });
  assert.strictEqual(r.ok, true);

  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(ma.status), "review");
  assert.strictEqual(ma.reviewStatus, "running");
  const ops = ma.operationalHistory || [];
  assert.ok(ops.some((e) => e.type === "review_started"));
});

test("slice3: review aprovado conclui miniActivity", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  const ref = { subtaskId: String(first.subtaskId) };
  transitionMiniActivity(out, ref, "running", { reason: "start" });
  transitionMiniActivity(out, ref, "review", {
    reason: "review",
    review: { reviewStatus: "running" },
  });

  const approved = applyMiniActivityReviewOutcome(out, ref, "approved", {
    reviewSummary: "Aprovado MVP.",
    reviewArtifactRef: "execution/results/001-execution-review.json",
    subtaskRef: "001",
  });
  assert.strictEqual(approved.ok, true);

  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(ma.status), "completed");
  assert.strictEqual(ma.reviewStatus, "approved");
  assert.ok(ma.reviewedAt);
  assert.ok(
    (ma.operationalHistory || []).some((e) => e.type === "review_approved"),
  );
});

test("slice3: review rejeitado marca correctionRequired e correctionRef", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  const ref = { subtaskId: String(first.subtaskId) };
  transitionMiniActivity(out, ref, "running", { reason: "start" });
  transitionMiniActivity(out, ref, "review", {
    review: { reviewStatus: "running" },
  });

  const rejected = applyMiniActivityReviewOutcome(out, ref, "rejected", {
    reviewSummary: "Critérios não satisfeitos.",
    reviewArtifactRef: "execution/results/001-execution-review.json",
    subtaskRef: "001",
    correctionRef: "execution/results/001-correction-loop.json",
  });
  assert.strictEqual(rejected.ok, true);

  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(ma.status), "review");
  assert.strictEqual(ma.reviewStatus, "rejected");
  assert.strictEqual(ma.correctionRequired, true);
  assert.strictEqual(ma.correctionPhase, "correction_required");
  assert.strictEqual(
    ma.correctionRef,
    "execution/results/001-correction-loop.json",
  );
  assert.ok(
    (ma.operationalHistory || []).some((e) => e.type === "review_rejected"),
  );
});

test("slice3: correction iniciada e segundo review após correção", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  const ref = { subtaskId: String(first.subtaskId) };

  applyMiniActivityReviewOutcome(out, ref, "rejected", {
    subtaskRef: "001",
    correctionRef: "execution/results/001-correction-loop.json",
  });

  tryApplyMiniActivityCorrectionStarted(out, {
    subtaskId: "001",
    correctionRef: "execution/results/001-correction-loop.json",
  });

  let loaded = loadExecutionRuntimeState(out);
  let ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(ma.correctionPhase, "correction_running");
  assert.ok(
    (ma.operationalHistory || []).some((e) => e.type === "correction_started"),
  );

  transitionMiniActivity(out, ref, "running", { reason: "correction_retry" });

  const retryReview = tryApplyMiniActivityReviewStarted(out, {
    subtaskId: "001",
  });
  assert.strictEqual(retryReview.ok, true);

  loaded = loadExecutionRuntimeState(out);
  ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.ok(
    (ma.operationalHistory || []).some((e) => e.type === "review_retried"),
  );

  applyMiniActivityReviewOutcome(out, ref, "approved", {
    subtaskRef: "001",
    reviewSummary: "Aprovado após correção.",
  });
  loaded = loadExecutionRuntimeState(out);
  ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  assert.strictEqual(String(ma.status), "completed");
  assert.strictEqual(ma.reviewStatus, "approved");
});

test("slice3: histórico operacional contém artifactRef", () => {
  const out = setupMaterializedRun();
  const first = firstMini(out);
  patchMiniActivityOperational(
    out,
    { subtaskId: String(first.subtaskId) },
    {
      event: {
        type: "correction_completed",
        reason: "test",
        artifactRef: "execution/results/001-correction-loop.json",
        subtaskRef: "001",
      },
    },
  );
  const loaded = loadExecutionRuntimeState(out);
  const ma = loaded.state.miniActivities.find(
    (m) => m.miniActivityId === first.miniActivityId,
  );
  const ev = (ma.operationalHistory || []).find(
    (e) => e.type === "correction_completed",
  );
  assert.ok(ev);
  assert.strictEqual(ev.artifactRef, "execution/results/001-correction-loop.json");
});
