"use strict";

const {
  RUNTIME_ARTIFACT_SCHEMA_VERSION,
  ALL_RUNTIME_STATUSES,
} = require("./constants");

/**
 * Validação estrutural do documento runtime (sem alinhamento ao grafo canónico).
 * @param {object} doc
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateExecutionGraphRuntimeDocShape(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { ok: false, errors: ["documento inválido"] };
  }
  if (doc.schema_version !== RUNTIME_ARTIFACT_SCHEMA_VERSION) {
    errors.push(`schema_version esperado ${RUNTIME_ARTIFACT_SCHEMA_VERSION}`);
  }
  if (typeof doc.graph_id !== "string" || !doc.graph_id) errors.push("graph_id obrigatório");
  if (typeof doc.graph_fingerprint !== "string" || !doc.graph_fingerprint) {
    errors.push("graph_fingerprint obrigatório");
  }
  if (typeof doc.run_id !== "string" || !doc.run_id) errors.push("run_id obrigatório");
  if (typeof doc.created_at !== "string") errors.push("created_at obrigatório");
  if (typeof doc.updated_at !== "string") errors.push("updated_at obrigatório");
  if (typeof doc.runtime_state_version !== "number" || doc.runtime_state_version < 1) {
    errors.push("runtime_state_version inválido");
  }
  if (!Array.isArray(doc.nodes_runtime_state)) errors.push("nodes_runtime_state deve ser array");
  if (!Array.isArray(doc.transitions)) errors.push("transitions deve ser array");
  if (!doc.lifecycle_summary || typeof doc.lifecycle_summary !== "object") {
    errors.push("lifecycle_summary obrigatório");
  }
  if (!doc.replay_metadata || typeof doc.replay_metadata !== "object") {
    errors.push("replay_metadata obrigatório");
  }
  if (!doc.metadata || typeof doc.metadata !== "object") errors.push("metadata obrigatório");
  if (!doc.attempts || typeof doc.attempts !== "object") errors.push("attempts obrigatório");

  const seen = new Set();
  for (const n of doc.nodes_runtime_state || []) {
    if (!n || typeof n.node_id !== "string") {
      errors.push("node runtime sem node_id");
      continue;
    }
    if (seen.has(n.node_id)) errors.push(`node_id duplicado em runtime: ${n.node_id}`);
    seen.add(n.node_id);
    if (!ALL_RUNTIME_STATUSES.has(n.current_status)) {
      errors.push(`current_status inválido em ${n.node_id}: ${n.current_status}`);
    }
    if (typeof n.attempts !== "number" || n.attempts < 0) {
      errors.push(`attempts inválido em ${n.node_id}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateExecutionGraphRuntimeDocShape,
};
