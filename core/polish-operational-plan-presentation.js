"use strict";

const {
  canonicalizeOperationalPlanFromPresentation,
} = require("./canonicalize-operational-plan.js");
const {
  renderOperationalPlanHumanized,
} = require("./render-operational-plan-humanized.js");
const {
  isInternalOperationalLine,
  filterOperationalPlanLines,
} = require("./sanitize-operational-plan-content.js");
const { normalizeComplexityObject } = require("./operational-plan-complexity.js");

/**
 * Pré-filtro mínimo antes da canonicalização (remove lixo interno óbvio).
 * @param {object|null} presentation
 */
function prefilterPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return presentation;
  const p = { ...presentation };

  if (p.understanding) {
    const u = { ...p.understanding };
    if (u.summary && isInternalOperationalLine(u.summary)) u.summary = null;
    if (u.mainObjective && isInternalOperationalLine(u.mainObjective)) {
      u.mainObjective = null;
    }
    p.understanding = u;
  }

  p.whatWillBeDone = filterOperationalPlanLines(
    Array.isArray(p.whatWillBeDone) ? p.whatWillBeDone : [],
  );
  p.whatWillChange = filterOperationalPlanLines(
    Array.isArray(p.whatWillChange) ? p.whatWillChange : [],
  );
  p.outOfScope = filterOperationalPlanLines(
    Array.isArray(p.outOfScope) ? p.outOfScope : [],
  );

  return p;
}

/**
 * Pipeline: origem → estrutura canônica → renderização humanizada (sem remendar texto cru).
 *
 * @param {object|null|undefined} presentation
 */
function polishOperationalPlanPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return presentation;

  const prefiltered = prefilterPresentation(presentation);
  const canonical = canonicalizeOperationalPlanFromPresentation(prefiltered);
  if (!canonical) return presentation;

  const rendered = renderOperationalPlanHumanized(canonical, presentation);
  if (!rendered) return presentation;
  if (rendered.complexity) {
    rendered.complexity = normalizeComplexityObject(rendered.complexity);
  }
  return rendered;
}

module.exports = {
  polishOperationalPlanPresentation,
  prefilterPresentation,
};
