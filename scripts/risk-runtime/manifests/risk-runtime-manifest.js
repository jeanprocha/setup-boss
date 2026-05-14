/**
 * Manifesto agregado do risk runtime (Fase 4.3).
 */

const fs = require("fs");
const path = require("path");
const { RISK_RUNTIME_MANIFEST_FILENAME } = require("../constants");

/**
 * @param {{
 *   outputDir: string,
 *   analysis: object,
 *   propagation: object,
 *   semantic_propagation: object,
 *   run_id: string,
 *   telemetry_refs?: object,
 * }} parts
 */
function buildRiskRuntimeManifest(parts) {
  const analysis = parts.analysis && typeof parts.analysis === "object" ? parts.analysis : {};
  const propagation =
    parts.propagation && typeof parts.propagation === "object" ? parts.propagation : {};

  const semantic_propagation =
    parts.semantic_propagation && typeof parts.semantic_propagation === "object"
      ? parts.semantic_propagation
      : null;

  return {
    schema_version: 1,
    risk_analysis_id: analysis.risk_analysis_id != null ? String(analysis.risk_analysis_id) : "",
    plan_id: analysis.plan_id != null ? String(analysis.plan_id) : "",
    run_id: parts.run_id != null ? String(parts.run_id) : "",
    generated_at: new Date().toISOString(),
    scores: {
      risk_score:
        analysis.summary && analysis.summary.risk_score != null
          ? Number(analysis.summary.risk_score)
          : 0,
      risk_tier:
        analysis.summary && analysis.summary.risk_tier != null
          ? String(analysis.summary.risk_tier)
          : "low",
      confidence:
        analysis.summary && analysis.summary.confidence != null
          ? Number(analysis.summary.confidence)
          : 0,
    },
    factors:
      Array.isArray(analysis.factors) && analysis.factors.length <= 200
        ? analysis.factors
        : [{ note: "Ver risk-analysis.json para lista completa" }],
    evidence_refs: {
      risk_analysis: "risk-analysis.json",
      validation_results: "validation-results.json",
      reconciliation: "execution-reconciliation.json",
    },
    escalations: {
      validation: analysis.validation_escalation || null,
      review: analysis.review_escalation || null,
      governance: analysis.governance_hints || null,
    },
    propagation,
    semantic_propagation,
    telemetry_refs: parts.telemetry_refs && typeof parts.telemetry_refs === "object"
      ? parts.telemetry_refs
      : {},
    validation_refs: {
      validation_runtime_manifest: "validation-runtime-manifest.json",
      validation_results: "validation-results.json",
    },
    extensions: {},
  };
}

function riskRuntimeManifestPath(outputDir) {
  return path.join(String(outputDir || ""), RISK_RUNTIME_MANIFEST_FILENAME);
}

function saveRiskRuntimeManifest(outputDir, manifest) {
  const dir = String(outputDir || "");
  if (!dir || !manifest) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    riskRuntimeManifestPath(dir),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );
}

module.exports = {
  buildRiskRuntimeManifest,
  saveRiskRuntimeManifest,
  riskRuntimeManifestPath,
};
