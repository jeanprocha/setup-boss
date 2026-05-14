"use strict";

/**
 * Modelo de capacidades 4.12.5 (booleanos declarativos; sem efeitos).
 *
 * @typedef {{
 *   advisory_only: boolean,
 *   replay_safe: boolean,
 *   deterministic: boolean,
 *   produces_side_effects: boolean,
 *   idempotent: boolean,
 *   resumable: boolean,
 * }} NodeCapabilityModel
 */

/**
 * Infere produção de efeitos laterais a partir do nível documental.
 * @param {import('./runtime-descriptors').SideEffectLevel} level
 */
function sideEffectLevelToProducesSideEffects(level) {
  return level !== "none" && level !== "read_only";
}

/**
 * @param {{
 *   advisory_only: boolean,
 *   replay_safe: boolean,
 *   deterministic: boolean,
 *   side_effect_level: import('./runtime-descriptors').SideEffectLevel,
 *   supports_resume: boolean,
 *   idempotent?: boolean,
 * }} spec
 * @returns {NodeCapabilityModel}
 */
function buildCapabilityModel(spec) {
  const produces_side_effects = sideEffectLevelToProducesSideEffects(spec.side_effect_level);
  return {
    advisory_only: Boolean(spec.advisory_only),
    replay_safe: Boolean(spec.replay_safe),
    deterministic: Boolean(spec.deterministic),
    produces_side_effects,
    idempotent: Boolean(spec.idempotent),
    resumable: Boolean(spec.supports_resume),
  };
}

/**
 * Valida consistência entre descritor e modelo de capacidades.
 * @param {{
 *   supports_replay: boolean,
 * }} descriptor
 * @param {NodeCapabilityModel} m
 * @returns {{ ok: boolean, code?: string, detail?: string }}
 */
function validateDescriptorCapabilityAlignment(descriptor, m) {
  if (m.replay_safe && !descriptor.supports_replay) {
    return {
      ok: false,
      code: "capability_inconsistency",
      detail: "replay_safe true but supports_replay false",
    };
  }
  return { ok: true };
}

module.exports = {
  buildCapabilityModel,
  validateDescriptorCapabilityAlignment,
  sideEffectLevelToProducesSideEffects,
};
