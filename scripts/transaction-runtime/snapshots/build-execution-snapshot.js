/**
 * Snapshot determinístico de estado runtime (sem copiar o repositório alvo).
 */

const fs = require("fs");
const path = require("path");

const { loadPlan } = require("../../execution-plan");
const {
  EXECUTION_PLAN_FILENAME,
} = require("../../execution-plan/persistence/plan-store");
const { readCheckpoints } = require("../../runtime/replay/checkpoint-manager");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  RISK_ANALYSIS_FILENAME,
} = require("../../risk-runtime/constants");

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function fileRef(outputDir, rel) {
  const p = path.join(outputDir, rel);
  if (!fs.existsSync(p)) return { path: rel, present: false, sha256: null };
  const crypto = require("crypto");
  let sha256 = null;
  let size_bytes = null;
  try {
    const buf = fs.readFileSync(p);
    size_bytes = buf.length;
    sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  } catch (_) {
    sha256 = null;
    size_bytes = null;
  }
  return { path: rel, present: true, size_bytes, sha256 };
}

/**
 * @param {string} outputDir
 * @param {object} opts
 * @param {string} opts.hook
 * @param {string} opts.checkpoint_id
 * @param {string} opts.run_id
 */
function buildExecutionSnapshot(outputDir, opts) {
  const dir = String(outputDir || "");
  const hook = String(opts.hook || "");
  const runId = String(opts.run_id || "");
  const checkpointId = String(opts.checkpoint_id || "");

  const metaPath = path.join(dir, "metadata.json");
  const meta = readJson(metaPath);
  const plan = loadPlan(dir);
  const planId =
    meta && meta.execution_plan && meta.execution_plan.plan_id
      ? String(meta.execution_plan.plan_id)
      : plan && plan.plan_id != null
        ? String(plan.plan_id)
        : "";

  const rc = readJson(path.join(dir, "run-context.json"));
  const checkpoints = readCheckpoints(dir);

  const validationMini = {};
  const valPath = path.join(dir, VALIDATION_RESULTS_FILENAME);
  if (fs.existsSync(valPath)) {
    const v = readJson(valPath);
    if (v && typeof v === "object") {
      validationMini.status = v.status || v.summary?.status || null;
      validationMini.executed_validators = v.executed_validators ?? v.summary?.executed_validators ?? null;
    }
  }

  const riskMini = {};
  const riskPath = path.join(dir, RISK_ANALYSIS_FILENAME);
  if (fs.existsSync(riskPath)) {
    const r = readJson(riskPath);
    if (r && typeof r === "object") {
      riskMini.score = r.score != null ? r.score : r.summary?.score ?? null;
      riskMini.tier = r.tier || r.summary?.tier || null;
    }
  }

  const reviewMini = {};
  const revPath = path.join(dir, "review-output.json");
  if (fs.existsSync(revPath)) {
    const rv = readJson(revPath);
    if (rv && typeof rv === "object") {
      reviewMini.status = rv.status || null;
      reviewMini.requires_correction = rv.requires_correction ?? null;
    }
  }

  const correctionMini = {};
  const corrPath = path.join(dir, "correction-analysis.json");
  if (fs.existsSync(corrPath)) {
    const c = readJson(corrPath);
    if (c && typeof c === "object") {
      correctionMini.correction_analysis_id = c.correction_analysis_id || null;
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    hook,
    checkpoint_id: checkpointId,
    run_id: runId,
    plan_id: planId || null,
    runtime: {
      lifecycle_state: meta && meta.execution ? meta.execution.lifecycle_state || null : null,
      execution_mode: meta && meta.execution ? meta.execution.mode || null : null,
      taskArg: meta && meta.taskArg ? meta.taskArg : null,
      projectArg: meta && meta.projectArg ? meta.projectArg : null,
    },
    lifecycle: {
      run_context_present: Boolean(rc),
      execution_plan_present: fs.existsSync(path.join(dir, EXECUTION_PLAN_FILENAME)),
    },
    manifests: {
      metadata: fileRef(dir, "metadata.json"),
      run_context: fileRef(dir, "run-context.json"),
      execution_plan: fileRef(dir, EXECUTION_PLAN_FILENAME),
      plan_artifacts: fileRef(dir, "plan-artifacts.json"),
    },
    validation_state: validationMini,
    risk_state: riskMini,
    review_state: reviewMini,
    correction_state: correctionMini,
    replay: {
      runtime_checkpoints_path: "runtime-checkpoints.json",
      checkpoint_count: Array.isArray(checkpoints?.checkpoints)
        ? checkpoints.checkpoints.length
        : 0,
      last_legacy_phase:
        Array.isArray(checkpoints?.checkpoints) && checkpoints.checkpoints.length
          ? checkpoints.checkpoints[checkpoints.checkpoints.length - 1].phase_completed || null
          : null,
    },
  };
}

module.exports = {
  buildExecutionSnapshot,
};
