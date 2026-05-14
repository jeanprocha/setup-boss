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

function createScanAdapter() {
  const side_effect_level = SIDE_EFFECT_LEVEL.DISK_ARTIFACT;
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
    node_id: NODE_ID.SCAN,
    kind: "scan",
    runtime_type: RUNTIME_TYPE.SCAN,
    execution_kind: EXECUTION_KIND.PIPELINE_STEP,
    inputs_expected: ["project_root", "force_scan", "scan_cache_fingerprint"],
    outputs_expected: ["scan-output.md"],
    artifacts_produced: ["scan-output.md"],
    replay_sensitivity: REPLAY_SENSITIVITY.HIGH,
    deterministic_boundaries: ["scan_cache_fingerprint", "normalized_scan_content"],
    supports_replay: true,
    supports_resume: false,
    supports_shadow: false,
    side_effect_level,
    capabilities,
  };

  return new RuntimeNodeAdapter(descriptor);
}

module.exports = {
  createScanAdapter,
};
