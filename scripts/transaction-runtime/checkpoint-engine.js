/**
 * Motor formal de checkpoints + contract transaction-runtime.json (Fase 4.6).
 * Erros são silenciados no caller através de try interno onde aplicável — nunca devem abortar o pipeline.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  SCHEMA_VERSION,
  CONTRACT_FILENAME,
  SNAPSHOT_REL_DIR,
  LATEST_SNAPSHOT_FILENAME,
} = require("./constants");
const {
  isTransactionRuntimeWritesEnabled,
  isTransactionRuntimeActiveSemantics,
} = require("./feature-flags");
const { loadPlan } = require("../execution-plan");
const {
  initialStageTransitions,
  markStageEnteredForHook,
  hookToStage,
} = require("./transaction-stages");
const { buildExecutionSnapshot } = require("./snapshots/build-execution-snapshot");
const { appendEvent } = require("./telemetry/transaction-telemetry");
const { writeTransactionRuntimeManifest } = require("./manifests/transaction-manifest");
const { validateReplayContinuity } = require("./replay-continuity-engine");
const { buildRecoveryAnalysis } = require("./recovery-engine");
const { buildRollbackPlan } = require("./rollback-planning");

function transactionIdFor(runId, planId) {
  const h = crypto
    .createHash("sha256")
    .update(`${String(runId)}\n${planId ? String(planId) : ""}`)
    .digest("hex");
  return `txn-${h.slice(0, 28)}`;
}

function resolvePlanId(outputDir) {
  const metaPath = path.join(outputDir, "metadata.json");
  let planFromMeta = null;
  if (fs.existsSync(metaPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      planFromMeta =
        m.execution_plan && m.execution_plan.plan_id ? String(m.execution_plan.plan_id) : null;
    } catch (_) {
      planFromMeta = null;
    }
  }
  const plan = loadPlan(outputDir);
  const fromPlan = plan && plan.plan_id != null ? String(plan.plan_id) : "";
  return planFromMeta || fromPlan || "";
}

function mergeMetadataEnvelope(outputDir, patch) {
  const p = path.join(outputDir, "metadata.json");
  if (!fs.existsSync(p)) return;
  try {
    const meta = JSON.parse(fs.readFileSync(p, "utf8"));
    meta.execution = meta.execution || {};
    meta.execution.transaction_runtime = {
      ...(meta.execution.transaction_runtime || {}),
      ...patch,
    };
    fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf8");
  } catch (_) {
    /* best-effort */
  }
}

function emptyContract(runId, planIdGuess) {
  const plan_id = planIdGuess != null ? String(planIdGuess) : "";
  const rid = String(runId);
  return {
    schema_version: SCHEMA_VERSION,
    transaction_id: transactionIdFor(rid, plan_id || ""),
    plan_id: plan_id,
    run_id: rid,
    generated_at: new Date().toISOString(),
    summary: {
      status: "draft",
      current_stage: "initialization",
      checkpoint_count: 0,
      recovery_possible: true,
      rollback_possible: false,
    },
    stages: initialStageTransitions(),
    checkpoints: [],
    snapshots: [],
    recovery: {},
    rollback_plan: {},
    metadata: {
      SETUP_BOSS_TRANSACTION_RUNTIME: process.env.SETUP_BOSS_TRANSACTION_RUNTIME || "off",
    },
  };
}

