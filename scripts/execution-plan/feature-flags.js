/**
 * Feature flags centralizadas — Fase 4.1 (Execution Plan).
 * Não ler SETUP_BOSS_PLAN_MODE espalhado pelo código; usar apenas este módulo.
 *
 * Relacionado — Fase 4.10 (validation runtime / targeting shadow):
 * - SETUP_BOSS_PLAN_MODE: `off` (default) | `shadow` — habilita geração de validation-targets,
 *   dependency-graph, validation-plan, execução opcional do executor local, manifests.
 * - SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION: `off` (default) | `shadow` — candidatos semânticos
 *   no validation-propagation-manifest (report-only; não altera comandos resolvidos).
 *
 * Cache de validação e outras envs do executor: ver `validation-executor.js` / `.env.example`.
 */

/**
 * @returns {'off'|'shadow'}
 */
function getPlanModeFromEnv() {
  const raw = process.env.SETUP_BOSS_PLAN_MODE;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return "off";
  }
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  if (v === "off" || v === "false" || v === "0" || v === "no") return "off";
  return "off";
}

function isShadowPlanModeEnabled() {
  return getPlanModeFromEnv() === "shadow";
}

/**
 * Propagação semântica no validation-targeting (Fase 4.8.4).
 * Variável: SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION — `off` (default) | `shadow`
 * @returns {'off'|'shadow'}
 */
function getSemanticValidationPropagationModeFromEnv() {
  const raw = process.env.SETUP_BOSS_SEMANTIC_VALIDATION_PROPAGATION;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

module.exports = {
  getPlanModeFromEnv,
  isShadowPlanModeEnabled,
  getSemanticValidationPropagationModeFromEnv,
};
