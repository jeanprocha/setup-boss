"use strict";

const { NODE_ID } = require("../constants");
const { createScanAdapter } = require("./adapters/scan");
const { createArchitectAdapter } = require("./adapters/architect");
const { createExecutionPlanAdapter } = require("./adapters/execution-plan");
const { createExecutorAdapter } = require("./adapters/executor");
const { createValidationPlanAdapter } = require("./adapters/validation-plan");
const { createValidatorExecutorAdapter } = require("./adapters/validator-executor");
const { createReviewAdapter } = require("./adapters/review");
const { createCorrectionAdapter } = require("./adapters/correction");
const { createKnowledgeAdapter } = require("./adapters/knowledge");
const { runFullRegistryValidation } = require("./validators");

/**
 * Ordem determinística dos factories (alinhada à ordem canónica NODE_KINDS).
 * @returns {import('./adapter-base').RuntimeNodeAdapter[]}
 */
function createAllAdaptersInOrder() {
  const factories = [
    createScanAdapter,
    createArchitectAdapter,
    createExecutionPlanAdapter,
    createExecutorAdapter,
    createValidationPlanAdapter,
    createValidatorExecutorAdapter,
    createReviewAdapter,
    createCorrectionAdapter,
    createKnowledgeAdapter,
  ];
  const adapters = factories.map((f) => f());
  return adapters.sort((a, b) => a.node_id.localeCompare(b.node_id));
}

/**
 * Mapa estável node_id → adapter.
 * @returns {Map<string, import('./adapter-base').RuntimeNodeAdapter>}
 */
function buildAdapterLookupMap(adapters) {
  /** @type {Map<string, import('./adapter-base').RuntimeNodeAdapter>} */
  const m = new Map();
  for (const a of [...adapters].sort((x, y) => x.node_id.localeCompare(y.node_id))) {
    m.set(a.node_id, a);
  }
  return m;
}

/**
 * @param {ReturnType<import('../graph-builder')['buildCanonicalExecutionGraph']>} graph
 * @returns {{ adapters: import('./adapter-base').RuntimeNodeAdapter[], lookup: Map<string, any>, validation: ReturnType<typeof runFullRegistryValidation> }}
 */
function buildRegisteredAdapterRegistry(graph) {
  const adapters = createAllAdaptersInOrder();
  const validation = runFullRegistryValidation(graph, adapters);
  const lookup = buildAdapterLookupMap(adapters);
  return { adapters, lookup, validation };
}

/** Export explícito dos NODE_ID esperados (testes / diagnóstico). */
const EXPECTED_NODE_IDS = Object.values(NODE_ID).sort();

module.exports = {
  createAllAdaptersInOrder,
  buildAdapterLookupMap,
  buildRegisteredAdapterRegistry,
  EXPECTED_NODE_IDS,
};
