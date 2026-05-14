"use strict";

const fs = require("fs");
const path = require("path");
const { computeExecutionGraphFingerprint } = require("../fingerprint");
const { ARTIFACT_FILENAME, NODE_ID } = require("../constants");
const { SCHEDULER_ARTIFACT_FILENAME } = require("../scheduler/constants");
const { RUNTIME_ARTIFACT_FILENAME } = require("../runtime-state/constants");

/**
 * @returns {object|null}
 */
function safeReadJson(p) {
  try {
    if (!p || !fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function loadOptionalExecutionArtifacts(outputDir) {
  const dir = String(outputDir || "");
  return {
    execution_graph: safeReadJson(path.join(dir, ARTIFACT_FILENAME)),
    execution_graph_runtime: safeReadJson(path.join(dir, RUNTIME_ARTIFACT_FILENAME)),
    scheduler_report: safeReadJson(path.join(dir, SCHEDULER_ARTIFACT_FILENAME)),
  };
}

/**
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateFingerprintConsistency(structuralGraph, runtimeDoc, executionGraphDoc) {
  const errors = [];
  const fp = computeExecutionGraphFingerprint(structuralGraph);
  if (runtimeDoc && runtimeDoc.graph_fingerprint && runtimeDoc.graph_fingerprint !== fp) {
    errors.push("runtime.graph_fingerprint ≠ fingerprint do grafo canónico");
  }
  if (executionGraphDoc) {
    const dfp = computeExecutionGraphFingerprint({
      schema_version: executionGraphDoc.schema_version,
      pipeline_variant: executionGraphDoc.pipeline_variant,
      nodes: executionGraphDoc.nodes,
      edges: executionGraphDoc.edges,
      repeat_edges: executionGraphDoc.repeat_edges,
    });
    if (dfp !== fp) errors.push("execution-graph.json fingerprint ≠ canónico");
  }
  return { ok: errors.length === 0, errors };
}

function validateSchedulerVsDeterministic(schedulerOrder, deterministicOrder) {
  const errors = [];
  if (!schedulerOrder.length && deterministicOrder.length) {
    errors.push("scheduler_execution_order vazio");
    return { ok: false, errors };
  }
  if (schedulerOrder.join("|") !== deterministicOrder.join("|")) {
    errors.push("scheduler_execution_order ≠ graph_deterministic_order (simulação advisory completa)");
  }
  return { ok: errors.length === 0, errors };
}

function validateLinearMonotoneIndices(linearOrder, deterministicOrder) {
  const errors = [];
  const idx = new Map(deterministicOrder.map((id, i) => [id, i]));
  let last = -1;
  for (let i = 0; i < linearOrder.length; i++) {
    const id = linearOrder[i];
    if (!idx.has(id)) {
      errors.push(`linear contém nó desconhecido no DAG: ${id}`);
      continue;
    }
    const p = idx.get(id);
    if (p < last) {
      errors.push(
        `ordem linear viola monotonia DAG em [${i}]: ${id} (índice ${p} < último ${last})`,
      );
    }
    last = Math.max(last, p);
  }
  return { ok: errors.length === 0, errors };
}

function findOrphanLinearNodes(linearOrder, graphNodeIds) {
  const out = [];
  for (const id of linearOrder) {
    if (!graphNodeIds.has(id)) out.push(id);
  }
  return [...new Set(out)].sort();
}

function findDuplicateSchedulerNodes(schedulerOrder) {
  const seen = new Set();
  const dup = [];
  for (const id of schedulerOrder) {
    if (seen.has(id)) dup.push(id);
    seen.add(id);
  }
  return [...new Set(dup)].sort();
}

function detectLoopLikeRepeats(linearOrder) {
  const issues = [];
  const counts = new Map();
  for (const id of linearOrder) counts.set(id, (counts.get(id) || 0) + 1);
  for (const id of [NODE_ID.EXECUTOR, NODE_ID.CORRECTION, NODE_ID.REVIEW]) {
    if ((counts.get(id) || 0) > 1) issues.push({ node_id: id, count: counts.get(id) });
  }
  return issues;
}

module.exports = {
  safeReadJson,
  loadOptionalExecutionArtifacts,
  validateFingerprintConsistency,
  validateSchedulerVsDeterministic,
  validateLinearMonotoneIndices,
  findOrphanLinearNodes,
  findDuplicateSchedulerNodes,
  detectLoopLikeRepeats,
};
