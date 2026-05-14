"use strict";

const { computeExecutionGraphFingerprint } = require("../fingerprint");
const {
  validateRuntimeStructuralAlignment,
  validateEmbeddedGraphFingerprint,
} = require("../runtime-state/validators");
const { validateReplayOrderConsistent } = require("./replay-traversal");

/**
 * @param {object} structuralGraph
 * @param {object|null|undefined} runtimeSnapshot
 * @param {string[]} target_node_ids
 * @param {{
 *   subtree: Set<string>,
 *   invalidated_nodes: string[],
 *   replay_order: string[],
 *   deterministic_order: string[],
 *   cycle_detected: boolean,
 *   replay_blocked_nodes: string[],
 * }} planParts
 */
function runReplayValidators(structuralGraph, runtimeSnapshot, target_node_ids, planParts) {
  /** @type {{ code: string, detail: string, node_id?: string }[]} */
  const diagnostics = [];
  /** @type {string[]} */
  const warnings = [];

  const graphIds = new Set((structuralGraph.nodes || []).map((n) => n.node_id));
  for (const tid of target_node_ids) {
    if (!graphIds.has(tid)) {
      diagnostics.push({
        code: "replay_target_missing",
        node_id: tid,
        detail: `alvo não existe no grafo estrutural: ${tid}`,
      });
    }
  }

  if (planParts.cycle_detected) {
    diagnostics.push({
      code: "replay_traversal_cycle",
      detail: "ciclo detetado na travessia downstream de replay (inesperado para DAG)",
    });
  }

  const fpExpected = computeExecutionGraphFingerprint(structuralGraph);
  if (runtimeSnapshot && runtimeSnapshot.graph_fingerprint && runtimeSnapshot.graph_fingerprint !== fpExpected) {
    diagnostics.push({
      code: "fingerprint_mismatch",
      detail: "runtimeSnapshot.graph_fingerprint ≠ fingerprint do grafo canónico actual",
    });
  }

  if (runtimeSnapshot) {
    const align = validateRuntimeStructuralAlignment(runtimeSnapshot, structuralGraph, fpExpected);
    if (!align.ok) {
      for (const e of align.errors) {
        diagnostics.push({ code: "runtime_graph_mismatch", detail: e });
      }
    }
    const emb = validateEmbeddedGraphFingerprint(runtimeSnapshot, runtimeSnapshot.graph_fingerprint);
    if (!emb.ok) {
      for (const e of emb.errors) {
        diagnostics.push({ code: "embedded_fingerprint_mismatch", detail: e });
      }
    }
  }

  const subtreeIds = planParts.subtree;
  for (const inv of planParts.invalidated_nodes || []) {
    if (!subtreeIds.has(inv)) {
      diagnostics.push({
        code: "invalidation_inconsistent",
        node_id: inv,
        detail: "invalidated_nodes contém nó fora da replay_subtree",
      });
    }
  }

  const ordCheck = validateReplayOrderConsistent(planParts.replay_order, planParts.deterministic_order);
  if (!ordCheck.ok) {
    for (const e of ordCheck.errors) {
      diagnostics.push({ code: "replay_order_inconsistent", detail: e });
    }
  }

  if ((planParts.replay_blocked_nodes || []).length > 0) {
    warnings.push(
      ...planParts.replay_blocked_nodes.map(
        (id) => `non_replay_safe_or_blocked: ${id}`,
      ),
    );
  }

  const seen = new Set();
  for (const id of planParts.replay_order || []) {
    if (seen.has(id)) {
      diagnostics.push({
        code: "replay_order_inconsistent",
        detail: `duplicado em replay_order: ${id}`,
      });
    }
    seen.add(id);
  }

  return {
    diagnostics,
    warnings,
    validation_ok: diagnostics.length === 0,
  };
}

module.exports = {
  runReplayValidators,
};
