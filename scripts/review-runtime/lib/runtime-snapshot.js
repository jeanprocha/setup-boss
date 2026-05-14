/**
 * Snapshot estável de artefactos por outputDir (leitura best-effort).
 */

const fs = require("fs");
const path = require("path");
const { EXECUTION_PLAN_FILENAME } = require("../../execution-plan/persistence/plan-store");
const { RECON_FILE } = require("../../execution-plan/reconciliation/reconciliation-engine");
const { RISK_ANALYSIS_FILENAME } = require("../../risk-runtime/constants");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8");
  } catch (_) {
    return "";
  }
}

/**
 * @param {string} outputDir
 * @param {object} io — opcional { readJsonIfExists(path, fb) }
 */
function collectRuntimeSnapshot(outputDir, io = null) {
  const dir = String(outputDir || "");
  const readJ = (rel, fb = null) =>
    io && typeof io.readJsonIfExists === "function"
      ? io.readJsonIfExists(path.join(dir, rel), fb)
      : readJsonSafe(path.join(dir, rel)) ?? fb;

  const plan = readJ(EXECUTION_PLAN_FILENAME, null);
  const reconciliation = readJ(RECON_FILE, null);
  const validation_results = readJ(VALIDATION_RESULTS_FILENAME, null);
  const validation_runtime_manifest = readJ("validation-runtime-manifest.json", null);
  const risk_analysis = readJ(RISK_ANALYSIS_FILENAME, null);
  const plan_artifacts = readJ("plan-artifacts.json", null);
  const patch_manifest = readJ("patch-manifest.json", null);
  const executor_changes = readJ("executor-changes.json", []);
  const executor_result = readJ("executor-result.json", null);
  const runtime_checkpoints = readJ("runtime-checkpoints.json", null);
  const metadata = readJ("metadata.json", null);
  const run_context = readJ("run-context.json", null);

  return {
    output_dir: dir,
    plan,
    reconciliation,
    validation_results,
    validation_runtime_manifest,
    risk_analysis,
    plan_artifacts,
    patch_manifest,
    executor_changes: Array.isArray(executor_changes) ? executor_changes : [],
    executor_result,
    runtime_checkpoints,
    metadata,
    run_context,
    executor_output_excerpt: readTextSafe(path.join(dir, "executor-output.md")).slice(0, 12000),
  };
}

module.exports = {
  collectRuntimeSnapshot,
  readJsonSafe,
};
