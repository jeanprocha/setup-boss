"use strict";

/**
 * Extracto estruturado para análise/comentários (espelha a UI).
 * @param {object|null|undefined} plan
 */
function buildPlanExcerptFromPresentation(plan) {
  if (!plan || typeof plan !== "object") return "";
  const parts = [];
  const u = plan.understanding || {};
  if (u.summary) parts.push(`Resumo: ${u.summary}`);
  if (u.mainObjective) parts.push(`Objetivo: ${u.mainObjective}`);
  const wbd = Array.isArray(plan.whatWillBeDone) ? plan.whatWillBeDone : [];
  if (wbd.length) {
    parts.push(`O que será feito:\n${wbd.join("\n")}`);
  }
  const wbc = Array.isArray(plan.whatWillChange) ? plan.whatWillChange : [];
  if (wbc.length) {
    parts.push(`O que será alterado:\n${wbc.join("\n")}`);
  }
  const oos = Array.isArray(plan.outOfScope) ? plan.outOfScope : [];
  if (oos.length) {
    parts.push(`Fora do escopo:\n${oos.join("\n")}`);
  }
  const cc = Array.isArray(plan.completionCriteria) ? plan.completionCriteria : [];
  if (cc.length) {
    parts.push(`Critérios:\n${cc.join("\n")}`);
  }
  return parts.join("\n\n").slice(0, 12_000);
}

module.exports = {
  buildPlanExcerptFromPresentation,
};
