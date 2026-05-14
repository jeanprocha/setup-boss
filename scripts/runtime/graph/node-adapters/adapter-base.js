"use strict";

const { createExecutionContract, summarizeRuntimeContract } = require("./execution-contract");

/**
 * Wrapper fino: descritor + contrato; **não** executa runtime real.
 *
 * @typedef {import('./execution-contract').NodeAdapterDescriptor} NodeAdapterDescriptor
 */

class RuntimeNodeAdapter {
  /**
   * @param {NodeAdapterDescriptor} descriptor
   */
  constructor(descriptor) {
    this.descriptor = Object.freeze({ ...descriptor, capabilities: { ...descriptor.capabilities } });
    this._contract = createExecutionContract(this.descriptor);
  }

  get node_id() {
    return this.descriptor.node_id;
  }

  getContract() {
    return this._contract;
  }

  serialize() {
    return {
      node_id: this.descriptor.node_id,
      kind: this.descriptor.kind,
      runtime_type: this.descriptor.runtime_type,
      execution_kind: this.descriptor.execution_kind,
      inputs_expected: this.descriptor.inputs_expected,
      outputs_expected: this.descriptor.outputs_expected,
      artifacts_produced: this.descriptor.artifacts_produced,
      replay_sensitivity: this.descriptor.replay_sensitivity,
      deterministic_boundaries: this.descriptor.deterministic_boundaries,
      supports_replay: this.descriptor.supports_replay,
      supports_resume: this.descriptor.supports_resume,
      supports_shadow: this.descriptor.supports_shadow,
      side_effect_level: this.descriptor.side_effect_level,
      capabilities: { ...this.descriptor.capabilities },
    };
  }

  serializeContractSummary() {
    return summarizeRuntimeContract(this._contract, this.descriptor);
  }
}

module.exports = {
  RuntimeNodeAdapter,
};
