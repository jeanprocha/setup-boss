/**
 * Apply-later determinístico: reaplica executor-changes.json sem LLM.
 */

const fs = require("fs");
const path = require("path");
const { applyChanges, validatePatchSet } = require("../../executor");
const {
  getAllowedFilesFromRunContext,
  isUsableRunContext,
} = require("../../shared-utils");
const { readPatchManifest } = require("./patch-manifest");
const {
  validateFilesystemAgainstManifest,
  validateExecutorChangesIntegrity,
} = require("./drift-detector");
const { RUNTIME_LIFECYCLE } = require("./lifecycle");
const { evaluateApplyGovernance } = require("../governance/policy-engine");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function appendPhysicalApplyGov(outputDir, ag) {
  const p = path.join(outputDir, "governance-decisions.json");
  let root = {};
  if (fs.existsSync(p)) {
    try {
      root = JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (_) {
      root = {};
    }
  }
  root.physical_apply_audit = {
    at: new Date().toISOString(),
    ok: Boolean(ag && ag.ok),
    profile_resolved:
      ag && ag.profile_resolved != null ? ag.profile_resolved : null,
    decisions: ag && Array.isArray(ag.decisions) ? ag.decisions : [],
    message: ag && ag.message ? String(ag.message) : undefined,
    blocked_paths:
      ag && Array.isArray(ag.blocked_paths) ? ag.blocked_paths : undefined,
  };
  fs.writeFileSync(p, JSON.stringify(root, null, 2), "utf-8");
}

function changesFromAppliedRecords(applied) {
  if (!Array.isArray(applied)) return [];
  return applied.map((item) => ({
    operation: "patch",
    path: item.path,
    search: item.search,
    replace: item.replace,
    reason:
      item.reason != null
        ? String(item.reason)
        : "deterministic_apply_from_executor_changes.json",
  }));
}

/**
 * @param {object} opts
 * @param {string} opts.outputDir
 * @param {boolean} opts.confirm - gate humano explícito
 */
function runDeterministicApply(opts) {
  const {
    outputDir,
    confirm = false,
    forcePolicyBypass = false,
    policyProfileCli = null,
    disableGovernance = false,
  } = opts;

  if (!confirm && process.env.SETUP_BOSS_APPLY_CONFIRM !== "1") {
    throw new Error(
      "Apply físico requer confirmação: passe --confirm ou defina SETUP_BOSS_APPLY_CONFIRM=1.",
    );
  }

  const metaPath = path.join(outputDir, "metadata.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error("metadata.json ausente.");
  }

  const metadata = readJson(metaPath);
  const projectRoot = metadata.projectRoot;
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    throw new Error("projectRoot inválido em metadata.json.");
  }

  const physPath = path.join(outputDir, "physical-apply-result.json");
  if (fs.existsSync(physPath)) {
    try {
      const prev = readJson(physPath);
      if (prev && prev.completed === true) {
        throw new Error(
          "DUPLICATE_APPLY_BLOCKED: apply físico já registado para esta run.",
        );
      }
    } catch (e) {
      if (String(e.message || e).includes("DUPLICATE_APPLY")) throw e;
    }
  }

  const exec = metadata.execution || {};
  if (exec.lifecycle_state === RUNTIME_LIFECYCLE.APPLIED) {
    throw new Error("DUPLICATE_APPLY_BLOCKED: lifecycle_state já é APPLIED.");
  }

  if (exec.mode !== "dry_run" || exec.pending_apply !== true) {
    throw new Error(
      "Apply-later só é válido para runs dry-run com pending_apply=true.",
    );
  }

  const reviewPath = path.join(outputDir, "review-output.json");
  if (!fs.existsSync(reviewPath)) {
    throw new Error("review-output.json ausente.");
  }
  const review = readJson(reviewPath);
  if (review.status !== "approved") {
    throw new Error(
      `Review não aprovada (status=${review.status}). Apply bloqueado.`,
    );
  }

  const manifest = readPatchManifest(outputDir);
  if (!manifest) {
    throw new Error("patch-manifest.json ausente — gere com uma run recente.");
  }

  const integ = validateExecutorChangesIntegrity(outputDir, manifest);
  if (!integ.ok) {
    throw new Error(
      `MANIFEST_STALE: ${integ.errors.join("; ")}`,
    );
  }

  const drift = validateFilesystemAgainstManifest(projectRoot, manifest);
  if (!drift.ok) {
    const msg = drift.errors.join("\n");
    throw new Error(
      `Project drift detected.\nPatch no longer matches filesystem state.\n${msg}`,
    );
  }

  const changesPath = path.join(outputDir, "executor-changes.json");
  const applied = readJson(changesPath);
  if (!Array.isArray(applied) || applied.length === 0) {
    throw new Error("executor-changes.json vazio — nada para aplicar.");
  }

  const runCtxPath = path.join(outputDir, "run-context.json");
  const runContext = readJson(runCtxPath);
  if (!isUsableRunContext(runContext)) {
    throw new Error("run-context.json ausente ou inválido.");
  }

  const allowedFiles = getAllowedFilesFromRunContext(runContext, {
    uniqueNormalized: true,
  });

  const changes = changesFromAppliedRecords(applied);

  const ag = evaluateApplyGovernance({
    projectRootAbs: path.resolve(projectRoot),
    changes,
    forcePolicyBypass: Boolean(forcePolicyBypass),
    policyProfileCli:
      typeof policyProfileCli === "string" && policyProfileCli.trim()
        ? policyProfileCli.trim()
        : null,
    disableGovernance: Boolean(disableGovernance),
  });
  appendPhysicalApplyGov(outputDir, ag);

  if (!ag.ok) {
    throw new Error(
      ag.message ||
        "POLICY_BLOCKED: apply físico bloqueado por política.",
    );
  }

  validatePatchSet(projectRoot, allowedFiles, changes);

  const mergeExecutionIntoMetadata = (patch) => {
    const m = readJson(metaPath);
    m.execution = { ...(m.execution || {}), ...patch };
    fs.writeFileSync(metaPath, JSON.stringify(m, null, 2), "utf-8");
  };

  mergeExecutionIntoMetadata({
    lifecycle_state: RUNTIME_LIFECYCLE.APPLYING,
    deterministic_apply_started_at: new Date().toISOString(),
  });

  try {
    applyChanges(projectRoot, allowedFiles, changes, {
      dryRun: false,
      overlay: null,
    });
  } catch (e) {
    mergeExecutionIntoMetadata({
      lifecycle_state: RUNTIME_LIFECYCLE.FAILED,
      last_apply_error: String(e.message || e),
    });
    throw e;
  }

  const finishedMeta = readJson(metaPath);
  finishedMeta.execution = {
    ...(finishedMeta.execution || {}),
    mode: "apply",
    applied_to_project: true,
    pending_apply: false,
    lifecycle_state: RUNTIME_LIFECYCLE.APPLIED,
    deterministic_apply_completed_at: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(finishedMeta, null, 2), "utf-8");

  fs.writeFileSync(
    physPath,
    JSON.stringify(
      {
        completed: true,
        applied_at: new Date().toISOString(),
        mode: "deterministic_executor_changes",
        patch_manifest: "patch-manifest.json",
      },
      null,
      2,
    ),
    "utf-8",
  );

  return {
    ok: true,
    files_touched: [...new Set(changes.map((c) => c.path))].length,
    governance_profile: ag.profile_resolved ?? null,
  };
}

module.exports = {
  runDeterministicApply,
  changesFromAppliedRecords,
};
