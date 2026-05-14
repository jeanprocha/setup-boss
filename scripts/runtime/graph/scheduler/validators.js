"use strict";

const { validateRuntimeStructuralAlignment } = require("../runtime-state/validators");
const {
  validateKnownNodeReferencesOnEdges,
  validateHardEdgesAcyclic,
  validateSchedulingEdgesAcyclic,
} = require("./dependency-resolver");

/**
 * Compatibilidade graph ↔ runtime + invariantes de DAG/scheduling.
 * repeat_edges não entram nas dependências do scheduler; apenas referências devem existir.
 *
 * @param {object} structuralGraph
 * @param {object} runtimeDoc
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateSchedulerInputs(structuralGraph, runtimeDoc) {
  const errors = [];
  const align = validateRuntimeStructuralAlignment(runtimeDoc, structuralGraph);
  if (!align.ok) errors.push(...align.errors);

  const unk = validateKnownNodeReferencesOnEdges(structuralGraph);
  if (!unk.ok) errors.push(...unk.errors);

  const hh = validateHardEdgesAcyclic(structuralGraph);
  if (!hh.ok) errors.push(...hh.errors);

  const sc = validateSchedulingEdgesAcyclic(structuralGraph);
  if (!sc.ok) errors.push(...sc.errors);

  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateSchedulerInputs,
};
