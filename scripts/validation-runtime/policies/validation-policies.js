/**
 * Perfis de profundidade — heurísticos, configuráveis por env (Fase 4.2).
 */

const STAGES = /** @type {const} */ ([
  "structural",
  "syntax",
  "lightweight",
  "semantic",
  "project",
]);

/**
 * @returns {'minimal'|'balanced'|'strict'}
 */
function getValidationPolicyProfileFromEnv() {
  const raw = process.env.SETUP_BOSS_VALIDATION_POLICY_PROFILE;
  if (!raw || !String(raw).trim()) return "balanced";
  const v = String(raw).trim().toLowerCase();
  if (v === "minimal" || v === "min") return "minimal";
  if (v === "strict" || v === "full") return "strict";
  return "balanced";
}

/**
 * @param {'minimal'|'balanced'|'strict'} profile
 * @returns {string[]}
 */
function stagesForProfile(profile) {
  const p = profile === "minimal" || profile === "strict" ? profile : "balanced";
  if (p === "minimal") {
    return ["structural", "syntax"];
  }
  if (p === "balanced") {
    return ["structural", "syntax", "lightweight"];
  }
  return ["structural", "syntax", "lightweight", "semantic", "project"];
}

function allStages() {
  return [...STAGES];
}

module.exports = {
  STAGES,
  getValidationPolicyProfileFromEnv,
  stagesForProfile,
  allStages,
};
