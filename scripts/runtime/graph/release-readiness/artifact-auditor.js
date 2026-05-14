"use strict";

const { ARTIFACT_FILENAME } = require("../constants");
const { RUNTIME_ARTIFACT_FILENAME } = require("../runtime-state/constants");
const { SCHEDULER_ARTIFACT_FILENAME } = require("../scheduler/constants");
const { OVERLAY_ARTIFACT_FILENAME } = require("../overlay/constants");
const { NODE_ADAPTERS_ARTIFACT_FILENAME } = require("../node-adapters/constants");
const { REPLAY_ARTIFACT_FILENAME } = require("../replay/constants");
const { RISK_ARTIFACT_FILENAME } = require("../risk/constants");
const { RELEASE_READINESS_ARTIFACT_FILENAME } = require("./constants");
const { tryReadJsonFile } = require("./safe-json");

const ARTIFACT_SPECS = [
  {
    id: "execution_graph",
    file: ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "nodes", "edges"],
  },
  {
    id: "execution_graph_runtime",
    file: RUNTIME_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "graph_id", "graph_fingerprint"],
  },
  {
    id: "execution_graph_scheduler_report",
    file: SCHEDULER_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "run_id", "graph_fingerprint"],
  },
  {
    id: "execution_graph_overlay_report",
    file: OVERLAY_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "run_id", "graph_fingerprint"],
  },
  {
    id: "execution_graph_node_adapters",
    file: NODE_ADAPTERS_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "graph_id", "graph_fingerprint"],
  },
  {
    id: "execution_graph_replay_report",
    file: REPLAY_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "graph_fingerprint"],
  },
  {
    id: "execution_graph_risk_report",
    file: RISK_ARTIFACT_FILENAME,
    required: false,
    minKeys: ["schema_version", "graph_fingerprint"],
  },
  {
    id: "execution_graph_release_readiness",
    file: RELEASE_READINESS_ARTIFACT_FILENAME,
    required: false,
    minKeys: [],
  },
];

/**
 * @param {string} outputDir
 * @returns {{ entries: object[], present_count: number, missing: string[], parse_errors: string[] }}
 */
function auditArtifacts(outputDir) {
  const entries = [];
  const missing = [];
  const parseErrors = [];
  let presentCount = 0;

  for (const spec of ARTIFACT_SPECS) {
    const r = tryReadJsonFile(outputDir, spec.file);
    const present = r.ok;
    if (present) presentCount += 1;
    else if (r.error && r.error.startsWith("missing:")) missing.push(spec.file);
    else if (!r.ok) parseErrors.push(r.error || spec.file);

    let shapeOk = present;
    const shapeErrors = [];
    if (r.ok && spec.minKeys.length) {
      for (const k of spec.minKeys) {
        if (!(k in r.data)) shapeErrors.push(`sem campo ${k}`);
      }
      if (shapeErrors.length) {
        shapeOk = false;
        parseErrors.push(`${spec.file}: ${shapeErrors.join("; ")}`);
      }
    }

    entries.push({
      id: spec.id,
      file: spec.file,
      present,
      parse_ok: r.ok,
      shape_ok: shapeOk,
      required: spec.required,
    });
  }

  return { entries, present_count: presentCount, missing, parse_errors: parseErrors };
}

module.exports = {
  ARTIFACT_SPECS,
  auditArtifacts,
};
