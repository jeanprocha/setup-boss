/**
 * Chain formal de correction lineage persistida por run-dir.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { SCHEMA_VERSION_LINEAGE, CORRECTION_LINEAGE_FILENAME } = require("../constants");

function nodeId(parts) {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 48);
}

function emptyLineage({ run_id, plan_id }) {
  const base = path.basename(run_id ? String(run_id) : "");
  return {
    schema_version: SCHEMA_VERSION_LINEAGE,
    run_id: String(run_id || base),
    plan_id: plan_id ? String(plan_id) : "",
    updated_at: new Date().toISOString(),
    chain: [],
    escalation_history: [],
  };
}

function resolvePath(outputDir) {
  return path.join(String(outputDir || ""), CORRECTION_LINEAGE_FILENAME);
}

function loadLineage(outputDir) {
  const p = resolvePath(outputDir);
  try {
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!j || typeof j !== "object") return null;
    return j;
  } catch (_) {
    return null;
  }
}

function persistLineage(outputDir, lineage) {
  const p = resolvePath(outputDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const next = {
    ...lineage,
    updated_at: new Date().toISOString(),
    chain: Array.isArray(lineage.chain) ? lineage.chain.slice(-500) : [],
    escalation_history: Array.isArray(lineage.escalation_history)
      ? lineage.escalation_history.slice(-800)
      : [],
  };
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function appendLineageNode(opts) {
  const {
    lineage,
    parent_id,
    iteration,
    signature_sha256,
    classification_primary,
    outcome,
    suppression,
    escalation,
    remediation_targets_count,
    correction_analysis_id,
  } = opts;

  const correction_lineage_node_id = nodeId([
    lineage.run_id,
    iteration || 0,
    signature_sha256 || "",
    outcome || "",
    correction_analysis_id || "",
  ]);

  const node = {
    correction_lineage_node_id,
    parent_id: parent_id || null,
    iteration: iteration != null ? iteration : lineage.chain.length,
    failure_signature_sha256: signature_sha256 || "",
    classification_summary: classification_primary || "",
    remediation_attempt_id:
      remediation_targets_count != null
        ? `${correction_lineage_node_id}_rem_${remediation_targets_count}`
        : `${correction_lineage_node_id}_rem`,
    outcome: outcome || "pending",
    suppression: suppression || null,
    correction_analysis_ref: correction_analysis_id || "",
    escalation: escalation || null,
    recorded_at: new Date().toISOString(),
  };

  const next = {
    ...lineage,
    chain: [...(lineage.chain || []), node],
  };
  if (escalation) {
    next.escalation_history = [...(next.escalation_history || []), escalation];
  }
  return { lineage: next, node };
}

module.exports = {
  appendLineageNode,
  persistLineage,
  loadLineage,
  emptyLineage,
};
