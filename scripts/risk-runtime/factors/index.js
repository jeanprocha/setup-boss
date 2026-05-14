/**
 * Registo determinístico de fatores (ordem fixa).
 */

const { evaluateMutationScope } = require("./mutation-scope");
const { evaluateValidationFailures } = require("./validation-failures");
const { evaluateReconciliationDivergence } = require("./reconciliation-divergence");
const { evaluateCriticalPaths } = require("./critical-paths");
const { evaluateOperationComplexity } = require("./operation-complexity");
const { evaluateRuntimeInstability } = require("./runtime-instability");
const { evaluateToolingUncertainty } = require("./tooling-uncertainty");

const EVALUATORS = [
  evaluateMutationScope,
  evaluateValidationFailures,
  evaluateReconciliationDivergence,
  evaluateCriticalPaths,
  evaluateOperationComplexity,
  evaluateRuntimeInstability,
  evaluateToolingUncertainty,
];

/**
 * @param {object} ctx
 * @returns {object[]}
 */
function evaluateAllFactors(ctx) {
  const out = [];
  for (const ev of EVALUATORS) {
    try {
      const f = ev(ctx);
      if (f && typeof f === "object") out.push(f);
    } catch (_) {
      /* best-effort — nunca abortar engine */
    }
  }
  return out;
}

module.exports = {
  evaluateAllFactors,
  EVALUATORS,
};
