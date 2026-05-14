"use strict";

/**
 * Ponte **advisory**: como cada adapter se relaciona com simulação scheduler 4.12.3
 * e recuperação (ainda não implementada no pipeline real).
 *
 * @typedef {import('./adapter-base').RuntimeNodeAdapter} RuntimeNodeAdapter
 */

/**
 * @param {RuntimeNodeAdapter[]} adapters
 */
function buildAdvisoryExecutionMatrix(adapters) {
  const out = {};
  for (const a of [...adapters].sort((x, y) => x.node_id.localeCompare(y.node_id))) {
    const d = a.descriptor;
    out[d.node_id] = {
      advisory_scheduler_compatible: true,
      advisory_note:
        "MVP scheduler 4.12.3 não modela repeat_edges; nós em loop real podem divergir da simulação single-pass",
      execution_kind: d.execution_kind,
      shadow_eligible: d.supports_shadow,
    };
  }
  return out;
}

/**
 * Matriz de recuperação de runtime (reservado 4.12.6+; sempre marcado como não acoplado).
 * @param {RuntimeNodeAdapter[]} adapters
 */
function buildRuntimeRecoveryMatrix(adapters) {
  const out = {};
  for (const a of [...adapters].sort((x, y) => x.node_id.localeCompare(y.node_id))) {
    const d = a.descriptor;
    out[d.node_id] = {
      runtime_recovery_supported: false,
      reason: "4.12.5 — metadados apenas; recovery continua no orchestration existente",
      resumable_flag: d.supports_resume,
    };
  }
  return out;
}

/**
 * Compatibilidade com scheduler serial advisory (4.12.3).
 * @param {RuntimeNodeAdapter[]} adapters
 */
function buildSchedulerCompatibilityMatrix(adapters) {
  const out = {};
  for (const a of [...adapters].sort((x, y) => x.node_id.localeCompare(y.node_id))) {
    out[a.node_id] = {
      serial_advisory_compatible: true,
      uses_repeat_edge_in_pipeline: a.descriptor.node_id === "n-correction",
      scheduler_mvp_models_repeat_loop: false,
    };
  }
  return out;
}

/**
 * Ponte resumida para relatórios (uma linha por nó).
 * @param {RuntimeNodeAdapter[]} adapters
 */
function buildAdvisoryBridgeSummary(adapters) {
  return {
    advisory_execution_matrix: buildAdvisoryExecutionMatrix(adapters),
    runtime_recovery_matrix: buildRuntimeRecoveryMatrix(adapters),
    scheduler_compatibility_matrix: buildSchedulerCompatibilityMatrix(adapters),
  };
}

module.exports = {
  buildAdvisoryExecutionMatrix,
  buildRuntimeRecoveryMatrix,
  buildSchedulerCompatibilityMatrix,
  buildAdvisoryBridgeSummary,
};
