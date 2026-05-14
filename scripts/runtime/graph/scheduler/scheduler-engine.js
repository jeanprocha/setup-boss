"use strict";

const { applyRuntimeTransition, resetGlobalTransitionSeqForTests } = require("../runtime-state/transition-engine");
const { RUNTIME_NODE_STATUS } = require("../runtime-state/constants");
const { computeDeterministicSchedulingOrder } = require("./dependency-resolver");
const { resolveReadyPendingNodeIds } = require("./ready-node-resolver");
const { validateSchedulerInputs } = require("./validators");
const { SCHEDULER_ADVISORY_SOURCE } = require("./constants");

/**
 * Simula uma corrida serial advisory: pending→ready→running→completed por nó.
 * Não invoca handlers do pipeline — apenas `applyRuntimeTransition`.
 *
 * @param {object} structuralGraph
 * @param {object} runtimeDoc — clonado em profundidade; não muta o argumento
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   deterministic_order: string[],
 *   executed_nodes: string[],
 *   ready_events: object[],
 *   blocked_nodes: string[],
 *   skipped_repeat_edges: object[],
 *   transition_count: number,
 *   advisory_doc: object|null,
 *   diagnostics: object,
 * }}
 */
function runSerialAdvisoryScheduler(structuralGraph, runtimeDoc) {
  const validation = validateSchedulerInputs(structuralGraph, runtimeDoc);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      deterministic_order: [],
      executed_nodes: [],
      ready_events: [],
      blocked_nodes: [],
      skipped_repeat_edges: [...(structuralGraph.repeat_edges || [])],
      transition_count: 0,
      advisory_doc: null,
      diagnostics: {
        validation_failed: true,
        scheduler_uses_repeat_edges: false,
        real_pipeline_handlers_invoked: false,
        advisory_only: true,
      },
    };
  }

  const doc = JSON.parse(JSON.stringify(runtimeDoc));
  resetGlobalTransitionSeqForTests(0);

  const deterministic_order = computeDeterministicSchedulingOrder(structuralGraph);
  const orderIndex = new Map(deterministic_order.map((id, i) => [id, i]));

  const executed_nodes = [];
  const ready_events = [];
  const skipped_repeat_edges = [...(structuralGraph.repeat_edges || [])];

  let step = 0;
  while (true) {
    const stillPending = (doc.nodes_runtime_state || []).filter(
      (r) => r.current_status === RUNTIME_NODE_STATUS.PENDING,
    );
    if (stillPending.length === 0) break;

    const ready = resolveReadyPendingNodeIds(structuralGraph, doc, orderIndex);
    if (ready.length === 0) {
      break;
    }

    const pick = ready[0];
    const atBase = Date.UTC(2024, 0, 1, 0, 0, step);
    const mkAt = (k) => new Date(atBase + k).toISOString();

    ready_events.push({
      step,
      ready_node_ids: ready,
      selected_node_id: pick,
    });

    const chain = [
      { to: RUNTIME_NODE_STATUS.READY, at: mkAt(0), meta: { source: SCHEDULER_ADVISORY_SOURCE } },
      { to: RUNTIME_NODE_STATUS.RUNNING, at: mkAt(1), meta: { source: SCHEDULER_ADVISORY_SOURCE } },
      { to: RUNTIME_NODE_STATUS.COMPLETED, at: mkAt(2), meta: { source: SCHEDULER_ADVISORY_SOURCE } },
    ];

    for (let i = 0; i < chain.length; i++) {
      const r = applyRuntimeTransition(doc, {
        node_id: pick,
        to: chain[i].to,
        at: chain[i].at,
        meta: chain[i].meta,
      });
      if (!r.ok) {
        return {
          ok: false,
          errors: [r.message || r.code || "applyRuntimeTransition falhou"],
          deterministic_order,
          executed_nodes,
          ready_events,
          blocked_nodes: stillPending.map((x) => x.node_id).sort(),
          skipped_repeat_edges,
          transition_count: (doc.transitions || []).length,
          advisory_doc: doc,
          diagnostics: {
            transition_failure: true,
            failed_step: step,
            scheduler_uses_repeat_edges: false,
            real_pipeline_handlers_invoked: false,
            advisory_only: true,
          },
        };
      }
    }

    executed_nodes.push(pick);
    step += 1;
  }

  const pendingLeft = (doc.nodes_runtime_state || [])
    .filter((r) => r.current_status === RUNTIME_NODE_STATUS.PENDING)
    .map((r) => r.node_id)
    .sort();

  const ok = pendingLeft.length === 0;

  return {
    ok,
    errors: ok ? [] : [`nós ainda pendentes (scheduling travado): ${pendingLeft.join(", ")}`],
    deterministic_order,
    executed_nodes,
    ready_events,
    blocked_nodes: pendingLeft,
    skipped_repeat_edges,
    transition_count: (doc.transitions || []).length,
    advisory_doc: doc,
    diagnostics: {
      validation_failed: false,
      scheduling_stuck: pendingLeft.length > 0,
      scheduler_uses_repeat_edges: false,
      real_pipeline_handlers_invoked: false,
      advisory_only: true,
    },
  };
}

module.exports = {
  runSerialAdvisoryScheduler,
};
