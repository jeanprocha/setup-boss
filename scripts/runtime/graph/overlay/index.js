"use strict";

const C = require("./constants");
const FF = require("./feature-flags");
const Lin = require("./linear-collector");
const V = require("./comparison-validators");
const Ca = require("./consistency-analyzer");
const Eng = require("./overlay-engine");
const Rep = require("./overlay-report-builder");
const Art = require("./artifact-writer");
const Sh = require("./shadow-hook");

module.exports = {
  ...C,
  getExecutionGraphOverlayModeFromEnv: FF.getExecutionGraphOverlayModeFromEnv,
  isExecutionGraphOverlayShadowEnabled: FF.isExecutionGraphOverlayShadowEnabled,
  collectLinearPipelineOrder: Lin.collectLinearPipelineOrder,
  NODE_PRIMARY_ARTIFACT: Lin.NODE_PRIMARY_ARTIFACT,
  ...V,
  buildTransitionAnalysis: Ca.buildTransitionAnalysis,
  buildNodeComparison: Ca.buildNodeComparison,
  buildDependencyAnalysis: Ca.buildDependencyAnalysis,
  computeOverlayStatusAndMessages: Ca.computeOverlayStatusAndMessages,
  buildPipelineOverlayModel: Eng.buildPipelineOverlayModel,
  artifactPresenceSet: Eng.artifactPresenceSet,
  buildOverlayReport: Rep.buildOverlayReport,
  writeOverlayReportArtifact: Art.writeOverlayReportArtifact,
  tryWriteShadowOverlayReport: Sh.tryWriteShadowOverlayReport,
};
