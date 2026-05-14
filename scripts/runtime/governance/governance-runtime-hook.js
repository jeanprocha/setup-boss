/**
 * Hook Governance Runtime — agregação + enforcement opcional (validation critical v1).
 */

const {
  GOVERNANCE_HOOK_PHASE,
} = require("./governance-runtime-constants");
const { resolveGovernanceRuntimeMode } = require("./governance-mode");
const { collectEvaluationsForHook } = require("./governance-runtime-aggregator");
const {
  createGovernanceRuntimeManifest,
  loadGovernanceRuntimeManifest,
  saveGovernanceRuntimeManifest,
  appendEvaluations,
  recordHookCompleted,
  setPreflightIngested,
  getPreflightIngested,
} = require("./governance-runtime-manifest");
const {
  createGovernanceRuntimeNdjsonSink,
  emitGovernanceRuntimeTelemetry,
} = require("./governance-runtime-telemetry");
const { applyPostValidationGovernanceEnforcement } = require("./governance-validation-enforcement");
const { GovernanceEnforcementError } = require("./governance-enforcement-error");
const { GovernanceAwaitingApprovalError } = require("./governance-awaiting-approval-error");

/**
 * @param {{
 *   ctx: { telemetry?: { emit?: Function }, projectRoot?: string },
 *   outputDir: string,
 *   runId: string,
 *   hookPhase: string,
 *   flowOptions?: { policyProfile?: string | null, forcePolicyBypass?: boolean, disableGovernance?: boolean },
 * }} args
 */
function runGovernanceRuntimeHook(args) {
  try {
    const outputDir = args && args.outputDir ? String(args.outputDir) : "";
    const runId = args && args.runId != null ? String(args.runId) : "";
    const hookPhase = args && args.hookPhase ? String(args.hookPhase) : "";
    const ctx = args && args.ctx;
    const telemetry = ctx && ctx.telemetry;
    const flowOptions = (args && args.flowOptions) || {};
    const projectRootAbs = ctx && ctx.projectRoot != null ? String(ctx.projectRoot) : "";

    if (!outputDir || !runId || !hookPhase) return;

    const modePack = resolveGovernanceRuntimeMode(projectRootAbs, flowOptions);

    let manifest = loadGovernanceRuntimeManifest(outputDir);
    const sink = createGovernanceRuntimeNdjsonSink(outputDir);

    if (!manifest) {
      manifest = createGovernanceRuntimeManifest(runId, modePack.mode);
      saveGovernanceRuntimeManifest(outputDir, manifest);
      emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.runtime.started", {
        run_id: runId,
        mode: manifest.mode,
      });
    } else {
      manifest.mode = modePack.mode;
    }

    const preflightAlready = getPreflightIngested(manifest);
    const evals = collectEvaluationsForHook(hookPhase, outputDir, { preflightAlreadyIngested: preflightAlready });
    appendEvaluations(manifest, evals);

    if (hookPhase === GOVERNANCE_HOOK_PHASE.POST_RECONCILIATION && !preflightAlready) {
      setPreflightIngested(manifest, true);
    }

    if (hookPhase === GOVERNANCE_HOOK_PHASE.POST_VALIDATION) {
      applyPostValidationGovernanceEnforcement({
        outputDir,
        runId,
        manifest,
        telemetry,
        sink,
        allow_hard_enforcement: modePack.allow_hard_enforcement,
        validationCriticalResolution: modePack.validation_critical_resolution,
      });
    }

    recordHookCompleted(manifest, hookPhase);
    saveGovernanceRuntimeManifest(outputDir, manifest);

    emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.phase.evaluated", {
      run_id: runId,
      hook_phase: hookPhase,
      evaluations_added: evals.length,
      lifecycle_state: manifest.lifecycle_state,
    });

    if (hookPhase === GOVERNANCE_HOOK_PHASE.POST_RISK) {
      emitGovernanceRuntimeTelemetry(telemetry, sink, "governance.runtime.completed", {
        run_id: runId,
        lifecycle_state: manifest.lifecycle_state,
        telemetry_digest: manifest.telemetry_digest,
      });
    }
  } catch (e) {
    if (e instanceof GovernanceEnforcementError) throw e;
    if (e instanceof GovernanceAwaitingApprovalError) throw e;
  }
}

/** @deprecated use runGovernanceRuntimeHook */
function runGovernanceRuntimeReportHook(args) {
  runGovernanceRuntimeHook(args);
}

module.exports = {
  runGovernanceRuntimeHook,
  runGovernanceRuntimeReportHook,
  GOVERNANCE_HOOK_PHASE,
};
