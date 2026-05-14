"use strict";

/**
 * Contrato de execução 4.12.5 — **sem** invocar runtimes reais.
 * Métodos devolvem apenas estruturas estáticas derivadas do descritor.
 *
 * @typedef {import('./runtime-descriptors').SideEffectLevel} SideEffectLevel
 * @typedef {import('./capability-model').NodeCapabilityModel} NodeCapabilityModel
 */

/**
 * @typedef {{
 *   node_id: string,
 *   kind: string,
 *   runtime_type: string,
 *   execution_kind: string,
 *   inputs_expected: string[],
 *   outputs_expected: string[],
 *   artifacts_produced: string[],
 *   replay_sensitivity: import('./runtime-descriptors').ReplaySensitivity,
 *   deterministic_boundaries: string[],
 *   supports_replay: boolean,
 *   supports_resume: boolean,
 *   supports_shadow: boolean,
 *   side_effect_level: SideEffectLevel,
 *   capabilities: NodeCapabilityModel,
 * }} NodeAdapterDescriptor
 */

/**
 * @param {NodeAdapterDescriptor} descriptor
 * @returns {{
 *   resolveInputs: () => object,
 *   resolveOutputs: () => object,
 *   validateRuntimeContext: (ctx: unknown) => { ok: boolean, errors: string[] },
 *   getRuntimeCapabilities: () => NodeCapabilityModel,
 *   getExpectedArtifacts: () => string[],
 * }}
 */
function createExecutionContract(descriptor) {
  return {
    resolveInputs() {
      return { keys: [...descriptor.inputs_expected].sort() };
    },
    resolveOutputs() {
      return { keys: [...descriptor.outputs_expected].sort() };
    },
    validateRuntimeContext(ctx) {
      /** @type {string[]} */
      const errors = [];
      if (ctx == null || typeof ctx !== "object") {
        errors.push("runtime_context must be a non-null object");
        return { ok: errors.length === 0, errors };
      }
      const o = /** @type {Record<string, unknown>} */ (ctx);
      if (o.run_id != null && typeof o.run_id !== "string") errors.push("run_id must be string if present");
      if (o.output_dir != null && typeof o.output_dir !== "string")
        errors.push("output_dir must be string if present");
      return { ok: errors.length === 0, errors };
    },
    getRuntimeCapabilities() {
      return { ...descriptor.capabilities };
    },
    getExpectedArtifacts() {
      return [...descriptor.artifacts_produced];
    },
  };
}

/**
 * Resumo serializável do contrato (sem funções).
 * @param {ReturnType<typeof createExecutionContract>} contract
 * @param {NodeAdapterDescriptor} descriptor
 */
function summarizeRuntimeContract(contract, descriptor) {
  return {
    node_id: descriptor.node_id,
    methods: ["resolveInputs", "resolveOutputs", "validateRuntimeContext", "getRuntimeCapabilities", "getExpectedArtifacts"],
    static_shape: {
      inputs: contract.resolveInputs(),
      outputs: contract.resolveOutputs(),
      expected_artifacts: contract.getExpectedArtifacts(),
    },
  };
}

module.exports = {
  createExecutionContract,
  summarizeRuntimeContract,
};
