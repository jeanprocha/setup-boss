/**
 * Execution Plan — API pública (Fase 4.1).
 * Hooks pensados para serem chamados pela orquestração; falhas não propagam.
 */

const fs = require("fs");
const path = require("path");
const { isShadowPlanModeEnabled } = require("./feature-flags");
const { generateShadowExecutionPlanDraft } = require("./compiler/shadow-plan-generator");
const { computePlanFingerprint } = require("./fingerprint/plan-fingerprint");
const { validateExecutionPlanStructural } = require("./validation/structural-validation");
const { PLAN_LIFECYCLE_STATE } = require("./schema/constants");
const { applyTransition } = require("./lifecycle/lifecycle-engine");
const {
  loadPlan,
  savePlan,
  updatePlanState,
  appendPlanTransition,
  planPathFor,
} = require("./persistence/plan-store");
const {
  emitPlanTelemetryEvent,
  appendPlanTelemetryRecord,
} = require("./telemetry/plan-telemetry");
const {
  reconcileExecutionPlan,
  saveExecutionReconciliation,
  loadExecutionReconciliation,
} = require("./reconciliation/reconciliation-engine");
const {
  savePlanArtifactsManifest,
  loadPlanArtifactsManifest,
} = require("./manifest/plan-artifacts-manifest");
const { diffExecutionPlans } = require("./diff/plan-diff");
const {
  runShadowValidationTargetingAfterArchitect,
  runShadowValidationTargetingAfterReconciliation,
} = require("./validation-targeting");

function readUtf8Safe(io, absPath, diskFallback) {
  try {
    if (io && typeof io.readFileSync === "function" && io.existsSync(absPath)) {
      return io.readFileSync(absPath, "utf-8");
    }
  } catch (_) {
    /* fallthrough */
  }
  try {
    if (diskFallback && fs.existsSync(absPath)) {
      return fs.readFileSync(absPath, "utf-8");
    }
  } catch (_) {
    /* ignore */
  }
  return "";
}

