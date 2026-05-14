/**
 * Agregação para `inspect-risk-analysis` e cruzamento com outros inspects (Fase 4.3).
 */

const fs = require("fs");
const path = require("path");
const {
  RISK_ANALYSIS_FILENAME,
  RISK_RUNTIME_MANIFEST_FILENAME,
} = require("../constants");

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 */
function collectRiskDiagnostics(outputDir) {
  const dir = String(outputDir || "");
  const analysisPath = path.join(dir, RISK_ANALYSIS_FILENAME);
  const manifestPath = path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME);

  const analysis = readJsonSafe(analysisPath);
  const manifest = readJsonSafe(manifestPath);

  const runLog = readJsonSafe(path.join(dir, "run-log.json"));
  const recon = readJsonSafe(path.join(dir, "execution-reconciliation.json"));
  const valResults = readJsonSafe(path.join(dir, "validation-results.json"));

  return {
    risk_analysis_present: Boolean(analysis),
    risk_runtime_manifest_present: Boolean(manifest),
    summary: analysis && analysis.summary ? analysis.summary : null,
    risk_score: analysis && analysis.summary ? analysis.summary.risk_score : null,
    risk_tier: analysis && analysis.summary ? analysis.summary.risk_tier : null,
    factors: analysis && Array.isArray(analysis.factors) ? analysis.factors : [],
    recommendations: analysis && Array.isArray(analysis.recommendations) ? analysis.recommendations : [],
    validation_escalation: analysis && analysis.validation_escalation ? analysis.validation_escalation : null,
    review_hints: analysis && analysis.review_hints ? analysis.review_hints : null,
    propagation: manifest && manifest.propagation ? manifest.propagation : analysis && analysis.propagation_summary
      ? analysis.propagation_summary
      : null,
    propagation_graph: manifest && manifest.propagation ? manifest.propagation.layers : null,
    semantic_propagation_snapshot:
      manifest &&
      manifest.semantic_propagation &&
      typeof manifest.semantic_propagation === "object"
        ? {
            propagation_mode: manifest.semantic_propagation.propagation_mode ?? null,
            semantic_risk_classification:
              manifest.semantic_propagation.semantic_risk_classification ?? null,
            propagation_fingerprint_sha256:
              manifest.semantic_propagation.propagation_fingerprint_sha256 ?? null,
            semantic_risk_metrics_fingerprint_sha256:
              manifest.semantic_propagation.semantic_risk_metrics_fingerprint_sha256 ?? null,
          }
        : null,
    runtime_instability_hint: {
      correction_iterations: runLog && typeof runLog.correction_iterations === "number"
        ? runLog.correction_iterations
        : null,
      run_log_errors: runLog && Array.isArray(runLog.errors) ? runLog.errors.length : null,
    },
    cross_artifacts: {
      reconciliation_status: recon && recon.status != null ? recon.status : null,
      validation_summary_status: valResults && valResults.summary && valResults.summary.status != null
        ? valResults.summary.status
        : null,
    },
  };
}

module.exports = {
  collectRiskDiagnostics,
};
