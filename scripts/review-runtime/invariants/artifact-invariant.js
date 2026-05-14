const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { finding } = require("./invariant-types");

function sha256FileNullable(p) {
  try {
    if (!p || !fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch (_) {
    return null;
  }
}

function evaluateArtifactInvariant(snapshot) {
  const out = [];
  const dir = snapshot.output_dir;
  const plan = snapshot.plan;
  const pm = snapshot.patch_manifest;

  if (plan && plan.fingerprints && typeof plan.fingerprints === "object") {
    const declared = plan.fingerprints.plan_content_sha256
      ? String(plan.fingerprints.plan_content_sha256)
      : null;
    if (declared) {
      const fp = path.join(dir, "execution-plan.json");
      const disk = sha256FileNullable(fp);
      if (disk && disk !== declared) {
        out.push(
          finding(
            "artifact_invariant.plan_fingerprint_mismatch",
            "artifact",
            "high",
            "fail",
            { expected: declared, actual_file_hash: disk },
            ["Regenerar fingerprints do plano ou restaurar execution-plan.json coerente."],
          ),
        );
      }
    }
  }

  if (pm && pm.executor_changes_sha256 && dir) {
    const chPath = path.join(dir, "executor-changes.json");
    const disk = sha256FileNullable(chPath);
    const expected = String(pm.executor_changes_sha256);
    if (disk && disk !== expected) {
      out.push(
        finding(
          "artifact_invariant.patch_manifest_changes_mismatch",
          "artifact",
          "high",
          "fail",
          { expected, actual: disk },
          ["Regenerar patch-manifest.json a partir do executor-changes actual."],
        ),
      );
    }
  }

  const art = snapshot.plan_artifacts;
  if (art && art.artifacts && typeof art.artifacts === "object") {
    if (art.artifacts.execution_plan && !fs.existsSync(path.join(dir, String(art.artifacts.execution_plan)))) {
      out.push(
        finding(
          "artifact_invariant.manifest_points_missing_plan",
          "artifact",
          "medium",
          "warn",
          { ref: art.artifacts.execution_plan },
          ["Actualizar plan-artifacts.json ou restaurar o ficheiro referenciado."],
        ),
      );
    }
  }

  return out;
}

module.exports = { evaluateArtifactInvariant };