function readContract(outputDir) {
  const p = path.join(outputDir, CONTRACT_FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeContract(outputDir, doc) {
  const p = path.join(outputDir, CONTRACT_FILENAME);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
}

function bootstrapTransactionRuntime(outputDir, runId) {
  if (!isTransactionRuntimeWritesEnabled()) return null;
  try {
    const existingPath = path.join(outputDir, CONTRACT_FILENAME);
    if (fs.existsSync(existingPath)) {
      refreshPlanBinding(outputDir, runId);
      return readContract(outputDir);
    }

    const planId = resolvePlanId(outputDir);
    const doc = emptyContract(runId, planId);
    writeContract(outputDir, doc);
    appendEvent(outputDir, {
      type: "transaction_started",
      run_id: String(runId),
      transaction_id: doc.transaction_id,
    });
    mergeMetadataEnvelope(outputDir, {
      mode: process.env.SETUP_BOSS_TRANSACTION_RUNTIME || "off",
      transaction_id: doc.transaction_id,
      checkpoint_count: 0,
      last_hook: null,
    });
    writeTransactionRuntimeManifest(outputDir, { transaction: doc });
    return doc;
  } catch (_) {
    return null;
  }
}

function refreshPlanBinding(outputDir, runId) {
  if (!isTransactionRuntimeWritesEnabled()) return;
  const doc = readContract(outputDir);
  if (!doc) return;
  const planId = resolvePlanId(outputDir);
  if (planId && String(doc.plan_id) !== String(planId)) {
    doc.plan_id = String(planId);
    doc.transaction_id = transactionIdFor(runId, planId);
  }
  writeContract(outputDir, doc);
}

function snapshotManifestRefsFromBody(snapBody) {
  const m =
    snapBody.manifests && typeof snapBody.manifests === "object" ? snapBody.manifests : {};
  const out = [];
  for (const k of Object.keys(m)) {
    const ref = m[k];
    if (ref && ref.present && ref.path) out.push(String(ref.path));
  }
  return out;
}

/**
 * Regista checkpoint formal para um hook pipeline.
 * @param {string} outputDir
 * @param {string} runId
 * @param {string} hook
 * @param {object} extra
 */
function recordTransactionalCheckpoint(outputDir, runId, hook, extra = {}) {
  if (!isTransactionRuntimeWritesEnabled()) return null;

  try {
    refreshPlanBinding(outputDir, runId);

    let doc = readContract(outputDir);
    if (!doc || typeof doc !== "object") {
      doc = emptyContract(runId, resolvePlanId(outputDir));
    }

    const seq = Array.isArray(doc.checkpoints) ? doc.checkpoints.length + 1 : 1;
    const ckId = `${doc.transaction_id}:ck:${seq}:${hook}`;
    const iso = new Date().toISOString();

    fs.mkdirSync(path.join(outputDir, SNAPSHOT_REL_DIR), { recursive: true });
    const snapRelPosix = `${SNAPSHOT_REL_DIR}/snapshot-${String(seq).padStart(3, "0")}-${hook}.json`;
    const snapshotAbs = path.join(outputDir, snapRelPosix);

    const snapBody = buildExecutionSnapshot(outputDir, {
      hook,
      checkpoint_id: ckId,
      run_id: String(runId),
    });
    fs.writeFileSync(snapshotAbs, JSON.stringify(snapBody, null, 2), "utf8");

    fs.writeFileSync(path.join(outputDir, LATEST_SNAPSHOT_FILENAME), JSON.stringify(snapBody, null, 2), "utf8");

    const stageId = hookToStage(hook);
    doc.stages = Array.isArray(doc.stages) ? doc.stages : initialStageTransitions();
    markStageEnteredForHook(doc.stages, hook, iso);

    const validationRefs = [];
    if (fs.existsSync(path.join(outputDir, "validation-results.json"))) {
      validationRefs.push("validation-results.json");
    }
    const riskRefs = [];
    if (fs.existsSync(path.join(outputDir, "risk-analysis.json"))) {
      riskRefs.push("risk-analysis.json");
    }
    const reviewRefs = [];
    if (fs.existsSync(path.join(outputDir, "review-output.json"))) {
      reviewRefs.push("review-output.json");
    }
    const correctionRefs = [];
    if (fs.existsSync(path.join(outputDir, "correction-analysis.json"))) {
      correctionRefs.push("correction-analysis.json");
    }

    doc.checkpoints = Array.isArray(doc.checkpoints) ? doc.checkpoints : [];
    doc.checkpoints.push({
      checkpoint_id: ckId,
      hook,
      stage: stageId,
      created_at: iso,
      snapshot_ref: snapRelPosix.replace(/\\/g, "/"),
      runtime_state: {
        lifecycle_state: snapBody.runtime?.lifecycle_state || null,
        execution_mode: snapBody.runtime?.execution_mode || null,
      },
      manifests_refs: snapshotManifestRefsFromBody(snapBody),
      lifecycle_state: snapBody.runtime?.lifecycle_state || null,
      validation_refs: validationRefs,
      risk_refs: riskRefs,
      review_refs: reviewRefs,
      correction_refs: correctionRefs,
      replay_refs: {
        runtime_checkpoints: "runtime-checkpoints.json",
        last_legacy_phase: snapBody.replay?.last_legacy_phase || null,
      },
      metadata: typeof extra === "object" && extra ? extra : {},
    });

    doc.snapshots = Array.isArray(doc.snapshots) ? doc.snapshots : [];
    doc.snapshots.push({
      snapshot_id: ckId,
      path: snapRelPosix.replace(/\\/g, "/"),
      hook,
      created_at: iso,
    });

    doc.summary.checkpoint_count = doc.checkpoints.length;
    doc.summary.status =
      hook === "post_knowledge" ? doc.summary.status : "running";
    doc.summary.current_stage = stageId || doc.summary.current_stage;
    doc.summary.rollback_possible = false;

    doc.generated_at = iso;

    const continuity = validateReplayContinuity(outputDir, { transactionDoc: doc });

    doc.recovery = buildRecoveryAnalysis(outputDir, {
      deep:
        isTransactionRuntimeActiveSemantics() ||
        hook === "post_knowledge",
    });

    doc.rollback_plan = buildRollbackPlan(outputDir);

    doc.metadata =
      typeof doc.metadata === "object" && doc.metadata
        ? { ...doc.metadata }
        : {};
    doc.metadata.last_continuity_ok = continuity.ok;
    doc.metadata.last_hook = hook;
    doc.metadata.continuity_checked_at =
      continuity.snapshot_consistency_checked_at || iso;

    doc.summary.recovery_possible = Boolean(doc.recovery.recovery_possible);
    doc.summary.rollback_possible = Boolean(doc.rollback_plan.rollback_possible);

    writeContract(outputDir, doc);

    mergeMetadataEnvelope(outputDir, {
      transaction_id: doc.transaction_id,
      checkpoint_count: doc.checkpoints.length,
      last_hook: hook,
      continuity_ok_last: continuity.ok,
      current_stage: doc.summary.current_stage,
    });

    appendEvent(outputDir, {
      type: "checkpoint_created",
      hook,
      checkpoint_id: ckId,
      continuity_ok: continuity.ok,
    });
    appendEvent(outputDir, { type: "snapshot_persisted", path: snapRelPosix });

    appendEvent(outputDir, {
      type: "stage_transition_completed",
      stage: stageId,
      hook,
    });
    appendEvent(outputDir, { type: "replay_continuity_validated", ok: continuity.ok });
    appendEvent(outputDir, {
      type: "recovery_analysis_completed",
      recovery_possible: doc.recovery.recovery_possible,
    });
    appendEvent(outputDir, {
      type: "rollback_plan_generated",
      rollback_feasibility: Boolean(doc.rollback_plan.rollback_feasibility),
    });

    writeTransactionRuntimeManifest(outputDir, { transaction: doc });

    try {
      const { savePlanArtifactsManifest } = require("../execution-plan/manifest/plan-artifacts-manifest");
      const plan = loadPlan(outputDir);
      savePlanArtifactsManifest(outputDir, {
        plan,
        run_id: String(runId),
        plan_id: doc.plan_id || (plan && plan.plan_id ? String(plan.plan_id) : ""),
      });
    } catch (_) {}

    return doc;
  } catch (err) {
    try {
      appendEvent(outputDir, {
        type: "transaction_checkpoint_error",
        message: String(err && err.message ? err.message : err).slice(0, 600),
        hook,
      });
    } catch (_) {}
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {object} outcome
 * @param {'completed'|'partial'|'blocked'|'failed'|string} outcome.pipeline
 */
function finalizeTransactionalRun(outputDir, runId, outcome = {}) {
  if (!isTransactionRuntimeWritesEnabled()) return;
  const doc = readContract(outputDir);
  if (!doc) return;

  const pipe = outcome.pipeline != null ? String(outcome.pipeline) : "";

  let status = doc.summary.status;
  if (pipe === "completed") status = "completed";
  else if (pipe === "blocked" || pipe === "partial") status = "partial";
  else if (pipe === "failed") status = "failed";

  doc.summary.status = status;
  doc.generated_at = new Date().toISOString();

  doc.recovery = buildRecoveryAnalysis(outputDir, {
    deep: isTransactionRuntimeActiveSemantics(),
  });
  doc.rollback_plan = buildRollbackPlan(outputDir);
  doc.summary.recovery_possible = Boolean(doc.recovery.recovery_possible);
  doc.summary.rollback_possible = Boolean(doc.rollback_plan.rollback_possible);

  writeContract(outputDir, doc);
  writeTransactionRuntimeManifest(outputDir, { transaction: doc });

  mergeMetadataEnvelope(outputDir, {
    transaction_id: doc.transaction_id,
    terminal_pipeline: pipe || null,
    checkpoint_count: Array.isArray(doc.checkpoints) ? doc.checkpoints.length : 0,
  });

  appendEvent(outputDir, {
    type: "transaction_completed",
    status: doc.summary.status,
    pipeline: pipe || null,
    run_id: String(runId),
  });

  try {
    const { savePlanArtifactsManifest } = require("../execution-plan/manifest/plan-artifacts-manifest");
    const plan = loadPlan(outputDir);
    savePlanArtifactsManifest(outputDir, {
      plan,
      run_id: String(runId),
      plan_id:
        doc.plan_id || (plan && plan.plan_id != null ? String(plan.plan_id) : ""),
    });
  } catch (_) {}
}

/**
 * Estado terminal em falhas sem contract completo — best-effort.
 */
function finalizeTransactionalFailure(outputDir, runId, outcome = {}) {
  if (!isTransactionRuntimeWritesEnabled()) return;

  try {
    let doc = readContract(outputDir);
    if (!doc) doc = emptyContract(runId, resolvePlanId(outputDir));
    doc.summary.status = outcome.status === "recovered" ? "recovered" : "failed";
    doc.generated_at = new Date().toISOString();
    doc.metadata = typeof doc.metadata === "object" && doc.metadata ? doc.metadata : {};
    doc.metadata.terminal_error_hint = outcome.hint ? String(outcome.hint).slice(0, 800) : null;

    doc.recovery = buildRecoveryAnalysis(outputDir, { deep: true });
    doc.rollback_plan = buildRollbackPlan(outputDir);

    writeContract(outputDir, doc);
    appendEvent(outputDir, {
      type: "transaction_completed",
      status: doc.summary.status,
      pipeline: "failed",
      run_id: String(runId),
    });
    writeTransactionRuntimeManifest(outputDir, { transaction: doc });
    mergeMetadataEnvelope(outputDir, {
      transaction_id: doc.transaction_id,
      terminal_pipeline: "failed",
    });

    try {
      const { savePlanArtifactsManifest } = require("../execution-plan/manifest/plan-artifacts-manifest");
      const plan = loadPlan(outputDir);
      savePlanArtifactsManifest(outputDir, {
        plan,
        run_id: String(runId),
        plan_id:
          doc.plan_id || (plan && plan.plan_id != null ? String(plan.plan_id) : ""),
      });
    } catch (_) {}
  } catch (_) {
    /* nunca falha executor */
  }
}

module.exports = {
  bootstrapTransactionRuntime,
  recordTransactionalCheckpoint,
  finalizeTransactionalRun,
  finalizeTransactionalFailure,
  readContract,
  resolvePlanId,
  transactionIdFor,
};
