"use strict";

const { isStructuralGovernanceEnabled } = require("../feature-flags");
const { buildPatchGovernanceDecision } = require("../governance/structural-governance-gate");

const CLASSIFICATIONS = {
  REPLAYABLE: "replayable",
  ALREADY_APPLIED: "already_applied",
  STALE_SELECTOR: "stale_selector",
  SELECTOR_MISSING: "selector_missing",
  SUPERSEDED_TRANSFORM: "superseded_transform",
  BLOCKED_BY_GOVERNANCE: "blocked_by_governance",
};

/**
 * @param {object[]} findings
 * @param {number} patchIndex
 */
function findingsForPatch(findings, patchIndex) {
  return (Array.isArray(findings) ? findings : []).filter(
    (f) => f && typeof f.patch_index === "number" && f.patch_index === patchIndex,
  );
}

/**
 * @param {string} classification
 * @param {object|null} governanceDecision
 * @param {object} row
 * @param {object} extra
 */
function buildReplayConfidence(classification, governanceDecision, row, extra) {
  /** @type {string[]} */
  const factors = [];
  let score = 0.5;

  const gScore =
    typeof row?.gate_snapshot?.confidence_score === "number" ? row.gate_snapshot.confidence_score : null;

  switch (classification) {
    case CLASSIFICATIONS.REPLAYABLE:
      score = gScore != null ? Math.min(0.99, 0.75 + gScore / 400) : 0.9;
      factors.push("structural_replay_eligible");
      if (extra?.no_structural_plan) factors.push("no_plan_entry_shadow_only");
      if (extra?.structural_plan_skipped) factors.push("non_replace_node_plan");
      break;
    case CLASSIFICATIONS.ALREADY_APPLIED:
      score = 0.72;
      factors.push("idempotency_signal");
      if (extra?.detail?.confidence) factors.push(String(extra.detail.confidence));
      break;
    case CLASSIFICATIONS.STALE_SELECTOR:
      score = 0.22;
      factors.push("selector_stale_or_mismatch");
      break;
    case CLASSIFICATIONS.SELECTOR_MISSING:
      score = 0.18;
      factors.push("selector_not_mapped_or_span");
      break;
    case CLASSIFICATIONS.SUPERSEDED_TRANSFORM:
      score = 0.25;
      factors.push("later_overlapping_transform");
      break;
    case CLASSIFICATIONS.BLOCKED_BY_GOVERNANCE:
      score = 0.12;
      factors.push("governance_blockers_present");
      break;
    default:
      factors.push("unknown_classification");
  }

  if (governanceDecision?.blockers?.length && classification !== CLASSIFICATIONS.BLOCKED_BY_GOVERNANCE) {
    factors.push("governance_clear");
  }

  return {
    score: Math.round(score * 1000) / 1000,
    factors,
    classification,
  };
}

function governanceLinkage(governanceDecision) {
  if (!governanceDecision) return null;

  return {
    blockers: governanceDecision.blockers || [],
    risk_tier: governanceDecision.risk?.tier ?? null,
    preempted_structural: !!governanceDecision.governance?.preempted_structural,
    applies_structural_governance: !!governanceDecision.governance?.applies_structural_governance,
  };
}

/**
 * @param {object} row
 * @param {{
 *   staleFindings?: object[],
 *   runDistinctFiles?: number,
 *   minScoreRequired?: number,
 * }} ctx
 */
function classifyStructuralReplayRow(row, ctx) {
  const findings = ctx?.staleFindings || [];
  const patchIndex = typeof row?.patch_index === "number" ? row.patch_index : -1;
  const myFindings = findingsForPatch(findings, patchIndex);

  /** @type {object|null} */
  let governanceDecision = null;

  if (isStructuralGovernanceEnabled()) {
    governanceDecision = buildPatchGovernanceDecision(row, {
      run_distinct_files: ctx?.runDistinctFiles,
      min_score_required: ctx?.minScoreRequired,
    });

    if (governanceDecision.blockers && governanceDecision.blockers.length > 0) {
      return {
        patch_index: patchIndex,
        path: row?.path ?? null,
        classification: CLASSIFICATIONS.BLOCKED_BY_GOVERNANCE,
        governance_linkage: governanceLinkage(governanceDecision),
        replay_confidence: buildReplayConfidence(
          CLASSIFICATIONS.BLOCKED_BY_GOVERNANCE,
          governanceDecision,
          row,
          {},
        ),
        details: { blockers: governanceDecision.blockers },
      };
    }
  }

  if (!row.plan_entry) {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.REPLAYABLE,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(CLASSIFICATIONS.REPLAYABLE, governanceDecision, row, {
        no_structural_plan: true,
      }),
      details: { note: "no_plan_entry" },
    };
  }

  if (row.plan_entry.op !== "replace_node") {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.REPLAYABLE,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(CLASSIFICATIONS.REPLAYABLE, governanceDecision, row, {
        structural_plan_skipped: true,
      }),
      details: { op: row.plan_entry.op ?? null },
    };
  }

  const selMiss = myFindings.find((f) => f.kind === "selector_missing");
  if (selMiss) {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.SELECTOR_MISSING,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(
        CLASSIFICATIONS.SELECTOR_MISSING,
        governanceDecision,
        row,
        { detail: selMiss },
      ),
      details: selMiss,
    };
  }

  const stale = myFindings.find((f) => f.kind === "stale_selector");
  if (stale) {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.STALE_SELECTOR,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(
        CLASSIFICATIONS.STALE_SELECTOR,
        governanceDecision,
        row,
        { detail: stale },
      ),
      details: stale,
    };
  }

  const superseded = findings.find(
    (f) => f && f.kind === "superseded_transform" && f.superseded_patch_index === patchIndex,
  );
  if (superseded) {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.SUPERSEDED_TRANSFORM,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(
        CLASSIFICATIONS.SUPERSEDED_TRANSFORM,
        governanceDecision,
        row,
        { detail: superseded },
      ),
      details: superseded,
    };
  }

  const already = myFindings.find((f) => f.kind === "already_applied");
  if (already) {
    return {
      patch_index: patchIndex,
      path: row?.path ?? null,
      classification: CLASSIFICATIONS.ALREADY_APPLIED,
      governance_linkage: governanceLinkage(governanceDecision),
      replay_confidence: buildReplayConfidence(
        CLASSIFICATIONS.ALREADY_APPLIED,
        governanceDecision,
        row,
        { detail: already },
      ),
      details: already,
    };
  }

  return {
    patch_index: patchIndex,
    path: row?.path ?? null,
    classification: CLASSIFICATIONS.REPLAYABLE,
    governance_linkage: governanceLinkage(governanceDecision),
    replay_confidence: buildReplayConfidence(CLASSIFICATIONS.REPLAYABLE, governanceDecision, row, {}),
    details: null,
  };
}

/**
 * @param {object[]} rows
 * @param {{ staleReport?: object, runDistinctFiles?: number, minScoreRequired?: number }} ctx
 */
function classifyAllStructuralReplayRows(rows, ctx) {
  const findings = ctx?.staleReport?.findings || [];

  return (Array.isArray(rows) ? rows : []).map((row) =>
    classifyStructuralReplayRow(row, {
      staleFindings: findings,
      runDistinctFiles: ctx?.runDistinctFiles,
      minScoreRequired: ctx?.minScoreRequired,
    }),
  );
}

module.exports = {
  CLASSIFICATIONS,
  classifyStructuralReplayRow,
  classifyAllStructuralReplayRows,
};
