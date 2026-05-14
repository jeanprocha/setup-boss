"use strict";

const fs = require("fs");
const path = require("path");

const { computeExecutionGraphFingerprint } = require("../fingerprint");
const {
  NODE_ADAPTERS_SCHEMA_VERSION,
  NODE_ADAPTERS_ARTIFACT_FILENAME,
} = require("./constants");
const { buildRegisteredAdapterRegistry } = require("./adapter-registry");
const {
  buildAdvisoryExecutionMatrix,
  buildRuntimeRecoveryMatrix,
  buildSchedulerCompatibilityMatrix,
} = require("./advisory-bridge");

/**
 * @param {ReturnType<import('../graph-builder')['buildCanonicalExecutionGraph']>} structuralGraph
 * @param {{
 *   run_id: string,
 *   pipeline_status?: string|null,
 *   correction_iterations?: number|null,
 *   source?: string,
 * }} annotation
 */
function buildNodeAdaptersArtifact(structuralGraph, annotation = {}) {
  const graph_fingerprint = computeExecutionGraphFingerprint(structuralGraph);
  const graph_id = `graph_${graph_fingerprint.slice(0, 32)}`;

  const { adapters, validation } = buildRegisteredAdapterRegistry(structuralGraph);

  const registered_adapters = adapters.map((a) => a.serialize());

  /** @type {Record<string, object>} */
  const adapter_capabilities = {};
  /** @type {Record<string, object>} */
  const runtime_contracts = {};
  /** @type {Record<string, object>} */
  const replay_support_matrix = {};
  /** @type {Record<string, object>} */
  const shadow_support_matrix = {};

  for (const a of adapters) {
    const d = a.descriptor;
    adapter_capabilities[d.node_id] = { ...d.capabilities };
    runtime_contracts[d.node_id] = a.serializeContractSummary();
    replay_support_matrix[d.node_id] = {
      supports_replay: d.supports_replay,
      replay_safe: d.capabilities.replay_safe,
      replay_sensitivity: d.replay_sensitivity,
      deterministic_boundaries: d.deterministic_boundaries,
    };
    shadow_support_matrix[d.node_id] = {
      supports_shadow: d.supports_shadow,
      execution_kind: d.execution_kind,
    };
  }

  const advisory_execution_matrix = buildAdvisoryExecutionMatrix(adapters);
  const runtime_recovery_matrix = buildRuntimeRecoveryMatrix(adapters);
  const scheduler_compatibility_matrix = buildSchedulerCompatibilityMatrix(adapters);

  return {
    schema_version: NODE_ADAPTERS_SCHEMA_VERSION,
    graph_id,
    graph_fingerprint,
    run_id: annotation.run_id,
    compat: { phase: "4.12.5", source: annotation.source || "run-runtime" },
    registered_adapters,
    adapter_capabilities,
    runtime_contracts,
    replay_support_matrix,
    shadow_support_matrix,
    advisory_execution_matrix,
    runtime_recovery_matrix,
    scheduler_compatibility_matrix,
    diagnostics: {
      validation_ok: validation.ok,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings,
      codes: validation.codes,
      adapter_count: adapters.length,
      graph_node_count: structuralGraph.nodes.length,
    },
    created_at: new Date().toISOString(),
  };
}

/**
 * @param {string} outputDir
 * @param {object} doc
 */
function writeNodeAdaptersArtifact(outputDir, doc) {
  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, NODE_ADAPTERS_ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

module.exports = {
  buildNodeAdaptersArtifact,
  writeNodeAdaptersArtifact,
};