function readJsonSafe(io, absPath, diskFallback) {
  try {
    if (io && typeof io.readJsonSync === "function" && io.existsSync(absPath)) {
      return io.readJsonSync(absPath);
    }
  } catch (_) {
    /* fallthrough */
  }
  try {
    if (diskFallback && fs.existsSync(absPath)) {
      return JSON.parse(fs.readFileSync(absPath, "utf-8"));
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function safeApply(plan, to, meta, telemetry) {
  const r = applyTransition(plan, to, meta);
  if (r.ok) return r.plan;
  try {
    if (telemetry && telemetry.emit) {
      const rid = plan && plan.run_id;
      const code = r.error && r.error.code;
      emitPlanTelemetryEvent(telemetry, "lifecycle_transition_blocked", {
        run_id: rid,
        to,
        code,
      });
      emitPlanTelemetryEvent(telemetry, "invalid_transition_detected", {
        run_id: rid,
        from: plan && plan.lifecycle_state,
        to,
        code,
      });
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

/**
 * Gera, valida e persiste execution-plan.json (shadow). Nunca lança.
 * @param {{ ctx: object, outputDir: string, runId: string }} args
 * @returns {{ ok: boolean, skipped?: boolean, reason?: string, plan_id?: string, fingerprint?: string|null }}
 */
function runShadowExecutionPlanAfterArchitect(args) {
  const ctx = args && args.ctx;
  const outputDir = args && args.outputDir;
  const runId = args && args.runId;

  try {
    if (!isShadowPlanModeEnabled()) {
      return { ok: true, skipped: true, reason: "plan_mode_off" };
    }
    if (!outputDir || !runId || !ctx) {
      return { ok: true, skipped: true, reason: "missing_context" };
    }

    const existing = planPathFor(outputDir);
    if (fs.existsSync(existing)) {
      return { ok: true, skipped: true, reason: "plan_already_present" };
    }

    const io = ctx.cache;
    const archPath = path.join(outputDir, "architect-output.md");
    const rcPath = path.join(outputDir, "run-context.json");

    const architectOutputMd = readUtf8Safe(io, archPath, true);
    const runContext = readJsonSafe(io, rcPath, true);
    if (!runContext || typeof runContext !== "object") {
      emitPlanTelemetryEvent(ctx.telemetry, "plan_generation_completed", {
        run_id: runId,
        outcome: "skipped_no_run_context",
      });
      return { ok: true, skipped: true, reason: "no_run_context" };
    }

    emitPlanTelemetryEvent(ctx.telemetry, "plan_generation_started", {
      run_id: runId,
    });

    let plan = generateShadowExecutionPlanDraft({
      runId,
      runContext,
      architectOutputMd,
      metadata: null,
    });

    plan = appendPlanTelemetryRecord(plan, "plan_generation_started", { run_id: runId });

    const fp = computePlanFingerprint(plan);
    plan.fingerprints = {
      ...(plan.fingerprints || {}),
      plan_content_sha256: fp.fingerprint_sha256,
      structural_inputs_sha256: fp.fingerprint_sha256,
    };

    if (Array.isArray(plan.revisions) && plan.revisions[0]) {
      plan.revisions = plan.revisions.map((r, i) =>
        i === 0 ? { ...r, fingerprint_sha256: fp.fingerprint_sha256 } : r,
      );
    }

    const validation = validateExecutionPlanStructural(plan);
    plan.validation = {
      ...(plan.validation || {}),
      last_structural: validation,
    };

    if (!validation.ok) {
      plan = appendPlanTelemetryRecord(plan, "plan_validation_failed", {
        errors: validation.errors.slice(0, 25),
      });
      emitPlanTelemetryEvent(ctx.telemetry, "plan_validation_failed", {
        run_id: runId,
        error_codes: validation.errors.map((e) => e.code).slice(0, 30),
      });

      const failed = safeApply(plan, PLAN_LIFECYCLE_STATE.FAILED, {
        reason: "structural_validation_failed",
        guard: "structural_engine",
      }, ctx.telemetry);
      plan = failed || plan;
      plan.lifecycle_updated_at = new Date().toISOString();
    } else {
      let p2 = safeApply(plan, PLAN_LIFECYCLE_STATE.VALIDATED, {
        reason: "structural_validation_ok",
        guard: "structural_engine",
      }, ctx.telemetry);
      if (p2) plan = p2;

      emitPlanTelemetryEvent(ctx.telemetry, "lifecycle_transition", {
        run_id: runId,
        to: PLAN_LIFECYCLE_STATE.VALIDATED,
      });

      p2 = safeApply(plan, PLAN_LIFECYCLE_STATE.APPROVED, {
        reason: "shadow_mode_auto_approve",
        guard: "shadow_policy",
      }, ctx.telemetry);
      if (p2) plan = p2;

      emitPlanTelemetryEvent(ctx.telemetry, "lifecycle_transition", {
        run_id: runId,
        to: PLAN_LIFECYCLE_STATE.APPROVED,
      });
    }

    plan = appendPlanTelemetryRecord(plan, "plan_generation_completed", {
      run_id: runId,
      validation_ok: validation.ok,
    });

    savePlan(outputDir, plan);

    try {
      savePlanArtifactsManifest(outputDir, { plan, run_id: runId, plan_id: plan.plan_id });
      emitPlanTelemetryEvent(ctx.telemetry, "plan_manifest_updated", {
        run_id: runId,
        phase: "after_plan_generation",
      });
    } catch (_) {
      /* optional manifest */
    }

    emitPlanTelemetryEvent(ctx.telemetry, "plan_persisted", {
      run_id: runId,
      plan_id: plan.plan_id,
      fingerprint_sha256: fp.fingerprint_sha256,
      lifecycle_state: plan.lifecycle_state,
    });

    plan = appendPlanTelemetryRecord(plan, "plan_persisted", {
      path: "execution-plan.json",
    });
    savePlan(outputDir, plan);

    try {
      savePlanArtifactsManifest(outputDir, { plan, run_id: runId, plan_id: plan.plan_id });
      emitPlanTelemetryEvent(ctx.telemetry, "plan_manifest_updated", {
        run_id: runId,
        phase: "after_plan_persisted_final",
      });
    } catch (_) {
      /* optional */
    }

    return {
      ok: true,
      plan_id: plan.plan_id,
      fingerprint: fp.fingerprint_sha256,
      lifecycle_state: plan.lifecycle_state,
    };
  } catch (err) {
    try {
      emitPlanTelemetryEvent(args.ctx && args.ctx.telemetry, "plan_generation_completed", {
        run_id: runId,
        outcome: "fatal_swallowed",
        message: String((err && err.message) || err || "").slice(0, 400),
      });
    } catch (_) {
      /* ignore */
    }
    return {
      ok: false,
      skipped: false,
      reason: "exception",
      message: String((err && err.message) || err || ""),
    };
  }
}

/**
 * Atualiza ciclo de vida do plano quando o executor PATCH corre (sem enforcement).
 * @param {{ ctx: object, outputDir: string, runId: string, phase: 'executing'|'completed'|'failed' }} args
 */
function syncShadowPlanExecutorLifecycle(args) {
  try {
    if (!isShadowPlanModeEnabled()) return;
    const outputDir = args && args.outputDir;
    const ctx = args && args.ctx;
    const phase = args && args.phase;
    if (!outputDir || !phase) return;

    let plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") return;

    const actor = { kind: "runtime", component: "executor_patch_legacy", phase };

    if (phase === "executing") {
      const p = safeApply(plan, PLAN_LIFECYCLE_STATE.EXECUTING, {
        reason: "executor_patch_started",
        guard: "orchestration_hook",
        actor,
      }, ctx && ctx.telemetry);
      if (!p) return;
      plan = p;
      emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
        run_id: plan.run_id,
        to: PLAN_LIFECYCLE_STATE.EXECUTING,
      });
      savePlan(outputDir, plan);
      return;
    }

    if (phase === "completed") {
      const p = safeApply(plan, PLAN_LIFECYCLE_STATE.APPROVED, {
        reason: "executor_patch_turn_finished_pending_review",
        guard: "orchestration_hook_executor_turn",
        actor,
      }, ctx && ctx.telemetry);
      if (!p) return;
      plan = p;
      emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
        run_id: plan.run_id,
        to: PLAN_LIFECYCLE_STATE.APPROVED,
      });
      savePlan(outputDir, plan);
      return;
    }

    if (phase === "failed") {
      const from = plan.lifecycle_state;
      const p =
        from === PLAN_LIFECYCLE_STATE.EXECUTING
          ? safeApply(plan, PLAN_LIFECYCLE_STATE.FAILED, {
              reason: "executor_patch_failed",
              guard: "orchestration_hook",
              actor,
            }, ctx && ctx.telemetry)
          : null;
      if (!p) return;
      plan = p;
      emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
        run_id: plan.run_id,
        to: PLAN_LIFECYCLE_STATE.FAILED,
      });
      savePlan(outputDir, plan);
    }
  } catch (_) {
    /* shadow — nunca falhar */
  }
}

