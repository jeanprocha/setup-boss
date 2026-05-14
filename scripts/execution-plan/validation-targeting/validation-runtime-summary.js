/**
 * Resumo compacto da execução do validation-plan (Fase 4.10.5) — sem streams completos.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { VALIDATION_RUNTIME_SUMMARY_FILENAME } = require("./constants");

const VALIDATION_RUNTIME_SUMMARY_SCHEMA_CONTRACT = "validation-runtime-summary/1";

function validationRuntimeSummaryPath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_RUNTIME_SUMMARY_FILENAME);
}

/**
 * @param {object|null} resultsDoc — documento gravado em validation-results.json
 */
function buildValidationRuntimeSummaryDocument(resultsDoc) {
  if (!resultsDoc || typeof resultsDoc !== "object") return null;

  const results = Array.isArray(resultsDoc.results) ? resultsDoc.results : [];
  let validators_executed = 0;
  let cache_hits_rows = 0;
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    if (String(r.status || "") === "skipped") continue;
    validators_executed += 1;
    if (r.reused_from_cache === true) cache_hits_rows += 1;
  }

  const summary = resultsDoc.summary && typeof resultsDoc.summary === "object" ? resultsDoc.summary : {};
  const fingerprints =
    resultsDoc.fingerprints && typeof resultsDoc.fingerprints === "object"
      ? resultsDoc.fingerprints
      : {};
  const metadata =
    resultsDoc.metadata && typeof resultsDoc.metadata === "object" ? resultsDoc.metadata : {};

  return {
    version: 1,
    schema_contract: VALIDATION_RUNTIME_SUMMARY_SCHEMA_CONTRACT,
    summary: { ...summary },
    fingerprints: {
      validation_results_identity_sha256:
        fingerprints.validation_results_identity_sha256 != null
          ? String(fingerprints.validation_results_identity_sha256)
          : "",
      validation_plan_identity_sha256:
        fingerprints.validation_plan_identity_sha256 != null
          ? String(fingerprints.validation_plan_identity_sha256)
          : "",
    },
    counts: {
      results_rows: results.length,
      validators_executed,
      cache_hits_rows,
    },
    metadata: {
      plan_id: metadata.plan_id != null ? String(metadata.plan_id) : "",
      run_id: metadata.run_id != null ? String(metadata.run_id) : "",
      validation_plan_ref: metadata.validation_plan_ref != null ? String(metadata.validation_plan_ref) : "",
    },
  };
}

function saveValidationRuntimeSummary(outputDir, resultsDoc) {
  const dir = String(outputDir || "");
  if (!dir || !resultsDoc || typeof resultsDoc !== "object") return;
  const doc = buildValidationRuntimeSummaryDocument(resultsDoc);
  if (!doc) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationRuntimeSummaryPath(dir), JSON.stringify(doc, null, 2), "utf8");
}

module.exports = {
  VALIDATION_RUNTIME_SUMMARY_SCHEMA_CONTRACT,
  validationRuntimeSummaryPath,
  buildValidationRuntimeSummaryDocument,
  saveValidationRuntimeSummary,
};
