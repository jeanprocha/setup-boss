"use strict";

const {
  NODE_ID,
  EDGE_KIND,
  NODE_STATUS,
  SCHEMA_VERSION,
  PIPELINE_VARIANT,
} = require("./constants");

/**
 * Grafo canónico alinhado ao pipeline linear + ramificações review e ciclo correction→executor
 * (repeat_edges; arestas hard permanecem acíclicas).
 *
 * @returns {{
 *   schema_version: number,
 *   pipeline_variant: string,
 *   nodes: object[],
 *   edges: object[],
 *   repeat_edges: object[],
 * }}
 */
function buildCanonicalExecutionGraph() {
  const nodes = [
    nodeSpec(NODE_ID.SCAN, "scan", ["scan-output.md"]),
    nodeSpec(NODE_ID.ARCHITECT, "architect", [
      "architect-output.md",
      "run-context.json",
      "architect-validation.json",
    ]),
    nodeSpec(NODE_ID.EXECUTION_PLAN, "execution_plan", ["execution-plan.json"]),
    nodeSpec(NODE_ID.EXECUTOR, "executor", [
      "executor-result.json",
      "executor-changes.json",
    ]),
    nodeSpec(NODE_ID.VALIDATION_PLAN, "validation_plan", [
      "validation-targets.json",
    ]),
    nodeSpec(NODE_ID.VALIDATOR_EXECUTOR, "validator_executor", [
      "validation-results.json",
    ]),
    nodeSpec(NODE_ID.REVIEW, "review", ["review-output.json"]),
    nodeSpec(NODE_ID.CORRECTION, "correction", ["correction-instructions.md"]),
    nodeSpec(NODE_ID.KNOWLEDGE, "knowledge", ["knowledge-update.md"]),
  ];

  const edges = [
    edgeSpec(NODE_ID.SCAN, NODE_ID.ARCHITECT, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.ARCHITECT, NODE_ID.EXECUTION_PLAN, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.EXECUTION_PLAN, NODE_ID.EXECUTOR, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.EXECUTOR, NODE_ID.VALIDATION_PLAN, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.VALIDATION_PLAN, NODE_ID.VALIDATOR_EXECUTOR, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.VALIDATOR_EXECUTOR, NODE_ID.REVIEW, EDGE_KIND.HARD),
    edgeSpec(NODE_ID.REVIEW, NODE_ID.KNOWLEDGE, EDGE_KIND.CONDITIONAL, "review_approved"),
    edgeSpec(NODE_ID.REVIEW, NODE_ID.CORRECTION, EDGE_KIND.CONDITIONAL, "review_requires_correction"),
  ];

  const repeat_edges = [
    {
      from: NODE_ID.CORRECTION,
      to: NODE_ID.EXECUTOR,
      kind: EDGE_KIND.REPEAT,
      condition: "correction_loop",
    },
  ];

  return {
    schema_version: SCHEMA_VERSION,
    pipeline_variant: PIPELINE_VARIANT,
    nodes,
    edges: sortEdgesCanonical(edges),
    repeat_edges: sortRepeatEdgesCanonical(repeat_edges),
  };
}

function nodeSpec(nodeId, kind, artifacts_expected) {
  return {
    node_id: nodeId,
    kind,
    iteration: 0,
    status: NODE_STATUS.PENDING,
    artifacts_expected,
  };
}

function edgeSpec(from, to, kind, condition) {
  const o = { from, to, kind };
  if (condition) o.condition = condition;
  return o;
}

function sortEdgesCanonical(edges) {
  return [...edges].sort(
    (a, b) =>
      String(a.from).localeCompare(String(b.from)) ||
      String(a.to).localeCompare(String(b.to)) ||
      String(a.kind).localeCompare(String(b.kind)) ||
      String(a.condition || "").localeCompare(String(b.condition || "")),
  );
}

function sortRepeatEdgesCanonical(re) {
  return [...re].sort(
    (a, b) =>
      String(a.from).localeCompare(String(b.from)) ||
      String(a.to).localeCompare(String(b.to)) ||
      String(a.kind).localeCompare(String(b.kind)),
  );
}

/**
 * Permutação determinística dos nós para ordem de travessia compatível com o pipeline.
 * @param {{ nodes: object[], edges: object[] }} graph
 * @returns {string[]} ordered node_ids (hard edges only; desempate estável)
 */
function deterministicTopologicalOrder(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const hard = edges.filter((e) => e && e.kind === EDGE_KIND.HARD);
  const ids = nodes.map((n) => n.node_id).sort();

  const incoming = new Map();
  const outgoing = new Map();
  for (const id of ids) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }
  for (const e of hard) {
    if (!incoming.has(e.to) || !outgoing.has(e.from)) continue;
    incoming.get(e.to).add(e.from);
    outgoing.get(e.from).add(e.to);
  }

  const ready = ids.filter((id) => incoming.get(id).size === 0).sort();
  const out = [];
  while (ready.length) {
    const n = ready.shift();
    out.push(n);
    const outs = [...outgoing.get(n)].sort();
    for (const m of outs) {
      incoming.get(m).delete(n);
      if (incoming.get(m).size === 0) {
        ready.push(m);
        ready.sort();
      }
    }
  }
  if (out.length !== ids.length) {
    throw new Error("deterministicTopologicalOrder: ciclo ou grafo incompleto (hard edges).");
  }
  return out;
}

module.exports = {
  buildCanonicalExecutionGraph,
  deterministicTopologicalOrder,
  sortEdgesCanonical,
};
