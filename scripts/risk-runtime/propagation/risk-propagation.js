/**
 * Propagação de risco por camadas — prepara governance/rollback futuros (Fase 4.3).
 */

const { aggregateWeightedScores } = require("../scoring/risk-scoring");
const { defaultFactorWeights } = require("../policies/risk-policies");

function sliceFactorsByType(factors, types) {
  const set = new Set(types);
  return (factors || []).filter((f) => f && set.has(String(f.type)));
}

/**
 * @param {object} params
 * @param {object[]} params.factors
 * @param {number} params.aggregate
 * @param {'low'|'moderate'|'high'|'critical'} params.tier
 */
function buildRiskPropagation(params) {
  const factors = Array.isArray(params.factors) ? params.factors : [];
  const w = defaultFactorWeights();

  const planFactors = sliceFactorsByType(factors, ["operation_complexity", "critical_paths"]);
  const reconciliationFactors = sliceFactorsByType(factors, ["reconciliation_divergence"]);
  const validationFactors = sliceFactorsByType(factors, ["validation_failures", "tooling_uncertainty"]);
  const operationFactors = sliceFactorsByType(factors, ["mutation_scope", "critical_paths", "operation_complexity"]);
  const runtimeFactors = sliceFactorsByType(factors, ["runtime_instability", "tooling_uncertainty"]);

  const plan = aggregateWeightedScores(planFactors, w);
  const reconciliation = aggregateWeightedScores(reconciliationFactors, w);
  const validation = aggregateWeightedScores(validationFactors, w);
  const operation = aggregateWeightedScores(operationFactors, w);
  const runtime = aggregateWeightedScores(runtimeFactors, w);

  return {
    schema_version: 1,
    layers: {
      plan_risk: {
        score: plan.aggregate,
        tier: plan.tier,
        factor_types: planFactors.map((f) => String(f.type)).sort(),
      },
      reconciliation_risk: {
        score: reconciliation.aggregate,
        tier: reconciliation.tier,
        factor_types: reconciliationFactors.map((f) => String(f.type)).sort(),
      },
      validation_risk: {
        score: validation.aggregate,
        tier: validation.tier,
        factor_types: validationFactors.map((f) => String(f.type)).sort(),
      },
      operation_risk: {
        score: operation.aggregate,
        tier: operation.tier,
        factor_types: operationFactors.map((f) => String(f.type)).sort(),
      },
      runtime_risk: {
        score: runtime.aggregate,
        tier: runtime.tier,
        factor_types: runtimeFactors.map((f) => String(f.type)).sort(),
      },
    },
    global: {
      aggregate: params.aggregate,
      tier: params.tier,
    },
    refs: {
      risk_analysis: "risk-analysis.json",
      execution_plan: "execution-plan.json",
      reconciliation: "execution-reconciliation.json",
      validation_results: "validation-results.json",
      validation_manifest: "validation-runtime-manifest.json",
      plan_artifacts: "plan-artifacts.json",
    },
  };
}

module.exports = { buildRiskPropagation, sliceFactorsByType };
