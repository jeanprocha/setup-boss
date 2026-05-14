/**
 * Validation Runtime — API pública e gancho de pipeline (Fase 4.2).
 * Falhas são engolidas; modo `report` nunca aborta orchestration.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadPlan } = require("../execution-plan/persistence/plan-store");
const { loadValidationTargets } = require("../execution-plan/validation-targeting/validation-manifest");
const { savePlanArtifactsManifest } = require("../execution-plan/manifest/plan-artifacts-manifest");
const { emitPlanTelemetryEvent } = require("../execution-plan/telemetry/plan-telemetry");
const {
  getValidationPolicyProfileFromEnv,
  stagesForProfile,
} = require("./policies/validation-policies");
const { isValidationRuntimeEnabled, getValidationModeFromEnv } = require("./feature-flags");
const { VALIDATION_RESULTS_FILENAME } = require("./constants");
const { buildValidationGraph } = require("./graph/validation-graph");
const { runValidationOrchestration } = require("./orchestrator/validation-orchestrator");
const {
  buildValidationRuntimeManifest,
  saveValidationRuntimeManifest,
} = require("./artifacts/validation-runtime-manifest");

function resolveProjectRootFromOutputDir(outputDir) {
  const metaPath = path.join(String(outputDir || ""), "metadata.json");
  try {
    if (!fs.existsSync(metaPath)) return process.cwd();
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return meta.projectRoot != null ? String(meta.projectRoot) : process.cwd();
  } catch (_) {
    return process.cwd();
  }
}

function computeValidationRunId(planId, runId, graphFp, policy) {
  const payload = [String(planId), String(runId), String(graphFp), String(policy)].join("\u001e");
  const h = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 24);
  return `vr-${h}`;
}

/**
 * @param {{ ctx: object|null, outputDir: string, runId: string, signal?: AbortSignal|null }} args
 */
async function runValidationRuntimeAfterTargeting(args) {
  try {
    if (!isValidationRuntimeEnabled()) {
      return { ok: true, skipped: true, reason: "validation_mode_off" };
    }

    const outputDir = args && args.outputDir ? String(args.outputDir) : "";
    const runId = args && args.runId != null ? String(args.runId) : "";
    const ctx = args && args.ctx;

    if (!outputDir || !runId) {
      return { ok: true, skipped: true, reason: "missing_context" };
    }

    const targetsDoc = loadValidationTargets(outputDir);
    if (
      !targetsDoc ||
      typeof targetsDoc !== "object" ||
      !Array.isArray(targetsDoc.targets) ||
      targetsDoc.targets.length === 0
    ) {
      emitPlanTelemetryEvent(ctx && ctx.telemetry, "validation_runtime_completed", {
        run_id: runId,
        outcome: "skipped_empty_targets",
      });
      return { ok: true, skipped: true, reason: "empty_targets" };
    }

    const plan = loadPlan(outputDir);
    const plan_id =
      plan && plan.plan_id != null ? String(plan.plan_id) : "";

    const policyProfile = getValidationPolicyProfileFromEnv();
    const enabledStages = stagesForProfile(policyProfile);

    const graph = buildValidationGraph({
      targetsDoc,
      plan,
      reconciliation: null,
      enabledStages,
    });

    const validation_run_id = computeValidationRunId(
      plan_id,
      runId,
      graph.graph_fingerprint_sha256 || "",
      policyProfile,
    );

    const projectRoot = resolveProjectRootFromOutputDir(outputDir);

    const { results } = await runValidationOrchestration({
      ctx,
      outputDir,
      projectRoot,
      graph,
      plan_id,
      run_id: runId,
      validation_run_id,
      validation_mode: getValidationModeFromEnv(),
      policy_profile: policyProfile,
      signal: args && args.signal ? args.signal : null,
    });

    const resultsPath = path.join(outputDir, VALIDATION_RESULTS_FILENAME);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");

    const manifest = buildValidationRuntimeManifest({
      outputDir,
      results,
      graph,
      run_id: runId,
      validation_mode: getValidationModeFromEnv(),
    });
    saveValidationRuntimeManifest(outputDir, manifest);

    try {
      savePlanArtifactsManifest(outputDir, {
        plan,
        run_id: runId,
        plan_id: plan_id || (plan && plan.plan_id),
      });
    } catch (_) {
      /* opcional */
    }

    return {
      ok: true,
      skipped: false,
      validation_run_id,
      summary: results.summary,
    };
  } catch (err) {
    try {
      emitPlanTelemetryEvent(args.ctx && args.ctx.telemetry, "validation_runtime_completed", {
        run_id: args && args.runId,
        outcome: "fatal_swallowed",
        message: String((err && err.message) || err || "").slice(0, 400),
      });
    } catch (_) {
      /* ignore */
    }
    return {
      ok: false,
      skipped: false,
      message: String((err && err.message) || err || ""),
    };
  }
}

module.exports = {
  runValidationRuntimeAfterTargeting,
  buildValidationGraph,
  runValidationOrchestration,
  collectValidationRuntimeDiagnostics: require("./diagnostics/validation-runtime-diagnostics")
    .collectValidationRuntimeDiagnostics,
  getValidationModeFromEnv,
  isValidationRuntimeEnabled,
};
