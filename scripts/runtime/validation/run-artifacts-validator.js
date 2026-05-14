/**
 * Validação de integridade de artefactos por run (Fase 2.8).
 */

const fs = require("fs");
const path = require("path");
const { readJsonSafe } = require("../../cli/lib/json-io");
const {
  validateFilesystemAgainstManifest,
  validateExecutorChangesIntegrity,
} = require("../replay/drift-detector");
const { readPatchManifest } = require("../replay/patch-manifest");
const { readCheckpoints } = require("../replay/checkpoint-manager");
const { isValidLifecycleState } = require("../replay/lifecycle");

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} outputDir
 * @param {{ strictProjectRoot?: boolean }} [options]
 * @returns {{ ok: boolean, errors: string[], warnings: string[], infos: string[] }}
 */
function validateRunArtifacts(outputDir, options = {}) {
  const strictProjectRoot = options.strictProjectRoot !== false;
  const errors = [];
  const warnings = [];
  const infos = [];

  const dir = path.resolve(String(outputDir || ""));
  if (!dir || !fileExists(dir)) {
    errors.push(`Pasta de output inexistente: ${outputDir}`);
    return { ok: false, errors, warnings, infos };
  }

  const metaPath = path.join(dir, "metadata.json");
  const meta = readJsonSafe(metaPath, 3_000_000);
  if (!meta || typeof meta !== "object") {
    errors.push("metadata.json ausente ou JSON inválido.");
    return { ok: false, errors, warnings, infos };
  }

  const exec = meta.execution && typeof meta.execution === "object" ? meta.execution : {};
  const life = exec.lifecycle_state;
  if (life != null && life !== "" && life !== "—" && !isValidLifecycleState(String(life))) {
    warnings.push(
      `lifecycle_state desconhecido em metadata: "${life}" (pode ser legado ou corrupção).`,
    );
  }

  const projectRoot = meta.projectRoot ? String(meta.projectRoot) : "";
  if (!projectRoot) {
    warnings.push("metadata.projectRoot vazio.");
  } else if (strictProjectRoot && !fileExists(projectRoot)) {
    warnings.push(`projectRoot não existe no disco: ${projectRoot}`);
  }

  const logPath = path.join(dir, "run-log.json");
  const runLog = readJsonSafe(logPath, 3_000_000);
  if (!runLog || typeof runLog !== "object") {
    warnings.push("run-log.json ausente ou JSON inválido — estado operacional limitado.");
  } else {
    const st = String(runLog.status || "").toLowerCase();
    if (!st) warnings.push("run-log.json sem campo status.");
  }

  const review = readJsonSafe(path.join(dir, "review-output.json"), 512_000);
  const executorResult = readJsonSafe(path.join(dir, "executor-result.json"), 256_000);
  const dryRun = exec.mode === "dry_run";
  const pendingApply = exec.pending_apply === true;

  if (dryRun && pendingApply) {
    if (!review || review.status !== "approved") {
      errors.push(
        "Inconsistência: dry-run com pending_apply exige review-output.json com status=approved.",
      );
    }
    if (!fileExists(path.join(dir, "patch-manifest.json"))) {
      errors.push("patch-manifest.json obrigatório para apply-later (dry-run aprovado).");
    }
    if (!fileExists(path.join(dir, "executor-changes.json"))) {
      errors.push("executor-changes.json obrigatório para apply-later.");
    }
    if (!fileExists(path.join(dir, "run-context.json"))) {
      errors.push("run-context.json obrigatório para apply físico governado.");
    }
  }

  const manifest = readPatchManifest(dir);
  if (manifest) {
    const integ = validateExecutorChangesIntegrity(dir, manifest);
    if (!integ.ok) {
      errors.push(...integ.errors.map((e) => `Manifest/executor-changes: ${e}`));
    }
    if (projectRoot && fileExists(projectRoot)) {
      const drift = validateFilesystemAgainstManifest(projectRoot, manifest);
      if (!drift.ok) {
        warnings.push(
          `Drift projeto vs manifest (${drift.errors.length} problema(s)) — apply-later pode falhar.`,
        );
      }
    } else if (projectRoot && strictProjectRoot) {
      infos.push("Skipped drift check (projectRoot inacessível).");
    }
  } else if (fileExists(path.join(dir, "executor-changes.json"))) {
    infos.push("executor-changes.json presente sem patch-manifest.json (run antiga ou incompleta).");
  }

  const cp = readCheckpoints(dir);
  if (cp != null) {
    if (cp.schema_version !== 1) {
      warnings.push(`runtime-checkpoints.json: schema_version esperado 1, veio ${cp.schema_version}.`);
    }
    if (!Array.isArray(cp.checkpoints)) {
      errors.push("runtime-checkpoints.json: checkpoints deve ser array.");
    }
  }

  const phys = readJsonSafe(path.join(dir, "physical-apply-result.json"), 64_000);
  if (phys && phys.completed === true) {
    if (exec.lifecycle_state && String(exec.lifecycle_state) !== "APPLIED") {
      warnings.push(
        "physical-apply-result.completed=true mas lifecycle_state ≠ APPLIED (metadata pode estar desfasada).",
      );
    }
    if (dryRun && pendingApply) {
      errors.push("Estado impossível: apply físico completo com mode=dry_run e pending_apply=true.");
    }
  }

  const overlayPath = path.join(dir, "virtual-project-overlay.json");
  if (dryRun && fileExists(overlayPath)) {
    const ov = readJsonSafe(overlayPath, 2_000_000);
    if (!ov || typeof ov !== "object") {
      warnings.push("virtual-project-overlay.json presente mas JSON inválido.");
    } else if (ov.schema_version == null) {
      infos.push("virtual-project-overlay.json sem schema_version (compatível com runs antigas).");
    }
  }

  if (executorResult && executorResult.status === "success" && !review) {
    infos.push("executor success sem review-output.json (pipeline incompleto ou interrompido).");
  }

  const policyRep = readJsonSafe(path.join(dir, "policy-report.json"), 1_000_000);
  const govDec = readJsonSafe(path.join(dir, "governance-decisions.json"), 512_000);
  if (policyRep && !govDec) {
    infos.push("policy-report.json sem governance-decisions.json par (run parcial ou legado).");
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, infos };
}

module.exports = {
  validateRunArtifacts,
};
