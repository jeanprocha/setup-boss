/**
 * Deteção de drift do projeto vs manifest (antes de apply determinístico).
 */

const fs = require("fs");
const path = require("path");
const {
  normalizeRelativePath,
  assertSafeProjectPath,
} = require("../../shared-utils");
const { sha256Utf8 } = require("./patch-manifest");

/**
 * @returns {{ ok: boolean, errors: string[], files: object }}
 */
function validateFilesystemAgainstManifest(projectRoot, manifest) {
  const errors = [];
  const filesOut = {};

  if (!manifest || typeof manifest !== "object" || !manifest.files) {
    errors.push("Manifest inválido ou sem secção files.");
    return { ok: false, errors, files: filesOut };
  }

  const root = path.resolve(projectRoot);

  for (const [relRaw, entry] of Object.entries(manifest.files)) {
    const rel = normalizeRelativePath(relRaw);
    let safe;

    try {
      safe = assertSafeProjectPath(root, rel);
    } catch (e) {
      errors.push(`${rel}: caminho inválido — ${e.message || e}`);
      continue;
    }

    if (!fs.existsSync(safe.absolutePath)) {
      errors.push(`${rel}: ficheiro ausente (esperado para aplicar patch).`);
      filesOut[rel] = { drift: true, reason: "missing" };
      continue;
    }

    const raw = fs.readFileSync(safe.absolutePath, "utf-8");
    const sha = sha256Utf8(raw);
    const expected = entry && entry.pre_apply_sha256;

    if (expected && sha !== expected) {
      errors.push(
        `${rel}: drift — hash atual ≠ pre_apply_sha256 do manifest (projeto alterado desde dry-run).`,
      );
      filesOut[rel] = {
        drift: true,
        reason: "hash_mismatch",
        current_sha256: sha,
        expected_sha256: expected,
      };
    } else {
      filesOut[rel] = { drift: false, current_sha256: sha };
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    files: filesOut,
  };
}

/**
 * Verifica se executor-changes.json ainda corresponde ao manifest.
 */
function validateExecutorChangesIntegrity(outputDir, manifest) {
  const errors = [];
  const changesPath = path.join(outputDir, "executor-changes.json");

  if (!manifest || !manifest.artifacts) {
    errors.push("Manifest sem artifacts.");
    return { ok: false, errors };
  }

  const expected = manifest.artifacts.executor_changes_sha256;
  if (!expected) {
    errors.push("Manifest sem executor_changes_sha256.");
    return { ok: false, errors };
  }

  if (!fs.existsSync(changesPath)) {
    errors.push("executor-changes.json ausente.");
    return { ok: false, errors };
  }

  const crypto = require("crypto");
  const buf = fs.readFileSync(changesPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");

  if (sha !== expected) {
    errors.push(
      "executor-changes.json foi alterado desde a geração do manifest (manifest stale ou corrupção).",
    );
    return { ok: false, errors };
  }

  return { ok: true, errors };
}

module.exports = {
  validateFilesystemAgainstManifest,
  validateExecutorChangesIntegrity,
};
