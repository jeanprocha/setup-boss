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

function createExecutorAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.REPO_MUTATION;
  const capabilities = buildCapabilityModel({
    advisory_only: false,
    replay_safe: true,
    deterministic: false,
    side_effect_level,
    supports_resume: true,
    idempotent: false,
  });

  /** @type {import('../execution-contract').NodeAdapterDescriptor} */
  const descriptor = {
    node_id: NODE_ID.EXECUTOR,
    kind: "executor",
    runtime_type: RUNTIME_TYPE.EXECUTOR,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["run-context.json", "architect-output.md", "task", "dry_run_mode"],
    outputs_expected: ["executor-result.json", "executor-changes.json"],
    artifacts_produced: ["executor-result.json", "executor-changes.json"],
    replay_sensitivity: REPLAY_SENSITIVITY.MEDIUM,
    deterministic_boundaries: ["apply_manifest", "dry_run_overlay", "allowed_paths"],
    supports_replay: true,
    supports_resume: true,
    supports_shadow: true,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createExecutorAdapter,
};
