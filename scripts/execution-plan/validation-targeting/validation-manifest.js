/**
 * validation-manifest.json — metadados de targeting (Fase 4.1.2).
 */

const fs = require("fs");
const path = require("path");
const {
  VALIDATION_TARGETS_FILENAME,
  VALIDATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  DEPENDENCY_GRAPH_FILENAME,
  VALIDATION_TARGETING_SCHEMA_VERSION,
} = require("./constants");
const { RECON_FILE } = require("../reconciliation/reconciliation-engine");

/**
 * @param {object} parts
 */
function buildValidationManifest(parts) {
  const {
    plan,
    targetsDoc,
    phase,
    reconciliation,
    executorChangesCount,
    telemetryEvents,
    generatedAt,
    extra_refs,
    extensions_extra,
  } = parts;

  const planId = plan && plan.plan_id != null ? String(plan.plan_id) : "";
  const runId = plan && plan.run_id != null ? String(plan.run_id) : "";
  const fp =
    plan &&
    plan.fingerprints &&
    typeof plan.fingerprints === "object" &&
    plan.fingerprints.plan_content_sha256 != null
      ? String(plan.fingerprints.plan_content_sha256)
      : null;

  return {
    schema_version: VALIDATION_TARGETING_SCHEMA_VERSION,
    plan_id: planId,
    run_id: runId,
    generated_at: generatedAt || new Date().toISOString(),
    generation_phase: phase || null,
    refs: {
      execution_plan_path: "execution-plan.json",
      plan_fingerprint_sha256: fp,
      reconciliation_path: reconciliation ? RECON_FILE : null,
      reconciliation_status: reconciliation && reconciliation.status != null ? String(reconciliation.status) : null,
      executor_changes_ref: "executor-changes.json",
      executor_changes_count: executorChangesCount != null ? Number(executorChangesCount) : 0,
      validation_targets_ref: VALIDATION_TARGETS_FILENAME,
      dependency_graph_ref: DEPENDENCY_GRAPH_FILENAME,
      ...(extra_refs && typeof extra_refs === "object" ? extra_refs : {}),
    },
    artifacts: {
      validation_targets: VALIDATION_TARGETS_FILENAME,
      validation_propagation_manifest: VALIDATION_PROPAGATION_MANIFEST_FILENAME,
      dependency_graph: DEPENDENCY_GRAPH_FILENAME,
    },
    targeting_summary:
      targetsDoc && targetsDoc.summary && typeof targetsDoc.summary === "object"
        ? targetsDoc.summary
        : null,
    telemetry_events: Array.isArray(telemetryEvents) ? telemetryEvents : [],
    extensions: extensions_extra && typeof extensions_extra === "object" ? { ...extensions_extra } : {},
  };
}

function validationTargetsPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_TARGETS_FILENAME);
}

function validationManifestPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_MANIFEST_FILENAME);
}

function saveValidationTargets(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationTargetsPath(dir), JSON.stringify(doc, null, 2), "utf-8");
}

function loadValidationTargets(outputDir) {
  const p = validationTargetsPath(outputDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function saveValidationManifest(outputDir, manifest) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationManifestPath(dir), JSON.stringify(manifest, null, 2), "utf-8");
}

function loadValidationManifest(outputDir) {
  const p = validationManifestPath(outputDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  VALIDATION_MANIFEST_FILENAME,
  VALIDATION_PROPAGATION_MANIFEST_FILENAME,
  buildValidationManifest,
  saveValidationTargets,
  loadValidationTargets,
  saveValidationManifest,
  loadValidationManifest,
  validationTargetsPath,
  validationManifestPath,
};
