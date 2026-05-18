"use strict";

const { detectVisualOnlyScope } = require("./normalize-operational-plan-language.js");
const {
  isInternalOperationalLine,
  isMetaPlanPhrase,
} = require("./sanitize-operational-plan-content.js");
const {
  extractComplexityReason,
  EVALUATED_PREFIX_RE,
} = require("./operational-plan-complexity.js");

/** Versão do schema de planos persistidos (updated-plan, snapshot base). */
const OPERATIONAL_PLAN_SCHEMA_VERSION = 2;

/**
 * @param {object|null|undefined} plan
 */
function collectPlanCorpus(plan) {
  if (!plan || typeof plan !== "object") return [];
  /** @type {string[]} */
  const lines = [];
  const push = (v) => {
    const t = String(v || "").trim();
    if (t) lines.push(t);
  };
  push(plan.understanding?.summary);
  push(plan.understanding?.mainObjective);
  for (const x of plan.whatWillBeDone || []) push(x);
  for (const x of plan.whatWillChange || []) push(x);
  for (const x of plan.outOfScope || []) push(x);
  for (const x of plan.completionCriteria || []) push(x);
  push(plan.complexity?.reason);
  push(plan.complexity?.explanation);
  push(plan.executionRecommendation?.explanation);
  push(plan.executionStrategy?.approach);
  for (const x of plan.executionStrategy?.macroOrder || []) push(x);
  for (const r of plan.risks || []) {
    push(typeof r === "string" ? r : r?.label);
  }
  for (const t of plan.miniTasks?.tasks || []) push(t?.title);
  return lines;
}

/**
 * @param {object|null|undefined} plan
 */
function planSignalsTheme(plan) {
  const joined = collectPlanCorpus(plan).join(" ");
  return /tema\s+claro|claro\s*\/\s*escuro|tema\s+claro\s+e\s+escuro|modo\s+claro|modo\s+escuro|dark\s+mode|light\s+mode/i.test(
    joined,
  );
}

/**
 * @param {object|null|undefined} plan
 */
function isPresentationVisualOnly(plan) {
  if (!plan) return false;
  return detectVisualOnlyScope(
    plan.whatWillBeDone || [],
    plan.outOfScope || [],
  );
}

/**
 * @param {string|null|undefined} text
 */
function isLegacyEvaluatedComplexityText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return EVALUATED_PREFIX_RE.test(t);
}

/**
 * @param {object|null|undefined} presentation
 * @param {object|null|undefined} basePlan
 * @param {{ schemaVersion?: number, canonicalized?: boolean }} [meta]
 */
function planV2NeedsRegeneration(presentation, basePlan, meta = {}) {
  if (!presentation || !basePlan?.hasContent) return false;

  const schemaVersion = Number(meta.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < OPERATIONAL_PLAN_SCHEMA_VERSION) {
    return true;
  }
  if (meta.canonicalized !== true) return true;

  if (!presentation.hasContent) return true;

  const lines = collectPlanCorpus(presentation);
  if (lines.some((l) => isInternalOperationalLine(l) || isMetaPlanPhrase(l))) {
    return true;
  }

  const cx = presentation.complexity || {};
  const pureReason =
    extractComplexityReason(cx.reason) || extractComplexityReason(cx.explanation);
  if (!pureReason) return true;
  if (isLegacyEvaluatedComplexityText(cx.reason)) return true;
  if (
    cx.explanation &&
    isLegacyEvaluatedComplexityText(cx.explanation) &&
    cx.explanation.length > (pureReason?.length || 0) + 20
  ) {
    return true;
  }

  const visualOnly = isPresentationVisualOnly(presentation);
  if (visualOnly && cx.level === "high") return true;
  if (
    visualOnly &&
    basePlan.complexity?.level === "medium" &&
    cx.level === "high"
  ) {
    return true;
  }

  if (planSignalsTheme(basePlan) && !planSignalsTheme(presentation)) return true;

  const baseOos = (basePlan.outOfScope || []).length;
  const v2Oos = (presentation.outOfScope || []).length;
  if (baseOos >= 2 && v2Oos === 0) return true;
  if (baseOos >= 3 && v2Oos < Math.min(3, baseOos)) return true;

  const baseCrit = basePlan.completionCriteria || [];
  const v2Crit = presentation.completionCriteria || [];
  const baseCritTheme = baseCrit.some((c) => /tema/i.test(String(c)));
  const v2CritTheme = v2Crit.some((c) => /tema/i.test(String(c)));
  if (baseCritTheme && !v2CritTheme) return true;
  if (baseCrit.length >= 2 && v2Crit.length < baseCrit.length - 1) return true;

  const baseDone = Array.isArray(basePlan.whatWillBeDone)
    ? basePlan.whatWillBeDone
    : [];
  const v2Done = Array.isArray(presentation.whatWillBeDone)
    ? presentation.whatWillBeDone
    : [];
  if (!baseDone.length) return false;

  const kept = baseDone.filter((item) => {
    const needle = String(item).toLowerCase().slice(0, 14);
    return v2Done.some((w) => String(w).toLowerCase().includes(needle));
  });
  if (kept.length === 0) return true;

  return false;
}

/**
 * @param {object|null|undefined} doc normalized updated-plan doc
 * @param {object|null|undefined} basePlan
 */
function updatedPlanDocIsStale(doc, basePlan) {
  if (!doc?.presentation) return true;
  return planV2NeedsRegeneration(doc.presentation, basePlan, {
    schemaVersion: doc.schemaVersion,
    canonicalized: doc.canonicalized,
  });
}

/**
 * @param {object|null|undefined} snapshotDoc
 */
function baseSnapshotDocIsStale(snapshotDoc) {
  if (!snapshotDoc) return false;
  const schemaVersion = Number(snapshotDoc.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < OPERATIONAL_PLAN_SCHEMA_VERSION) {
    return true;
  }
  if (snapshotDoc.canonicalized !== true) return true;
  return false;
}

module.exports = {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  collectPlanCorpus,
  planSignalsTheme,
  isPresentationVisualOnly,
  planV2NeedsRegeneration,
  updatedPlanDocIsStale,
  baseSnapshotDocIsStale,
};
