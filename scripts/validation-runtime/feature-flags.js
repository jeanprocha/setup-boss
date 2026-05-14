/**
 * Feature flags — Validation Runtime (Fase 4.2).
 * Default `off` preserva compatibilidade; `report` executa sem bloquear o pipeline.
 */

/**
 * @returns {'off'|'report'|'active'}
 */
function getValidationModeFromEnv() {
  const raw = process.env.SETUP_BOSS_VALIDATION_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return "off";
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "report" || v === "shadow") return "report";
  if (v === "active" || v === "enforce" || v === "on") return "active";
  if (v === "off" || v === "false" || v === "0" || v === "no") return "off";
  return "off";
}

function isValidationRuntimeEnabled() {
  const m = getValidationModeFromEnv();
  return m === "report" || m === "active";
}

function shouldValidationBlockPipeline() {
  return getValidationModeFromEnv() === "active";
}

module.exports = {
  getValidationModeFromEnv,
  isValidationRuntimeEnabled,
  shouldValidationBlockPipeline,
};
