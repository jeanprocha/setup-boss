/**
 * Recomendações de escalação de validação (sem enforcement) — Fase 4.3.
 */

/**
 * @param {'low'|'moderate'|'high'|'critical'} tier
 * @param {object} [opts]
 */
function validationEscalationRecommendations(tier, opts = {}) {
  const t = String(tier || "low").toLowerCase();
  const hadFailures = Boolean(opts && opts.validation_failures);

  let recommended_profile = "minimal";
  let strict_policy_escalation = false;
  let semantic_validation_escalation = false;
  let extended_telemetry = false;

  if (t === "low") {
    recommended_profile = "minimal";
  } else if (t === "moderate") {
    recommended_profile = "balanced";
  } else if (t === "high") {
    recommended_profile = "strict";
    strict_policy_escalation = true;
    semantic_validation_escalation = true;
  } else {
    recommended_profile = "strict";
    strict_policy_escalation = true;
    semantic_validation_escalation = true;
    extended_telemetry = true;
  }

  if (hadFailures && t === "moderate") {
    recommended_profile = "strict";
    semantic_validation_escalation = true;
  }

  return {
    recommended_profile,
    stage_escalation_note:
      t === "critical"
        ? "Considerar executar todos os estágios incl. semantic/project + métricas estendidas."
        : t === "high"
          ? "Considerar estágios strict (syntax + lightweight + semantic quando aplicável)."
          : t === "moderate"
            ? "Manter balanced ou subir para strict se houver falhas residuais."
            : "minimal/balanced conforme política existente.",
    strict_policy_escalation,
    semantic_validation_escalation,
    extended_telemetry,
    current_env_profile:
      process.env.SETUP_BOSS_VALIDATION_POLICY_PROFILE != null
        ? String(process.env.SETUP_BOSS_VALIDATION_POLICY_PROFILE)
        : null,
  };
}

module.exports = {
  validationEscalationRecommendations,
};
