"use strict";

const assert = require("assert");
const {
  isMetaPlanPhrase,
  isInternalOperationalLine,
} = require("../../../../core/generate-full-updated-plan-presentation.js");
const { formatComplexitySentence } = require("../../../../core/operational-plan-complexity.js");
const { OPERATIONAL_PLAN_SCHEMA_VERSION } = require("../../../../core/operational-plan-staleness.js");

/**
 * @param {object|null|undefined} plan
 */
function collectLines(plan) {
  if (!plan?.presentation && plan?.understanding) {
    return collectLines({ presentation: plan });
  }
  const p = plan?.presentation || plan;
  if (!p) return [];
  return [
    p.understanding?.summary,
    p.understanding?.mainObjective,
    ...(p.whatWillBeDone || []),
    ...(p.whatWillChange || []),
    ...(p.outOfScope || []),
    ...(p.completionCriteria || []),
    p.complexity?.reason,
    formatComplexitySentence(p.complexity?.level, p.complexity?.reason),
    p.executionRecommendation?.explanation,
    ...(p.risks || []).map((r) => (typeof r === "string" ? r : r?.label)),
  ].filter(Boolean);
}

/**
 * @param {object} presentation
 * @param {{ expectButton?: boolean, label?: string }} [opts]
 */
function assertCanonicalChatPlan(presentation, opts = {}) {
  const label = opts.label ? `${opts.label}: ` : "";
  assert.ok(presentation?.hasContent, `${label}hasContent`);

  const corpus = collectLines({ presentation }).join(" ");
  assert.match(corpus, /tema/i, `${label}tema`);
  assert.ok(
    (presentation.outOfScope || []).length >= 3,
    `${label}outOfScope (${presentation.outOfScope?.length})`,
  );
  assert.equal(
    presentation.complexity?.level,
    "medium",
    `${label}complexity.level`,
  );

  const reason = presentation.complexity?.reason || "";
  assert.ok(reason.length >= 12, `${label}complexity.reason`);
  assert.ok(
    !/^a\s+tarefa\s+foi\s+avaliada/i.test(reason),
    `${label}reason sem prefixo legado`,
  );

  const crit = presentation.completionCriteria || [];
  assert.ok(crit.length >= 2, `${label}critérios`);
  assert.ok(
    crit.some((c) => /tema/i.test(String(c))),
    `${label}critério com tema`,
  );

  if (opts.expectButton) {
    const done = (presentation.whatWillBeDone || []).join(" ");
    assert.match(done, /botão/i, `${label}botão`);
    assert.match(done, /abrir|fechar/i, `${label}abrir/fechar`);
  }

  for (const line of collectLines({ presentation })) {
    assert.equal(
      isInternalOperationalLine(String(line)),
      false,
      `${label}linha interna: ${line}`,
    );
    assert.equal(
      isMetaPlanPhrase(String(line)),
      false,
      `${label}meta: ${line}`,
    );
  }

  const sentence = formatComplexitySentence(
    presentation.complexity.level,
    presentation.complexity.reason,
  );
  const occurrences = (corpus.match(/A tarefa foi avaliada como/gi) || []).length;
  assert.ok(occurrences <= 1, `${label}duplicação complexity (${occurrences})`);
  assert.ok(sentence.includes("média") || sentence.includes("media"), label);
}

/**
 * @param {object|null|undefined} doc updated-plan doc
 * @param {{ expectButton?: boolean, label?: string }} [opts]
 */
function assertUpdatedPlanDoc(doc, opts = {}) {
  assert.ok(doc, `${opts.label || ""} updatedPlan ausente`);
  assert.equal(doc.schemaVersion, OPERATIONAL_PLAN_SCHEMA_VERSION, "schemaVersion");
  assert.equal(doc.canonicalized, true, "canonicalized");
  assertCanonicalChatPlan(doc.presentation, opts);
}

module.exports = {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  assertCanonicalChatPlan,
  assertUpdatedPlanDoc,
  collectLines,
};
