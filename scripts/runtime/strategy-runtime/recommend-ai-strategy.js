"use strict";

const fs = require("fs");
const path = require("path");

const { loadApprovalState } = require("../clarification/approval");

const PLAN_REFINED = "task-plan-refined.md";

/** @type {readonly ("basic"|"standard"|"expert")[]} */
const MODES = Object.freeze(["basic", "standard", "expert"]);

/**
 * @param {string} m
 * @returns {m is "basic"|"standard"|"expert"}
 */
function isMode(m) {
  return MODES.includes(/** @type {"basic"|"standard"|"expert"} */ (m));
}

/**
 * @param {"basic"|"standard"|"expert"} mode
 */
function buildRecommendedUsage(mode) {
  if (mode === "basic") {
    return {
      architect: "standard",
      executor: "basic",
      review: "basic",
      correction: "basic",
    };
  }
  if (mode === "expert") {
    return {
      architect: "expert",
      executor: "standard",
      review: "expert",
      correction: "expert",
    };
  }
  return {
    architect: "standard",
    executor: "standard",
    review: "standard",
    correction: "standard",
  };
}

/**
 * @param {"basic"|"standard"|"expert"} mode
 */
function profilesForMode(mode) {
  if (mode === "basic") {
    return { cost_profile: "low", quality_profile: "economy" };
  }
  if (mode === "expert") {
    return { cost_profile: "high", quality_profile: "maximum" };
  }
  return { cost_profile: "balanced", quality_profile: "balanced" };
}

/**
 * @param {Record<string, unknown>} complexityDoc
 * @param {string} planText
 */
function decideRecommendedMode(complexityDoc, planText) {
  const scores = complexityDoc.scores;
  const s =
    scores && typeof scores === "object" && !Array.isArray(scores)
      ? /** @type {Record<string, unknown>} */ (scores)
      : {};
  const overall = Number(s.overall);
  const risk = Number(s.risk);
  const contextPressure = Number(s.context_pressure);
  const classification = String(complexityDoc.classification || "");

  /** @type {string[]} */
  const rationale = [];

  let mode = "standard";
  if (overall <= 3) {
    mode = "basic";
    rationale.push("baseline:overall<=3→basic");
  } else if (overall >= 7) {
    mode = "expert";
    rationale.push("baseline:overall>=7→expert");
  } else {
    rationale.push("baseline:overall4-6→standard");
  }

  const forceExpert =
    classification === "critical" ||
    risk >= 7 ||
    (contextPressure >= 7 && risk >= 5);

  if (forceExpert) {
    mode = "expert";
    if (classification === "critical") rationale.push("regra:classificacao_critical→expert");
    if (risk >= 7) rationale.push("regra:risco>=7→expert");
    if (contextPressure >= 7 && risk >= 5) {
      rationale.push("regra:pressao_contexto>=7_e_risco>=5→expert");
    }
  } else if (overall <= 3 && risk <= 3) {
    mode = "basic";
    rationale.push("regra:overall<=3_e_risco<=3→basic");
  }

  if (planText.length > 6000) {
    rationale.push("sinal:task_plan_refined_grande");
  }

  return { mode: /** @type {"basic"|"standard"|"expert"} */ (mode), rationale };
}

/**
 * @param {string} outputDirAbs
 * @param {Record<string, unknown>} complexityDoc
 * @returns {{ ok: true, doc: Record<string, unknown> } | { ok: false, error: { code: string, message: string } }}
 */
function recommendAiStrategy(outputDirAbs, complexityDoc) {
  const root = path.resolve(outputDirAbs);
  let planText = "";
  try {
    const p = path.join(root, PLAN_REFINED);
    if (fs.existsSync(p)) {
      planText = fs.readFileSync(p, "utf-8");
    }
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return { ok: false, error: { code: "AI_STRATEGY_PLAN_READ", message: msg } };
  }

  let { mode, rationale } = decideRecommendedMode(complexityDoc, planText);
  const approval = loadApprovalState(root);
  if (approval.ok) {
    const operatorMode = String(
      /** @type {Record<string, unknown>} */ (approval.doc).operator_recommended_mode || "",
    ).trim();
    if (isMode(operatorMode)) {
      mode = operatorMode;
      rationale = [
        ...(Array.isArray(rationale) ? rationale : []),
        "Modo confirmado pelo operador na aprovação do plano.",
      ];
    }
  }
  if (!isMode(mode)) {
    return {
      ok: false,
      error: {
        code: "AI_STRATEGY_INVALID_MODE",
        message: `Modo recomendado inválido: ${String(mode)}`,
      },
    };
  }

  const { cost_profile, quality_profile } = profilesForMode(mode);
  const recommended_usage = buildRecommendedUsage(mode);

  const doc = {
    version: 1,
    phase: "3.3",
    status: "ai_strategy_completed",
    recommended_mode: mode,
    rationale,
    cost_profile,
    quality_profile,
    recommended_usage,
  };

  return { ok: true, doc };
}

module.exports = {
  recommendAiStrategy,
  decideRecommendedMode,
  buildRecommendedUsage,
  profilesForMode,
};
