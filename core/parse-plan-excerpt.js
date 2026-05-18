"use strict";

const { parseTaskPlanMarkdown } = require("./parse-task-plan-markdown.js");

/**
 * Converte extracto de plano (formato UI ou markdown) em estrutura parcial para geração de v2.
 * @param {string} excerpt
 */
function parsePlanExcerpt(excerpt) {
  const text = String(excerpt || "").trim();
  /** @type {{
   *   summary: string|null,
   *   mainObjective: string|null,
   *   whatWillBeDone: string[],
   *   whatWillChange: string[],
   *   outOfScope: string[],
   *   completionCriteria: string[],
   * }} */
  const out = {
    summary: null,
    mainObjective: null,
    whatWillBeDone: [],
    whatWillChange: [],
    outOfScope: [],
    completionCriteria: [],
  };
  if (!text) return out;

  if (/^##\s+/m.test(text)) {
    const md = parseTaskPlanMarkdown(text);
    out.summary = md.summary;
    out.mainObjective = md.objective;
    out.whatWillBeDone = md.executionOrder;
    out.outOfScope = md.outOfScope;
    out.completionCriteria = md.completionCriteria;
    return out;
  }

  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("Resumo:")) {
      out.summary = trimmed.slice("Resumo:".length).trim() || null;
      continue;
    }
    if (trimmed.startsWith("Objetivo:")) {
      out.mainObjective = trimmed.slice("Objetivo:".length).trim() || null;
      continue;
    }
    const listMatch = trimmed.match(
      /^(O que será feito|O que será alterado|Fora do escopo|Critérios):\n([\s\S]*)$/i,
    );
    if (listMatch) {
      const items = listMatch[2]
        .split("\n")
        .map((l) => l.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);
      const label = listMatch[1].toLowerCase();
      if (label.includes("feito")) out.whatWillBeDone = items;
      else if (label.includes("alterado")) out.whatWillChange = items;
      else if (label.includes("fora")) out.outOfScope = items;
      else out.completionCriteria = items;
    }
  }
  return out;
}

module.exports = {
  parsePlanExcerpt,
};
