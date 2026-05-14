/**
 * Artefactos de diagnóstico para inspect-correction.
 */

const fs = require("fs");
const path = require("path");
const {
  CORRECTION_ANALYSIS_FILENAME,
  CORRECTION_MEMORY_FILENAME,
  CORRECTION_LINEAGE_FILENAME,
  CORRECTION_RUNTIME_MANIFEST_FILENAME,
} = require("../constants");
const { getCorrectionEngineMode } = require("../feature-flags");

function readJson(dir, fname) {
  try {
    const p = path.join(dir, fname);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function collectCorrectionDiagnostics(outputDir) {
  const dir = String(outputDir || "");
  const analysis = readJson(dir, CORRECTION_ANALYSIS_FILENAME);
  const manifest = readJson(dir, CORRECTION_RUNTIME_MANIFEST_FILENAME);
  const memory = readJson(dir, CORRECTION_MEMORY_FILENAME);
  const lineage = readJson(dir, CORRECTION_LINEAGE_FILENAME);

  return {
    correction_engine_env: getCorrectionEngineMode(),
    artifacts: {
      correction_analysis_present: Boolean(analysis && typeof analysis === "object"),
      correction_memory_present: Boolean(memory && typeof memory === "object"),
      correction_lineage_present: Boolean(lineage && typeof lineage === "object"),
      correction_runtime_manifest_present: Boolean(manifest && typeof manifest === "object"),
    },
    correction_analysis_summary: analysis && analysis.summary ? analysis.summary : null,
    classification_preview:
      analysis && Array.isArray(analysis.classification_buckets_summarized)
        ? analysis.classification_buckets_summarized
        : null,
    failure_signature_sha256: analysis && analysis.failure_signature_sha256 ? analysis.failure_signature_sha256 : null,
    lineage_chain_length: lineage && Array.isArray(lineage.chain) ? lineage.chain.length : 0,
    memory_streak_hint:
      memory && memory.identical_trigger_streak != null ? memory.identical_trigger_streak : null,
    last_failure_signature_sha256:
      memory && memory.last_failure_signature_sha256 ? memory.last_failure_signature_sha256 : null,
    correction_analysis: analysis,
    correction_memory_trim: memory
      ? {
          schema_version: memory.schema_version,
          identical_trigger_streak: memory.identical_trigger_streak,
          last_failure_signature_sha256: memory.last_failure_signature_sha256,
          retries_recent: Array.isArray(memory.retries)
            ? memory.retries.slice(-8)
            : [],
        }
      : null,
    lineage_last:
      lineage && Array.isArray(lineage.chain) && lineage.chain.length
        ? lineage.chain[lineage.chain.length - 1]
        : null,
  };
}

module.exports = {
  collectCorrectionDiagnostics,
};
