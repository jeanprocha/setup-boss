const { getCorrectionEngineMode, isCorrectionIntelligenceEnabled, isAdaptiveCorrectionOrchestrationEnabled } =
  require("./feature-flags");
const { evaluateCorrectionRetrySuppressionGate, persistFullCorrectionArtifacts } = require("./correction-pipeline");
const { collectCorrectionDiagnostics } = require("./diagnostics/correction-diagnostics");
const { classifyFailures } = require("./classification/failure-classification-engine");
const { computeFailureSignature } = require("./signatures/failure-signatures");

module.exports = {
  getCorrectionEngineMode,
  isCorrectionIntelligenceEnabled,
  isAdaptiveCorrectionOrchestrationEnabled,
  evaluateCorrectionRetrySuppressionGate,
  persistFullCorrectionArtifacts,
  collectCorrectionDiagnostics,
  classifyFailures,
  computeFailureSignature,
};
