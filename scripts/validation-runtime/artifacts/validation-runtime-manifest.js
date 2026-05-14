/**
 * Manifesto runtime — integração com plan-artifacts.json (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const { VALIDATION_RUNTIME_MANIFEST_FILENAME } = require("../constants");

/**
 * @param {{
 *   outputDir: string,
 *   results: object,
 *   graph: object,
 *   run_id: string,
 *   validation_mode: string,
 * }} parts
 */
function buildValidationRuntimeManifest(parts) {
  const dir = String(parts.outputDir || "");
  const results = parts.results && typeof parts.results === "object" ? parts.results : {};
  const graph = parts.graph && typeof parts.graph === "object" ? parts.graph : {};

  return {
    schema_version: 1,
    validation_run_id: results.validation_run_id != null ? String(results.validation_run_id) : "",
    plan_id: results.plan_id != null ? String(results.plan_id) : "",
    run_id: parts.run_id != null ? String(parts.run_id) : "",
    validation_mode: String(parts.validation_mode || results.validation_mode || "off"),
    policy_profile: results.policy_profile != null ? String(results.policy_profile) : "",
    generated_at: new Date().toISOString(),
    replay: {
      graph_fingerprint_sha256:
        graph.graph_fingerprint_sha256 != null ? String(graph.graph_fingerprint_sha256) : null,
      validation_run_id: results.validation_run_id != null ? String(results.validation_run_id) : "",
    },
    refs: {
      validation_results: "validation-results.json",
      validation_targets: "validation-targets.json",
      validation_manifest: "validation-manifest.json",
      execution_plan: "execution-plan.json",
    },
    execution: {
      stages: Array.isArray(results.stages) ? results.stages : [],
      summary: results.summary || null,
      validators_total: results.summary && results.summary.total_validators,
      cache_directory: "validation-runtime-cache/",
    },
    telemetry_embedded:
      Array.isArray(results.telemetry) && results.telemetry.length <= 200
        ? results.telemetry
        : [{ kind: "truncated", note: "telemetry demasiado grande; ver validation-results.json" }],
    extensions: {},
  };
}

function validationRuntimeManifestPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_RUNTIME_MANIFEST_FILENAME);
}

function saveValidationRuntimeManifest(outputDir, manifest) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    validationRuntimeManifestPath(dir),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

module.exports = {
  buildValidationRuntimeManifest,
  saveValidationRuntimeManifest,
  validationRuntimeManifestPath,
};
