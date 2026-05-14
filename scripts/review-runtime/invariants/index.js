const { evaluateReconciliationInvariant } = require("./reconciliation-invariant");
const { evaluateValidationInvariant } = require("./validation-invariant");
const { evaluateLifecycleInvariant } = require("./lifecycle-invariant");
const { evaluateArtifactInvariant } = require("./artifact-invariant");
const { evaluateOperationInvariant } = require("./operation-invariant");
const { evaluateReplayInvariant } = require("./replay-invariant");

function runAllInvariants(snapshot) {
  const runners = [
    evaluateReconciliationInvariant,
    evaluateValidationInvariant,
    evaluateLifecycleInvariant,
    evaluateArtifactInvariant,
    evaluateOperationInvariant,
    evaluateReplayInvariant,
  ];
  const findings = [];
  for (const fn of runners) {
    try {
      const part = fn(snapshot) || [];
      findings.push(...part);
    } catch (_) {
      /* never abort review */
    }
  }
  return findings;
}

module.exports = {
  runAllInvariants,
  evaluateReconciliationInvariant,
  evaluateValidationInvariant,
  evaluateLifecycleInvariant,
  evaluateArtifactInvariant,
  evaluateOperationInvariant,
  evaluateReplayInvariant,
};
