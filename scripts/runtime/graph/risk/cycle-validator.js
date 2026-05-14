"use strict";

const { EDGE_KIND } = require("../constants");
const { hasCycle, hasHardEdgeCycle, findSourceOrphans, findUnreachableFromRoots } = require("../graph-validation");

/**
 * @param {{ nodes?: object[], edges?: object[] }} structuralGraph
 */
function analyzeCycles(structuralGraph) {
  const nodes = structuralGraph.nodes || [];
  const ids = nodes.map((n) => n.node_id).filter(Boolean);
  const hardCycle = hasHardEdgeCycle(structuralGraph);
  const schedEdges = (structuralGraph.edges || [])
    .filter((e) => e && e.kind !== EDGE_KIND.REPEAT)
    .map((e) => ({ from: e.from, to: e.to }));
  const schedCycle = hasCycle(ids, schedEdges);
  return {
    hard_edge_cycle: hardCycle,
    scheduling_edge_cycle: schedCycle,
    scheduling_edge_count: schedEdges.length,
    details: [
      hardCycle ? "ciclo em arestas hard (graph_integrity)" : null,
      schedCycle ? "ciclo em arestas de scheduling (hard+conditional)" : null,
    ].filter(Boolean),
  };
}

module.exports = {
  analyzeCycles,
};
