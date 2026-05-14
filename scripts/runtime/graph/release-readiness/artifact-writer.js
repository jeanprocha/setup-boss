"use strict";

const fs = require("fs");
const path = require("path");
const { RELEASE_READINESS_ARTIFACT_FILENAME } = require("./constants");

/**
 * @param {string} outputDir
 * @param {object} doc
 */
function writeExecutionGraphReleaseReadinessArtifact(outputDir, doc) {
  if (!doc || typeof doc !== "object") throw new Error("release readiness doc inválido");
  const required = [
    "schema_version",
    "run_id",
    "graph_id",
    "graph_fingerprint",
    "release_status",
    "readiness_summary",
    "validated_components",
    "artifact_audit",
    "feature_flag_audit",
    "integration_audit",
    "consistency_audit",
    "compatibility_audit",
    "diagnostics",
    "warnings",
    "blockers",
    "created_at",
  ];
  for (const k of required) {
    if (!(k in doc)) throw new Error(`release readiness: campo obrigatório ausente: ${k}`);
  }
  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, RELEASE_READINESS_ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

module.exports = {
  writeExecutionGraphReleaseReadinessArtifact,
};
