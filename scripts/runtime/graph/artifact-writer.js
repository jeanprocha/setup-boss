"use strict";

const fs = require("fs");
const path = require("path");
const {
  ARTIFACT_FILENAME,
  SCHEMA_VERSION,
  PIPELINE_VARIANT,
  PHASE_TAG,
} = require("./constants");
const { computeExecutionGraphFingerprint } = require("./fingerprint");
const { validateExecutionGraphDoc } = require("./graph-validation");

/**
 * @param {{
 *   schema_version: number,
 *   pipeline_variant: string,
 *   nodes: object[],
 *   edges: object[],
 *   repeat_edges: object[],
 * }} structuralGraph from buildCanonicalExecutionGraph
 * @param {{
 *   run_id?: string|null,
 *   pipeline_status?: string|null,
 *   correction_iterations?: number|null,
 *   source?: string|null,
 * }} annotation — não entra no fingerprint
 */
function buildExecutionGraphDocument(structuralGraph, annotation = {}) {
  const graph_fingerprint_sha256 = computeExecutionGraphFingerprint(structuralGraph);
  const nodes = structuralGraph.nodes.map((n) => ({ ...n }));

  return {
    schema_version: structuralGraph.schema_version ?? SCHEMA_VERSION,
    graph_fingerprint_sha256,
    compat: {
      phase: PHASE_TAG,
      pipeline_variant: structuralGraph.pipeline_variant ?? PIPELINE_VARIANT,
    },
    overlay: {
      mode: "shadow",
    },
    run: {
      run_id: annotation.run_id != null ? String(annotation.run_id) : null,
      pipeline_status: annotation.pipeline_status != null ? String(annotation.pipeline_status) : null,
      correction_iterations:
        typeof annotation.correction_iterations === "number"
          ? annotation.correction_iterations
          : null,
      source: annotation.source != null ? String(annotation.source) : null,
    },
    nodes,
    edges: structuralGraph.edges,
    repeat_edges: structuralGraph.repeat_edges,
  };
}

/**
 * @param {string} outputDir
 * @param {ReturnType<typeof buildExecutionGraphDocument>} doc
 */
function writeExecutionGraphArtifact(outputDir, doc) {
  const v = validateExecutionGraphDoc(doc);
  if (!v.ok) {
    throw new Error(`execution-graph inválido: ${v.errors.join("; ")}`);
  }
  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

module.exports = {
  buildExecutionGraphDocument,
  writeExecutionGraphArtifact,
};
