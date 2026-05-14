"use strict";

const C = require("./constants");
const FF = require("./feature-flags");
const Dep = require("./dependency-resolver");
const Ready = require("./ready-node-resolver");
const Val = require("./validators");
const Engine = require("./scheduler-engine");
const Rep = require("./scheduler-report");
const Art = require("./artifact-writer");
const Sh = require("./shadow-hook");

module.exports = {
  ...C,
  getExecutionGraphSchedulerModeFromEnv: FF.getExecutionGraphSchedulerModeFromEnv,
  isExecutionGraphSchedulerShadowEnabled: FF.isExecutionGraphSchedulerShadowEnabled,
  getSchedulingEdges: Dep.getSchedulingEdges,
  buildSchedulingIncomingMap: Dep.buildSchedulingIncomingMap,
  validateKnownNodeReferencesOnEdges: Dep.validateKnownNodeReferencesOnEdges,
  validateHardEdgesAcyclic: Dep.validateHardEdgesAcyclic,
  validateSchedulingEdgesAcyclic: Dep.validateSchedulingEdgesAcyclic,
  computeDeterministicSchedulingOrder: Dep.computeDeterministicSchedulingOrder,
  resolveReadyPendingNodeIds: Ready.resolveReadyPendingNodeIds,
  findRuntimeRow: Ready.findRuntimeRow,
  validateSchedulerInputs: Val.validateSchedulerInputs,
  runSerialAdvisoryScheduler: Engine.runSerialAdvisoryScheduler,
  buildSchedulerReport: Rep.buildSchedulerReport,
  writeSchedulerReportArtifact: Art.writeSchedulerReportArtifact,
  tryWriteShadowSchedulerReport: Sh.tryWriteShadowSchedulerReport,
};
