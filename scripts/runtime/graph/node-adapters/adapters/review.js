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

function createReviewAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.LLM;
  const capabilities = buildCapabilityModel({
    advisory_only: false,
    replay_safe: true,
    deterministic: false,
    side_effect_level,
    supports_resume: false,
    idempotent: false,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.REVIEW,
    kind: "review",
    runtime_type: RUNTIME_TYPE.REVIEW,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["executor_artifacts", "review_policy"],
    outputs_expected: ["review-output.json"],
    artifacts_produced: ["review-output.json"],
    replay_sensitivity: REPLAY_SENSITIVITY.MEDIUM,
    deterministic_boundaries: ["deterministic_review_mode", "frozen_diff_inputs"],
    supports_replay: true,
    supports_resume: false,
    supports_shadow: false,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createReviewAdapter,
};
