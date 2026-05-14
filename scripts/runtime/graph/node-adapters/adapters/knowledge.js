"use strict";

const { NODE_ID } = require("../../constants");
const { RuntimeNodeAdapter } = require("../adapter-base");
const { buildCapabilityModel } = require("../capability-model");
const {
  RUNTIME_TYPE,
  EXECUTION_KIND,
  REPLAY_SENSITIVITY,
  SIDE_EFFECT_LEVEL,
} = require("../runtime-descriptors");

function createKnowledgeAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.PROJECT_WRITE;
  const capabilities = buildCapabilityModel({
    advisory_only: false,
    replay_safe: false,
    deterministic: false,
    side_effect_level,
    supports_resume: false,
    idempotent: false,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.KNOWLEDGE,
    kind: "knowledge",
    runtime_type: RUNTIME_TYPE.KNOWLEDGE,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["review_metadata", "approved_artifacts", "dry_run_flag"],
    outputs_expected: ["knowledge-update.md"],
    artifacts_produced: ["knowledge-update.md"],
    replay_sensitivity: REPLAY_SENSITIVITY.HIGH,
    deterministic_boundaries: ["dry_run_branch_only"],
    supports_replay: false,
    supports_resume: false,
    supports_shadow: false,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createKnowledgeAdapter,
};
