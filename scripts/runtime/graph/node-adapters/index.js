"use strict";

const { RuntimeNodeAdapter } = require("./adapter-base");
const {
  createAllAdaptersInOrder,
  buildRegisteredAdapterRegistry,
  EXPECTED_NODE_IDS,
} = require("./adapter-registry");
const { buildNodeAdaptersArtifact, writeNodeAdaptersArtifact } = require("./artifact-writer");
const {
  getExecutionGraphNodeAdaptersModeFromEnv,
  isExecutionGraphNodeAdaptersShadowEnabled,
} = require("./feature-flags");
const { tryWriteShadowNodeAdaptersArtifact } = require("./shadow-hook");
const { runFullRegistryValidation } = require("./validators");

module.exports = {
  RuntimeNodeAdapter,
  createAllAdaptersInOrder,
  buildRegisteredAdapterRegistry,
  EXPECTED_NODE_IDS,
  buildNodeAdaptersArtifact,
  writeNodeAdaptersArtifact,
  getExecutionGraphNodeAdaptersModeFromEnv,
  isExecutionGraphNodeAdaptersShadowEnabled,
  tryWriteShadowNodeAdaptersArtifact,
  runFullRegistryValidation,
};
