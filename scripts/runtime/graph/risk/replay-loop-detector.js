"use strict";

/**
 * @param {object|null} replayReport
 */
function analyzeReplayLoops(replayReport) {
  const out = {
    replay_report_present: Boolean(replayReport),
    traversal_cycle_flag: false,
    planning_ok: replayReport && replayReport.compat ? replayReport.compat.planning_ok : null,
    duplicate_generation_nodes: [],
    diagnostics_codes: [],
    notes: [],
  };
  if (!replayReport) {
    out.notes.push("execution-graph-replay-report.json ausente — análise de replay loop limitada.");
    return out;
  }

  const diag = replayReport.diagnostics;
  if (Array.isArray(diag)) {
    for (const d of diag) {
      if (d && d.code) out.diagnostics_codes.push(d.code);
      if (d && d.code === "replay_traversal_cycle") out.traversal_cycle_flag = true;
    }
  }

  const gens = replayReport.replay_generations;
  if (Array.isArray(gens)) {
    const seen = new Set();
    for (const layer of gens) {
      const ids = (layer && layer.node_ids) || [];
      for (const id of ids) {
        if (seen.has(id)) out.duplicate_generation_nodes.push(id);
        seen.add(id);
      }
    }
    out.duplicate_generation_nodes = [...new Set(out.duplicate_generation_nodes)].sort();
  }

  if (out.duplicate_generation_nodes.length) {
    out.notes.push("Nó repetido em mais do que uma geração de replay (inconsistência).");
  }
  if (out.traversal_cycle_flag) {
    out.notes.push("Replay advisory detetou ciclo na travessia downstream.");
  }

  return out;
}

module.exports = {
  analyzeReplayLoops,
};