/**
 * Chamado quando o pipeline termina com review aprovado e knowledge concluído.
 */
function syncShadowPlanPipelineApprovedFinish(args) {
  try {
    if (!isShadowPlanModeEnabled()) return;
    const outputDir = args && args.outputDir;
    const ctx = args && args.ctx;
    if (!outputDir) return;
    let plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") return;
    const actor = { kind: "runtime", component: "pipeline", phase: "knowledge_finish" };
    const p = safeApply(plan, PLAN_LIFECYCLE_STATE.COMPLETED, {
      reason: "review_approved_pipeline_finished",
      guard: "orchestration_finish",
      actor,
    }, ctx && ctx.telemetry);
    if (!p) return;
    plan = p;
    emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
      run_id: plan.run_id,
      to: PLAN_LIFECYCLE_STATE.COMPLETED,
    });
    savePlan(outputDir, plan);
    try {
      savePlanArtifactsManifest(outputDir, { plan, run_id: plan.run_id, plan_id: plan.plan_id });
    } catch (_) {
      /* optional */
    }
  } catch (_) {
    /* swallow */
  }
}

function syncShadowPlanPipelineBlocked(args) {
  try {
    if (!isShadowPlanModeEnabled()) return;
    const outputDir = args && args.outputDir;
    const ctx = args && args.ctx;
    if (!outputDir) return;
    let plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") return;
    const actor = { kind: "runtime", component: "pipeline", phase: "review_blocked" };
    const p = safeApply(plan, PLAN_LIFECYCLE_STATE.BLOCKED, {
      reason: "review_blocked",
      guard: "orchestration_review",
      actor,
    }, ctx && ctx.telemetry);
    if (!p) return;
    plan = p;
    emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
      run_id: plan.run_id,
      to: PLAN_LIFECYCLE_STATE.BLOCKED,
    });
    savePlan(outputDir, plan);
    try {
      savePlanArtifactsManifest(outputDir, { plan, run_id: plan.run_id, plan_id: plan.plan_id });
    } catch (_) {
      /* optional */
    }
  } catch (_) {
    /* swallow */
  }
}

