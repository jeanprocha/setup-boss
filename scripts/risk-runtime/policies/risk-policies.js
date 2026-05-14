/**
 * Políticas configuráveis de risco — limiares, pesos e escalações (Fase 4.3).
 */

const SEVERITY_ORDER = Object.freeze({
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
});

function numEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Limites de tier (score agregado 0–100), ajustáveis por env.
 */
function getTierThresholds() {
  return {
    moderate_min: Math.max(0, Math.min(99, numEnv("SETUP_BOSS_RISK_TIER_MODERATE_MIN", 25))),
    high_min: Math.max(0, Math.min(99, numEnv("SETUP_BOSS_RISK_TIER_HIGH_MIN", 50))),
    critical_min: Math.max(0, Math.min(99, numEnv("SETUP_BOSS_RISK_TIER_CRITICAL_MIN", 75))),
  };
}

/**
 * Pesos por tipo de fator (determinísticos; soma usada na média ponderada).
 */
function defaultFactorWeights() {
  return {
    mutation_scope: numEnv("SETUP_BOSS_RISK_WEIGHT_MUTATION_SCOPE", 1),
    validation_failures: numEnv("SETUP_BOSS_RISK_WEIGHT_VALIDATION_FAILURES", 1.4),
    reconciliation_divergence: numEnv("SETUP_BOSS_RISK_WEIGHT_RECONCILIATION", 1.2),
    critical_paths: numEnv("SETUP_BOSS_RISK_WEIGHT_CRITICAL_PATHS", 1.3),
    operation_complexity: numEnv("SETUP_BOSS_RISK_WEIGHT_COMPLEXITY", 1),
    runtime_instability: numEnv("SETUP_BOSS_RISK_WEIGHT_INSTABILITY", 1.1),
    tooling_uncertainty: numEnv("SETUP_BOSS_RISK_WEIGHT_TOOLING", 1),
  };
}

/**
 * Mapeia severidade → contribuição base 0–100 (antes do peso do fator).
 */
function baseScoreFromSeverity(severity) {
  const s = String(severity || "low").toLowerCase();
  if (s === "critical") return 100;
  if (s === "high") return 75;
  if (s === "moderate") return 45;
  return 20;
}

/**
 * @param {'low'|'moderate'|'high'|'critical'} a
 * @param {'low'|'moderate'|'high'|'critical'} b
 */
function maxSeverity(a, b) {
  const oa = SEVERITY_ORDER[a] || 1;
  const ob = SEVERITY_ORDER[b] || 1;
  return oa >= ob ? a : b;
}

module.exports = {
  SEVERITY_ORDER,
  getTierThresholds,
  defaultFactorWeights,
  baseScoreFromSeverity,
  maxSeverity,
};
