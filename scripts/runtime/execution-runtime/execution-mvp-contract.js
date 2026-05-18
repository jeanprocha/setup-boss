"use strict";

/** Fase consolidada do runtime MVP (estabilização 4.11). */
const MVP_EXECUTION_PHASE = "4.11";

/** Fases de bundle ainda aceites na validação (runs antigos). */
const ACCEPTED_BUNDLE_PHASES = new Set(["4.10", "4.11"]);

/**
 * @param {unknown} phase
 * @returns {boolean}
 */
function isAcceptedBundlePhase(phase) {
  return ACCEPTED_BUNDLE_PHASES.has(String(phase || "").trim());
}

/**
 * @param {unknown} phase
 * @returns {boolean}
 */
function isLegacyBundlePhase(phase) {
  return String(phase || "").trim() === "4.10";
}

module.exports = {
  MVP_EXECUTION_PHASE,
  ACCEPTED_BUNDLE_PHASES,
  isAcceptedBundlePhase,
  isLegacyBundlePhase,
};