function syncShadowPlanPipelinePartialFailure(args) {
  try {
    if (!isShadowPlanModeEnabled()) return;
    const outputDir = args && args.outputDir;
    const ctx = args && args.ctx;
    if (!outputDir) return;
    let plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") return;
    const actor = { kind: "runtime", component: "pipeline", phase: "partial_failure" };
    const p = safeApply(plan, PLAN_LIFECYCLE_STATE.FAILED, {
      reason: "pipeline_partial_or_limits",
      guard: "orchestration_partial",
      actor,
    }, ctx && ctx.telemetry);
    if (!p) return;
    plan = p;
    emitPlanTelemetryEvent(ctx && ctx.telemetry, "lifecycle_transition", {
      run_id: plan.run_id,
      to: PLAN_LIFECYCLE_STATE.FAILED,
    });
    savePlan(outputDir, plan);
    try {
      savePlanArtifactsManifest(outputDir, { plan, run_id: plan.run_id, plan_id: plan.plan_id });
    } catch (_) {
      /* optional */
    }
  } catch (_) {
    /* swallow */
  }
}

/**
 * Reconcilia plano shadow com executor-changes após o PATCH (sem enforcement).
 * @param {{ ctx: object, outputDir: string, runId: string, executorChanges: unknown[] }} args
 */
function runShadowPlanReconciliationAfterExecutor(args) {
  const ctx = args && args.ctx;
  const outputDir = args && args.outputDir;
  const runId = args && args.runId;
  const executorChanges = args && args.executorChanges;
  try {
    if (!isShadowPlanModeEnabled()) {
      return { ok: true, skipped: true, reason: "plan_mode_off" };
    }
    if (!outputDir || !runId) {
      return { ok: true, skipped: true, reason: "missing_context" };
    }
    const plan = loadPlan(outputDir);
    if (!plan || typeof plan !== "object") {
      return { ok: true, skipped: true, reason: "no_plan" };
    }
    const doc = reconcileExecutionPlan(plan, executorChanges, {
      plan_id: plan.plan_id,
      run_id: runId,
    });
    saveExecutionReconciliation(outputDir, doc);
    emitPlanTelemetryEvent(ctx && ctx.telemetry, "reconciliation_generated", {
      run_id: runId,
      status: doc.status,
      coverage: doc.coverage,
    });
    savePlanArtifactsManifest(outputDir, { plan, run_id: runId, plan_id: plan.plan_id });
    emitPlanTelemetryEvent(ctx && ctx.telemetry, "plan_manifest_updated", {
      run_id: runId,
      phase: "after_reconciliation",
    });

    return { ok: true, reconciliation: doc };
  } catch (err) {
    return {
      ok: false,
      message: String((err && err.message) || err || ""),
    };
  }
}

module.exports = {
  runShadowExecutionPlanAfterArchitect,
  runShadowPlanReconciliationAfterExecutor,
  syncShadowPlanExecutorLifecycle,
  syncShadowPlanPipelineApprovedFinish,
  syncShadowPlanPipelineBlocked,
  syncShadowPlanPipelinePartialFailure,
  loadPlan,
  savePlan,
  updatePlanState,
  appendPlanTransition,
  reconcileExecutionPlan,
  saveExecutionReconciliation,
  loadExecutionReconciliation,
  diffExecutionPlans,
  savePlanArtifactsManifest,
  loadPlanArtifactsManifest,
  runShadowValidationTargetingAfterArchitect,
  runShadowValidationTargetingAfterReconciliation,
};
