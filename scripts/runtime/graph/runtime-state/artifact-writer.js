"use strict";

const fs = require("fs");
const path = require("path");
const { RUNTIME_ARTIFACT_FILENAME } = require("./constants");
const { validateExecutionGraphRuntimeDocShape } = require("./state-schema");
const {
  validateRuntimeStructuralAlignment,
  validateEmbeddedGraphFingerprint,
} = require("./validators");
const { buildCanonicalExecutionGraph } = require("../graph-builder");

/**
 * @param {string} outputDir
 * @param {object} doc
 * @param {{ skipDeepValidate?: boolean }} [opts]
 */
function writeExecutionGraphRuntimeArtifact(outputDir, doc, opts) {
  const skip = opts && opts.skipDeepValidate === true;
  const shape = validateExecutionGraphRuntimeDocShape(doc);
  if (!shape.ok) {
    throw new Error(`execution-graph-runtime inválido: ${shape.errors.join("; ")}`);
  }
  if (!skip) {
    const structural = buildCanonicalExecutionGraph();
    const align = validateRuntimeStructuralAlignment(doc, structural);
    if (!align.ok) {
      throw new Error(`runtime/graph mismatch: ${align.errors.join("; ")}`);
    }
    const emb = validateEmbeddedGraphFingerprint(doc, doc.graph_fingerprint);
    if (!emb.ok) {
      throw new Error(emb.errors.join("; "));
    }
  }

  const dir = path.resolve(String(outputDir || ""));
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, RUNTIME_ARTIFACT_FILENAME);
  fs.writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

module.exports = {
  writeExecutionGraphRuntimeArtifact,
};
