"use strict";

const { buildCanonicalExecutionGraph, deterministicTopologicalOrder } = require("./graph-builder");
const { NODE_ID } = require("./constants");
const { computeExecutionGraphFingerprint, buildFingerprintPayload } = require("./fingerprint");
const {
  hasHardEdgeCycle,
  hasCycle,
  findUnreachableFromRoots,
  validateExecutionGraphDoc,
} = require("./graph-validation");
const {
  buildExecutionGraphDocument,
  writeExecutionGraphArtifact,
} = require("./artifact-writer");
const {
  getExecutionGraphModeFromEnv,
  isExecutionGraphShadowEnabled,
} = require("./feature-flags");
const {
  tryWriteShadowExecutionGraphArtifact,
  tryWriteShadowExecutionGraphArtifacts,
  tryWriteShadowExecutionGraphRuntimeArtifact,
  tryWriteShadowSchedulerReport,
  tryWriteShadowOverlayReport,
  tryWriteShadowNodeAdaptersArtifact,
} = require("./shadow-hook");
const schema = require("./schema");

module.exports = {
  tryWriteShadowExecutionGraphArtifact,
  tryWriteShadowExecutionGraphArtifacts,
  tryWriteShadowExecutionGraphRuntimeArtifact,
  tryWriteShadowSchedulerReport,
  tryWriteShadowOverlayReport,
  tryWriteShadowNodeAdaptersArtifact,
  getExecutionGraphModeFromEnv,
  isExecutionGraphShadowEnabled,
  buildCanonicalExecutionGraph,
  deterministicTopologicalOrder,
  buildFingerprintPayload,
  computeExecutionGraphFingerprint,
  hasHardEdgeCycle,
  hasCycle,
  findUnreachableFromRoots,
  validateExecutionGraphDoc,
  buildExecutionGraphDocument,
  writeExecutionGraphArtifact,
  NODE_ID,
  schema,
};
