/**
 * Agregação para CLI inspect-validation-runtime (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const {
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_RUNTIME_MANIFEST_FILENAME,
  VALIDATION_RUNTIME_CACHE_DIRNAME,
} = require("../constants");

const MAX_VALIDATION_RESULTS_JSON_BYTES = 512 * 1024;

function readBoundedJson(p, maxBytes) {
  try {
    if (!p || !fs.existsSync(p)) return { doc: null, too_large: false };
    const st = fs.statSync(p);
    if (st.size > maxBytes) return { doc: null, too_large: true };
    return { doc: JSON.parse(fs.readFileSync(p, "utf8")), too_large: false };
  } catch (_) {
    return { doc: null, too_large: false };
  }
}

/**
 * @param {string} outputDir
 */
function collectValidationRuntimeDiagnostics(outputDir) {
  const dir = String(outputDir || "");
  const resultsPath = path.join(dir, VALIDATION_RESULTS_FILENAME);
  const manifestPath = path.join(dir, VALIDATION_RUNTIME_MANIFEST_FILENAME);
  const cacheDir = path.join(dir, VALIDATION_RUNTIME_CACHE_DIRNAME);

  const { doc: results, too_large: results_too_large } = readBoundedJson(
    resultsPath,
    MAX_VALIDATION_RESULTS_JSON_BYTES,
  );
  const manifest = (function readManifestSafe() {
    try {
      if (!fs.existsSync(manifestPath)) return null;
      return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_) {
      return null;
    }
  })();

  let cache_files = 0;
  try {
    if (fs.existsSync(cacheDir) && fs.statSync(cacheDir).isDirectory()) {
      cache_files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json")).length;
    }
  } catch (_) {
    cache_files = 0;
  }

  const validators = Array.isArray(results && results.validators) ? results.validators : [];
  const cacheHits = validators.filter((v) => v && v.cache_hit).length;

  const failures = validators.filter(
    (v) => v && (v.status === "failed" || v.status === "error"),
  );

  return {
    validation_results_present: Boolean(fs.existsSync(resultsPath)),
    validation_results_truncated: Boolean(results_too_large),
    validation_runtime_manifest_present: Boolean(manifest),
    summary: results && results.summary ? results.summary : null,
    validation_run_id: results && results.validation_run_id != null ? results.validation_run_id : null,
    graph_fingerprint_sha256:
      results &&
      results.metadata &&
      results.metadata.graph_fingerprint_sha256 != null
        ? results.metadata.graph_fingerprint_sha256
        : null,
    stages: Array.isArray(results && results.stages) ? results.stages : [],
    validators_sample: validators.slice(0, 24),
    validators_total: validators.length,
    cache_hits: cacheHits,
    cache_entries_estimate: cache_files,
    failures_short: failures.slice(0, 12).map((v) => ({
      validator_id: v.validator_id,
      validator_type: v.validator_type,
      status: v.status,
      errors: (v.errors || []).slice(0, 3),
    })),
    replay: manifest && manifest.replay ? manifest.replay : null,
  };
}

module.exports = {
  collectValidationRuntimeDiagnostics,
};
