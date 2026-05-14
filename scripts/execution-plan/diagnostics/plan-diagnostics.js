/**
 * Coleta dados de diagnóstico do Execution Plan (sem daemon).
 */

const fs = require("fs");
const path = require("path");
const { loadPlan, planPathFor } = require("../persistence/plan-store");
const { loadExecutionReconciliation } = require("../reconciliation/reconciliation-engine");
const { loadPlanArtifactsManifest } = require("../manifest/plan-artifacts-manifest");
const { validateExecutionPlanStructural } = require("../validation/structural-validation");
const { canTransition, isTerminalLifecycleState } = require("../lifecycle/lifecycle-engine");
const { computePlanFingerprint } = require("../fingerprint/plan-fingerprint");
const { PLAN_LIFECYCLE_STATE } = require("../schema/constants");
const {
  collectValidationTargetingDiagnostics,
} = require("../validation-targeting/diagnostics");

function validateRevisionLineageShape(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") return issues;
  const rl = plan.revision_lineage;
  if (rl == null) return issues;
  if (typeof rl !== "object") {
    issues.push({ code: "LINEAGE_BAD_TYPE", message: "revision_lineage deve ser objecto." });
    return issues;
  }
  if (rl.lineage_id == null || String(rl.lineage_id).trim() === "") {
    issues.push({ code: "LINEAGE_ID_MISSING", message: "revision_lineage.lineage_id ausente." });
  }
  if (rl.revision_ids != null && !Array.isArray(rl.revision_ids)) {
    issues.push({ code: "REVISION_IDS_BAD_TYPE", message: "revision_lineage.revision_ids deve ser array." });
  }
  return issues;
}

/**
 * Audita sequência de transições vs ALLOWED_EDGES (melhor esforço).
 * @param {object} plan
 */
function auditTransitionsAgainstModel(plan) {
  const issues = [];
  if (!plan || !Array.isArray(plan.lifecycle_transitions)) return issues;
  let state = PLAN_LIFECYCLE_STATE.DRAFT;
  for (let i = 0; i < plan.lifecycle_transitions.length; i += 1) {
    const tr = plan.lifecycle_transitions[i];
    if (!tr || typeof tr !== "object") continue;
    const to = tr.to;
    const from = tr.from;
    if (from != null && String(from) !== String(state)) {
      issues.push({
        code: "TRANSITION_AUDIT_STALE",
        message: `Transição ${i}: from (${from}) não coincide com estado derivado (${state}).`,
        index: i,
      });
    }
    const g = canTransition(state, to);
    if (!g.ok && !g.noop) {
      issues.push({
        code: "TRANSITION_AUDIT_ILLEGAL",
        message: `Transição ${i}: ${g.message || g.code}`,
        index: i,
      });
    }
    if (g.noop) continue;
    if (g.ok) state = to;
  }
  if (plan.lifecycle_state != null && String(plan.lifecycle_state) !== String(state)) {
    issues.push({
      code: "TRANSITION_AUDIT_HEAD_MISMATCH",
      message: `lifecycle_state (${plan.lifecycle_state}) ≠ estado derivado do histórico (${state}).`,
    });
  }
  return issues;
}

/**
 * @param {string} outputDir
 * @param {{ includePlanBody?: boolean }} opts
 */
function collectPlanDiagnostics(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const planPath = planPathFor(dir);
  const planExists = fs.existsSync(planPath);
  const plan = loadPlan(dir);
  const structural = plan
    ? validateExecutionPlanStructural(plan)
    : {
        ok: false,
        errors: [{ code: "PLAN_MISSING", message: "execution-plan.json ausente ou ilegível." }],
        warnings: [],
        validated_at: new Date().toISOString(),
      };
  const lineage = validateRevisionLineageShape(plan);
  const transitionsAudit = plan ? auditTransitionsAgainstModel(plan) : [];
  const recon = loadExecutionReconciliation(dir);
  const manifest = loadPlanArtifactsManifest(dir);
  let fingerprint = null;
  if (plan) {
    const fp = computePlanFingerprint(plan);
    fingerprint = { plan_content_sha256: fp.fingerprint_sha256 };
  }

  const lifecycle = plan
    ? {
        state: plan.lifecycle_state,
        updated_at: plan.lifecycle_updated_at || null,
        is_terminal: isTerminalLifecycleState(plan.lifecycle_state),
        transitions_count: Array.isArray(plan.lifecycle_transitions)
          ? plan.lifecycle_transitions.length
          : 0,
      }
    : null;

  const out = {
    output_dir: dir,
    execution_plan_path: planPath,
    plan_present: Boolean(plan),
    lifecycle,
    structural_validation: structural,
    revision_lineage_issues: lineage,
    transition_audit: transitionsAudit,
    reconciliation: recon,
    manifest,
    fingerprint,
    validation_targeting: collectValidationTargetingDiagnostics(dir),
    extensions: {},
  };

  if (opts.includePlanBody && plan) {
    out.plan = plan;
  }

  return out;
}

/**
 * @param {string} absPath
 * @returns {object|null}
 */
function readPlanJsonFile(absPath) {
  try {
    const raw = fs.readFileSync(absPath, "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

module.exports = {
  collectPlanDiagnostics,
  validateRevisionLineageShape,
  auditTransitionsAgainstModel,
  readPlanJsonFile,
};
