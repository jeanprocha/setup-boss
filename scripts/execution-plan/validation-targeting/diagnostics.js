/**
 * Diagnósticos aggregados para CLI / inspect-plan (Fase 4.1.2).
 */

const fs = require("fs");
const path = require("path");
const { loadExecutionReconciliation } = require("../reconciliation/reconciliation-engine");
const {
  loadValidationTargets,
  loadValidationManifest,
} = require("./validation-manifest");
const { loadValidationPropagationManifest } = require("./semantic-validation-propagation");
const { DEPENDENCY_GRAPH_FILENAME } = require("./constants");

/**
 * @param {string} outputDir
 * @param {{ targetsSampleLimit?: number }} opts
 */
function collectValidationTargetingDiagnostics(outputDir, opts = {}) {
  const dir = String(outputDir || "");
  const limit = opts.targetsSampleLimit != null ? Number(opts.targetsSampleLimit) : 16;

  const targetsDoc = loadValidationTargets(dir);
  const manifest = loadValidationManifest(dir);
  const propagationManifest = loadValidationPropagationManifest(dir);
  const recon = loadExecutionReconciliation(dir);

  const reconciliation_impact = recon
    ? {
        status: recon.status != null ? String(recon.status) : null,
        coverage: recon.coverage && typeof recon.coverage === "object" ? recon.coverage : null,
        unexpected_changes_count: Array.isArray(recon.unexpected_changes)
          ? recon.unexpected_changes.length
          : 0,
        unmatched_operations_count: Array.isArray(recon.unmatched_operations)
          ? recon.unmatched_operations.length
          : 0,
      }
    : null;

  const targets = targetsDoc && Array.isArray(targetsDoc.targets) ? targetsDoc.targets : [];

  const dependency_graph_present = Boolean(dir && fs.existsSync(path.join(dir, DEPENDENCY_GRAPH_FILENAME)));
  let targets_with_impact_expansion = 0;
  for (const t of targets) {
    if (t && t.impact_expansion && typeof t.impact_expansion === "object") {
      targets_with_impact_expansion += 1;
    }
  }
  const dependency_graph_extension =
    targetsDoc &&
    targetsDoc.extensions &&
    typeof targetsDoc.extensions === "object" &&
    targetsDoc.extensions.dependency_graph &&
    typeof targetsDoc.extensions.dependency_graph === "object"
      ? targetsDoc.extensions.dependency_graph
      : null;

  const scopes_histogram = { file: 0, module: 0, project: 0 };
  const validators_union = new Set();
  let hints_total = 0;

  for (const t of targets) {
    const s = t && t.validation_scope;
    if (s === "file") scopes_histogram.file += 1;
    else if (s === "module") scopes_histogram.module += 1;
    else if (s === "project") scopes_histogram.project += 1;
    if (Array.isArray(t.inferred_validators)) {
      for (const v of t.inferred_validators) validators_union.add(String(v));
    }
    if (Array.isArray(t.dependency_hints)) hints_total += t.dependency_hints.length;
  }

  return {
    validation_targets_present: Boolean(targetsDoc),
    validation_manifest_present: Boolean(manifest),
    validation_propagation_manifest_present: Boolean(propagationManifest),
    validation_propagation_summary:
      propagationManifest && propagationManifest.propagation_stats
        ? propagationManifest.propagation_stats
        : null,
    summary: targetsDoc && targetsDoc.summary ? targetsDoc.summary : null,
    manifest_refs: manifest && manifest.refs ? manifest.refs : null,
    generation_phase: manifest && manifest.generation_phase != null ? manifest.generation_phase : null,
    scopes_histogram,
    inferred_validators_union: [...validators_union].sort((a, b) => a.localeCompare(b)),
    dependency_hints_total: hints_total,
    dependency_graph_present,
    targets_with_impact_expansion,
    dependency_graph_extension,
    reconciliation_impact,
    targets_sample: targets.slice(0, Math.max(0, limit)),
    manifest_telemetry_events:
      manifest && Array.isArray(manifest.telemetry_events)
        ? manifest.telemetry_events.slice(0, 32)
        : [],
    extensions: {},
  };
}

module.exports = {
  collectValidationTargetingDiagnostics,
};
