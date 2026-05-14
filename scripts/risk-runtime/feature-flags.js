/**
 * SETUP_BOSS_RISK_ENGINE=off|telemetry|active (Fase 4.3).
 * Nenhum modo bloqueia o executor; `active` só acrescenta recomendações em metadata.
 */

/**
 * @returns {'off'|'telemetry'|'active'}
 */
function getRiskEngineModeFromEnv() {
  const raw = process.env.SETUP_BOSS_RISK_ENGINE;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return "off";
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "telemetry" || v === "report" || v === "shadow") return "telemetry";
  if (v === "active" || v === "on" || v === "1" || v === "true") return "active";
  if (v === "off" || v === "0" || v === "false" || v === "no") return "off";
  return "off";
}

function isRiskEngineEnabled() {
  const m = getRiskEngineModeFromEnv();
  return m === "telemetry" || m === "active";
}

function isRiskEngineOrchestrationActive() {
  return getRiskEngineModeFromEnv() === "active";
}

/**
 * Integração Semantic Dependency Runtime → risk-runtime (report-only por defeito).
 * SETUP_BOSS_SEMANTIC_RISK_PROPAGATION=off | shadow (default off).
 *
 * @returns {'off'|'shadow'}
 */
function getSemanticRiskPropagationModeFromEnv() {
  const raw = process.env.SETUP_BOSS_SEMANTIC_RISK_PROPAGATION;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

module.exports = {
  getRiskEngineModeFromEnv,
  isRiskEngineEnabled,
  isRiskEngineOrchestrationActive,
  getSemanticRiskPropagationModeFromEnv,
};
