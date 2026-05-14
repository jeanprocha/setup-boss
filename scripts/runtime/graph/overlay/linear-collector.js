"use strict";

const fs = require("fs");
const path = require("path");
const { readCheckpoints } = require("../../replay/checkpoint-manager");
const { NODE_ID } = require("../constants");

/** Artefacto principal por nó (4.12.1) para observação passiva. */
const NODE_PRIMARY_ARTIFACT = {
  [NODE_ID.SCAN]: "scan-output.md",
  [NODE_ID.ARCHITECT]: "architect-output.md",
  [NODE_ID.EXECUTION_PLAN]: "execution-plan.json",
  [NODE_ID.EXECUTOR]: "executor-result.json",
  [NODE_ID.VALIDATION_PLAN]: "validation-targets.json",
  [NODE_ID.VALIDATOR_EXECUTOR]: "validation-results.json",
  [NODE_ID.REVIEW]: "review-output.json",
  [NODE_ID.CORRECTION]: "correction-instructions.md",
  [NODE_ID.KNOWLEDGE]: "knowledge-update.md",
};

function exists(outputDir, rel) {
  try {
    return fs.existsSync(path.join(outputDir, rel));
  } catch (_) {
    return false;
  }
}

/**
 * Expande checkpoints macro do pipeline para node_ids do grafo 4.12.1.
 * Não invoca orchestration — só leitura do disco.
 *
 * @param {string} outputDir
 * @returns {{
 *   linear_pipeline_order: string[],
 *   checkpoint_phases: string[],
 *   diagnostics: object,
 * }}
 */
function collectLinearPipelineOrder(outputDir) {
  const dir = String(outputDir || "");
  const diagnostics = {
    source: "runtime-checkpoints.json+artifact_presence",
    preflight_not_in_graph: true,
    checkpoint_count: 0,
  };

  if (!dir || !fs.existsSync(dir)) {
    return {
      linear_pipeline_order: [],
      checkpoint_phases: [],
      diagnostics: { ...diagnostics, error: "outputDir inválido ou inexistente" },
    };
  }

  const cpDoc = readCheckpoints(dir);
  const checkpoints = cpDoc && Array.isArray(cpDoc.checkpoints) ? cpDoc.checkpoints : [];
  diagnostics.checkpoint_count = checkpoints.length;

  const linear = [];
  const phases = [];

  for (const c of checkpoints) {
    const phase = c && c.phase_completed;
    if (!phase) continue;
    phases.push(phase);

    switch (phase) {
      case "AFTER_PREFLIGHT":
        break;
      case "AFTER_ARCHITECT": {
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.SCAN])) linear.push(NODE_ID.SCAN);
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.ARCHITECT])) linear.push(NODE_ID.ARCHITECT);
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.EXECUTION_PLAN]))
          linear.push(NODE_ID.EXECUTION_PLAN);
        break;
      }
      case "AFTER_EXECUTOR": {
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.EXECUTOR])) linear.push(NODE_ID.EXECUTOR);
        break;
      }
      case "AFTER_REVIEW": {
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.VALIDATION_PLAN]))
          linear.push(NODE_ID.VALIDATION_PLAN);
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.VALIDATOR_EXECUTOR]))
          linear.push(NODE_ID.VALIDATOR_EXECUTOR);
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.REVIEW])) linear.push(NODE_ID.REVIEW);
        break;
      }
      case "AFTER_CORRECTION": {
        if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.CORRECTION])) linear.push(NODE_ID.CORRECTION);
        break;
      }
      default:
        diagnostics.unknown_checkpoint_phase = diagnostics.unknown_checkpoint_phase || [];
        diagnostics.unknown_checkpoint_phase.push(phase);
    }
  }

  if (exists(dir, NODE_PRIMARY_ARTIFACT[NODE_ID.KNOWLEDGE]) && !linear.includes(NODE_ID.KNOWLEDGE)) {
    linear.push(NODE_ID.KNOWLEDGE);
    diagnostics.knowledge_inferred_from_artifact = true;
  }

  diagnostics.duplicate_correction_passes = countOccurrences(linear, NODE_ID.CORRECTION);
  diagnostics.duplicate_executor_passes = countOccurrences(linear, NODE_ID.EXECUTOR);

  return {
    linear_pipeline_order: linear,
    checkpoint_phases: phases,
    diagnostics: { ...diagnostics, linear_length: linear.length },
  };
}

function countOccurrences(arr, val) {
  let n = 0;
  for (const x of arr) if (x === val) n += 1;
  return n;
}

module.exports = {
  collectLinearPipelineOrder,
  NODE_PRIMARY_ARTIFACT,
};
