"use strict";

const { applyPatchToContent } = require("../../patch-content");
const { isStructuralGovernanceEnabled } = require("../feature-flags");
const { evaluateGovernanceStructuralPreemption } = require("../governance/structural-governance-gate");
const {
  computeSearchMultiplicity,
} = require("./transform-plan-builder");

function normalizeEOL(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/**
 * Aplica replace_node MVP (somente substring do span AST) sobre o texto corrente.
 * @returns {string}
 */
function applyStructuralReplaceNode(beforeSource, planEntry) {
  const cur = String(beforeSource ?? "");
  const ns = planEntry.node_span;
  const search = planEntry.search;
  const replace = planEntry.replace;

  if (
    !ns ||
    typeof ns.start !== "number" ||
    typeof ns.end !== "number" ||
    ns.end <= ns.start
  ) {
    throw new Error("structural_gate: spans MVP inválidos");
  }

  const inner = cur.slice(ns.start, ns.end);

  const nextInner = applyPatchToContent(inner, search, replace);
  return cur.slice(0, ns.start) + nextInner + cur.slice(ns.end);
}

/**
 * @param {object|null|undefined} planEntry
 * @param {number} minConfidenceFraction 0–1 vs score 0–100
 * @param {string} before
 * @param {{ search: string }} change
 */
function evaluateStructuralExecutionGate(planEntry, minConfidenceFraction, before, change) {
  /** @type {string[]} */
  const block_reasons = [];
  const minScore = Math.min(100, Math.max(0, Math.round(minConfidenceFraction * 100)));

  if (!planEntry || planEntry.op !== "replace_node") {
    block_reasons.push("not_replace_node_plan");
    return {
      allowed: false,
      block_reasons,
      plan_entry_summary: summarizePlan(planEntry),
      confidence_score: planEntry?.confidence_score ?? null,
      min_score_required: minScore,
    };
  }

  if (planEntry.mapping_status !== "mapped") {
    block_reasons.push("mapping_not_unique_minspan");
  }

  if (planEntry.shadow_confidence?.degraded_from_ambiguous_pick) {
    block_reasons.push("shadow_confidence_degraded");
  }

  const score = typeof planEntry.confidence_score === "number" ? planEntry.confidence_score : 0;

  if (score < minScore) {
    block_reasons.push("confidence_below_threshold");
  }

  if (!planEntry.search_geometry?.search_fully_inside_chosen_node_span) {
    block_reasons.push("patch_bounds_not_fully_inside_mvp_span");
  }

  const sms = planEntry.search_match_stats;

  if (!sms || sms.literal_matches !== 1 || sms.normalized_matches !== 1) {
    block_reasons.push("search_not_unique_in_file");
  }

  const ns = planEntry.node_span;
  const sg = String(change.search ?? "");

  if (sg && ns && typeof ns.start === "number" && typeof ns.end === "number" && ns.end > ns.start) {
    const inner = String(before ?? "").slice(ns.start, ns.end);
    const inM = computeSearchMultiplicity(inner, sg);

    if (inM.literal_matches !== 1) block_reasons.push("search_not_unique_in_mvp_inner");
  }

  return {
    allowed: block_reasons.length === 0,
    block_reasons,
    plan_entry_summary: summarizePlan(planEntry),
    confidence_score: score,
    min_score_required: minScore,
  };
}

/** @param {object|null|undefined} p */
function summarizePlan(p) {
  if (!p) return null;

  return {
    op: p.op ?? null,
    node_kind: p.node_kind ?? null,
    mapping_status: p.mapping_status ?? null,
    confidence_score: p.confidence_score ?? null,
  };
}

/**
 * @param {{
 *   buildPlan: () => { entries: object[] },
 *   before: string,
 *   change: { search: string, replace: string },
 *   minConfidenceFraction: number,
 *   relativePath: string,
 *   applyStructuralReplaceNode?: (beforeSource: string, planEntry: object) => string,
 * }} o
 */
function resolveStructuralOrTextualPatch(o) {
  const planEntry = o.buildPlan().entries[0] || null;
  const gate = evaluateStructuralExecutionGate(
    planEntry,
    o.minConfidenceFraction,
    o.before,
    o.change,
  );

  const textualAfter = applyPatchToContent(
    o.before,
    o.change.search,
    o.change.replace,
  );

  const applyStructural =
    typeof o.applyStructuralReplaceNode === "function"
      ? o.applyStructuralReplaceNode
      : applyStructuralReplaceNode;

  if (isStructuralGovernanceEnabled()) {
    const preempt = evaluateGovernanceStructuralPreemption(planEntry, o.change, o.before);
    if (preempt.forceTextual) {
      return {
        after: textualAfter,
        execution_mode_used: "textual",
        fallback_reason: preempt.reasons.join(";"),
        fallback_reason_codes: preempt.codes,
        fallback_trigger: "governance_escalation",
        gate_snapshot: gate,
        plan_entry: planEntry,
        governance_preempt: preempt,
      };
    }
  }

  if (!gate.allowed) {
    const codes = gate.block_reasons.slice();
    return {
      after: textualAfter,
      execution_mode_used: "textual",
      fallback_reason: codes.join(";"),
      fallback_reason_codes: codes,
      fallback_trigger: "gate",
      gate_snapshot: gate,
      plan_entry: planEntry,
    };
  }

  try {
    const structuralAfter = applyStructural(o.before, planEntry);

    if (normalizeEOL(structuralAfter) !== normalizeEOL(textualAfter)) {
      return {
        after: textualAfter,
        execution_mode_used: "textual",
        fallback_reason:
          "structural_textual_post_verify_mismatch — o resultado estrutural não coincide com o patch textual após normalização EOL (divergência structural/textual)",
        fallback_reason_codes: ["structural_textual_post_verify_mismatch"],
        fallback_trigger: "divergence",
        gate_snapshot: gate,
        plan_entry: planEntry,
      };
    }

    return {
      after: structuralAfter,
      execution_mode_used: "structural",
      fallback_reason: null,
      fallback_reason_codes: null,
      fallback_trigger: "none",
      gate_snapshot: gate,
      plan_entry: planEntry,
    };
  } catch (eZ) {
    const msg = eZ instanceof Error ? eZ.message : String(eZ);
    const code = "structural_apply_error";
    return {
      after: textualAfter,
      execution_mode_used: "textual",
      fallback_reason: `${code}:${msg}`,
      fallback_reason_codes: [code],
      fallback_trigger: "apply_exception",
      gate_snapshot: gate,
      plan_entry: planEntry,
    };
  }
}

module.exports = {
  applyStructuralReplaceNode,
  evaluateStructuralExecutionGate,
  resolveStructuralOrTextualPatch,
  normalizeEOL,
};
