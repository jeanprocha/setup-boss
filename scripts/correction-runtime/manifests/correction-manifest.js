/**
 * Persistência correction-runtime-manifest.json
 */

const {
  SCHEMA_VERSION_MANIFEST,
  CORRECTION_RUNTIME_MANIFEST_FILENAME,
  CORRECTION_ANALYSIS_FILENAME,
  CORRECTION_LINEAGE_FILENAME,
  CORRECTION_MEMORY_FILENAME,
  CORRECTION_RUNTIME_TELEMETRY_LOG,
} = require("../constants");

function buildCorrectionRuntimeManifest({
  correction_analysis_id,
  plan_id,
  run_id,
  failure_signature_sha256,
  telemetry_event_count_estimate,
}) {
  return {
    schema_version: SCHEMA_VERSION_MANIFEST,
    correction_analysis_id: correction_analysis_id || null,
    plan_id: plan_id || "",
    run_id: run_id || "",
    generated_at: new Date().toISOString(),
    failure_signature_sha256: failure_signature_sha256 || null,
    artifacts: {
      correction_analysis_json: CORRECTION_ANALYSIS_FILENAME,
      correction_lineage_json: CORRECTION_LINEAGE_FILENAME,
      correction_memory_json: CORRECTION_MEMORY_FILENAME,
      correction_telemetry_ndjson: CORRECTION_RUNTIME_TELEMETRY_LOG,
    },
    refs: {},
    telemetry: {
      approximate_event_count:
        telemetry_event_count_estimate != null ? Number(telemetry_event_count_estimate) || 0 : 0,
    },
    suppression: [],
    lineage_ref: CORRECTION_LINEAGE_FILENAME,
    remediation_ref: CORRECTION_ANALYSIS_FILENAME,
    replay_safe: true,
    extensions: {},
  };
}

function writeManifestToDisk(fs, pathMod, outputDir, manifest) {
  const p = pathMod.join(outputDir, CORRECTION_RUNTIME_MANIFEST_FILENAME);
  fs.mkdirSync(pathMod.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2), "utf-8");
}

module.exports = {
  buildCorrectionRuntimeManifest,
  writeManifestToDisk,
};
