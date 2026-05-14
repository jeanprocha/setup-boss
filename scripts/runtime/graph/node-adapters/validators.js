"use strict";

const { validateDescriptorCapabilityAlignment } = require("./capability-model");

/**
 * @typedef {import('./adapter-base').RuntimeNodeAdapter} RuntimeNodeAdapter
 * @typedef {{ nodes: { node_id: string }[] }} StructuralGraph
 */

/**
 * @param {RuntimeNodeAdapter[]} adapters
 * @returns {{ ok: boolean, errors: string[], codes: string[] }}
 */
function validateNoDuplicateAdapters(adapters) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {string[]} */
  const errors = [];
  for (const a of adapters) {
    const n = seen.get(a.node_id) || 0;
    seen.set(a.node_id, n + 1);
  }
  for (const [id, count] of [...seen.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (count > 1) {
      errors.push(`duplicate adapter for node_id=${id} (count=${count})`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    codes: errors.length ? ["duplicate_adapter"] : [],
  };
}

/**
 * Cobertura DAG: cada nó estrutural tem exatamente um adapter.
 * @param {StructuralGraph} graph
 * @param {RuntimeNodeAdapter[]} adapters
 */
function validateGraphCoverage(graph, adapters) {
  const graphIds = new Set((graph.nodes || []).map((n) => n.node_id).sort());
  const adapterIds = new Set(adapters.map((a) => a.node_id));
  /** @type {string[]} */
  const errors = [];
  for (const id of graphIds) {
    if (!adapterIds.has(id)) errors.push(`missing adapter for graph node_id=${id}`);
  }
  for (const id of adapterIds) {
    if (!graphIds.has(id)) errors.push(`unknown adapter binding (not in graph): node_id=${id}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    codes: errors.length ? ["graph_registry_mismatch"] : [],
  };
}

/**
 * @param {RuntimeNodeAdapter[]} adapters
 */
function validateAllHaveContracts(adapters) {
  /** @type {string[]} */
  const errors = [];
  for (const a of adapters) {
    const c = a.getContract();
    if (!c || typeof c.resolveInputs !== "function") {
      errors.push(`missing runtime contract for ${a.node_id}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    codes: errors.length ? ["missing_runtime_contract"] : [],
  };
}

/**
 * @param {RuntimeNodeAdapter[]} adapters
 */
function validateCapabilitiesAndReplay(adapters) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  for (const a of adapters) {
    const d = a.descriptor;
    const capOk = validateDescriptorCapabilityAlignment(d, d.capabilities);
    if (!capOk.ok) errors.push(`${d.node_id}: ${capOk.detail}`);
    if (d.supports_replay && d.replay_sensitivity === "high" && !d.capabilities.replay_safe) {
      warnings.push(`${d.node_id}: replay contract warning — supports_replay with high sensitivity but replay_safe false`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, codes: errors.length ? ["capability_inconsistency"] : [] };
}

/**
 * Validação agregada (determinística: ordenação de mensagens).
 * @param {StructuralGraph} graph
 * @param {RuntimeNodeAdapter[]} adapters
 */
function runFullRegistryValidation(graph, adapters) {
  const v1 = validateNoDuplicateAdapters(adapters);
  const v2 = validateGraphCoverage(graph, adapters);
  const v3 = validateAllHaveContracts(adapters);
  const v4 = validateCapabilitiesAndReplay(adapters);

  const errors = [...v1.errors, ...v2.errors, ...v3.errors, ...v4.errors].sort();
  const warnings = [...v4.warnings].sort();
  const codes = [...new Set([...v1.codes, ...v2.codes, ...v3.codes, ...v4.codes])].sort();

  return {
    ok: v1.ok && v2.ok && v3.ok && v4.ok,
    errors,
    warnings,
    codes,
    checks: {
      duplicate_adapter: v1,
      graph_coverage: v2,
      runtime_contracts: v3,
      capabilities_replay: v4,
    },
  };
}

module.exports = {
  validateNoDuplicateAdapters,
  validateGraphCoverage,
  validateAllHaveContracts,
  validateCapabilitiesAndReplay,
  runFullRegistryValidation,
};
