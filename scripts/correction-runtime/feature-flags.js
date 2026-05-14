/**
 * SETUP_BOSS_CORRECTION_ENGINE=off|guided|active (Fase 4.5)
 * — off: sem motor de correction intelligence (fallback total).
 * — guided: classification + relatórios + prompting enriquecido; sem gates de suppress de retry.
 * — active: igual a guided mais supressão de retry / escalações assíncronas (sem rollback).
 */

function getCorrectionEngineMode() {
  const raw = process.env.SETUP_BOSS_CORRECTION_ENGINE;
  if (!raw || typeof raw !== "string") return "off";
  const x = String(raw).trim().toLowerCase();
  if (x === "guided" || x === "shadow" || x === "telemetry") return "guided";
  if (x === "active" || x === "on") return "active";
  return "off";
}

function isCorrectionIntelligenceEnabled() {
  const m = getCorrectionEngineMode();
  return m === "guided" || m === "active";
}

function isAdaptiveCorrectionOrchestrationEnabled() {
  return getCorrectionEngineMode() === "active";
}

/**
 * Semantic propagation → correction-runtime (Fase 4.8.7). Report-only / shadow.
 * SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION=off | shadow (default off).
 *
 * @returns {'off'|'shadow'}
 */
function getSemanticCorrectionPropagationModeFromEnv() {
  const raw = process.env.SETUP_BOSS_CORRECTION_SEMANTIC_PROPAGATION;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

module.exports = {
  getCorrectionEngineMode,
  isCorrectionIntelligenceEnabled,
  isAdaptiveCorrectionOrchestrationEnabled,
  getSemanticCorrectionPropagationModeFromEnv,
};
