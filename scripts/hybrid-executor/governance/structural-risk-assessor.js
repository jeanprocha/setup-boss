"use strict";

const { STRUCTURAL_BLOCKER_CODES } = require("./structural-blocker-codes");

/** @typedef {'none'|'warning'|'medium'|'high'} RiskTier */

const ORDER = { none: 0, warning: 1, medium: 2, high: 3 };

/**
 * @param {RiskTier} a
 * @param {RiskTier} b
 * @returns {RiskTier}
 */
function maxTier(a, b) {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/**
 * @param {object} input
 * @param {string[]} input.blockerCodes
 * @param {boolean} [input.astCorruptHigh]
 * @param {boolean} [input.formatterDriftHigh]
 * @param {boolean} [input.deleteOrExportHigh]
 * @param {boolean} [input.multiFileHigh]
 * @param {'warning'|'block'} [input.lowConfidenceMode]
 * @param {boolean} [input.lowConfidencePresent]
 * @param {boolean} [input.excessiveFallbackWarning]
 * @param {number} [input.distinctFilesCount]
 */
function assessStructuralRisk(input) {
  const blockers = Array.isArray(input.blockerCodes) ? input.blockerCodes : [];
  /** @type {RiskTier} */
  let tier = "none";
  /** @type {string[]} */
  const factors = [];
  const df = typeof input.distinctFilesCount === "number" ? input.distinctFilesCount : 0;

  if (input.astCorruptHigh || blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_AST_CORRUPT)) {
    tier = maxTier(tier, "high");
    factors.push("ast_corrupt");
  }

  if (
    input.formatterDriftHigh ||
    blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_FORMATTER_DRIFT)
  ) {
    tier = maxTier(tier, "high");
    factors.push("formatter_drift");
  }

  if (input.deleteOrExportHigh || blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_UNSAFE_DELETE_NODE)) {
    tier = maxTier(tier, "high");
    factors.push("delete_or_export_surface");
  }

  if (blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_MULTI_FILE_CASCADE)) {
    const high = input.multiFileHigh || df >= 3;
    tier = maxTier(tier, high ? "high" : "medium");
    factors.push("multi_file_cascade");
  }

  if (blockers.includes(STRUCTURAL_BLOCKER_CODES.STRUCTURAL_LOW_CONFIDENCE)) {
    const mode = input.lowConfidenceMode === "block" ? "block" : "warning";
    if (mode === "block") {
      tier = maxTier(tier, "high");
      factors.push("low_confidence_block");
    } else {
      tier = maxTier(tier, "warning");
      factors.push("low_confidence_warn");
    }
  }

  if (input.excessiveFallbackWarning) {
    tier = maxTier(tier, "warning");
    factors.push("excessive_textual_fallback");
  }

  return {
    tier,
    factors: [...new Set(factors)],
    blocker_codes_observed: blockers.slice(),
  };
}

/**
 * @param {object[]} perPatchRisk
 * @param {{ textual_ratio?: number }} [runHints]
 */
function aggregateStructuralRunRisk(perPatchRisk, runHints) {
  /** @type {RiskTier} */
  let tier = "none";

  for (const pr of perPatchRisk) {
    if (!pr || !pr.tier) continue;
    tier = maxTier(tier, pr.tier);
  }

  if (runHints && typeof runHints.textual_ratio === "number") {
    if (runHints.textual_ratio >= 0.5 && tier === "none") {
      tier = "warning";
    }
  }

  return {
    tier,
    per_patch_tiers: perPatchRisk.map((p) => (p && p.tier ? p.tier : "none")),
  };
}

module.exports = {
  assessStructuralRisk,
  aggregateStructuralRunRisk,
  maxTier,
};
