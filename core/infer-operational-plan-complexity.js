"use strict";

const { stripAccents } = require("./normalize-operational-plan-language.js");

/** UI avançada — pode manter ou elevar para alta mesmo em escopo visual. */
const ADVANCED_UI_RE =
  /\b(canvas|drag\s*-?\s*drop|arrastar\s+e\s+soltar|virtualiza[cç][aã]o|editor\s+(rico|visual\s+avan)|gr[aá]ficos?\s+interativ|anima[cç][õo]es?\s+complex|renderiza[cç][aã]o\s+massiva|milhares\s+de\s+itens|multi-?estado\s+avan|sincroniza[cç][aã]o\s+(de\s+)?estado|performance\s+cr[ií]tica|layout\s+engine)\b/i;

/** Implementação funcional pesada no escopo (não só fora). */
const FUNCTIONAL_IN_SCOPE_RE =
  /\b(implementar|criar|desenvolver|integrar|adicionar).{0,48}(backend|api\s+real|servidor|websocket|persist[eê]ncia|microservi[cç]o|tempo\s+real|realtime|filas?|kafka|sincroniza[cç][aã]o\s+em\s+tempo)\b/i;

const FUNCTIONAL_KEYWORDS_RE =
  /\b(backend|websocket|persist[eê]ncia|microservi[cç]o|tempo\s+real|realtime|api\s+externa|envio\s+real\s+de\s+mensagens|sincroniza[cç][aã]o|orquestra[cç][aã]o\s+distribu)\b/i;

/**
 * @param {string} text
 */
function normalizeCorpus(text) {
  return stripAccents(String(text || "").toLowerCase());
}

/**
 * @param {string} corpus
 * @param {string[]} whatWillBeDone
 */
function hasFunctionalWorkInScope(corpus, whatWillBeDone) {
  const done = normalizeCorpus((whatWillBeDone || []).join(" "));
  if (FUNCTIONAL_IN_SCOPE_RE.test(done)) return true;
  if (FUNCTIONAL_KEYWORDS_RE.test(done) && !/\b(sem|fora|n[aã]o|apenas\s+visual|somente\s+visual)\b/.test(done)) {
    return true;
  }
  return FUNCTIONAL_IN_SCOPE_RE.test(corpus);
}

/**
 * @param {string} corpus
 * @param {string[]} whatWillBeDone
 */
function hasAdvancedUiSignals(corpus, whatWillBeDone) {
  const done = normalizeCorpus((whatWillBeDone || []).join(" "));
  return ADVANCED_UI_RE.test(corpus) || ADVANCED_UI_RE.test(done);
}

/**
 * Contribuição de entregáveis visuais sem dupla contagem chat+botão+integração.
 * @param {{ chat: boolean, button: boolean, integrate: boolean }} flags
 * @param {number} deliverableCount
 */
function visualDeliverableWeight(flags, deliverableCount) {
  let weight = 0;
  if (flags.chat) weight += 1;
  if (flags.button) weight += 1;
  if (flags.integrate) {
    weight += flags.chat && flags.button ? 0.25 : 1;
  }
  const extra = Math.max(0, deliverableCount - (flags.chat ? 1 : 0) - (flags.button ? 1 : 0) - (flags.integrate ? 1 : 0));
  weight += Math.min(extra, 1);
  return weight;
}

/**
 * @param {string[]} factors
 * @param {"low"|"medium"|"high"} level
 * @param {{ visualOnlyQualified?: boolean }} [options]
 */
function buildComplexityFactorsReason(factors, level, options = {}) {
  const list = (factors || []).filter(Boolean);
  if (!list.length) {
    if (level === "low") return "escopo reduzido e entregas pontuais";
    if (level === "high") return "escopo amplo com várias frentes de trabalho";
    return "entregas coordenadas de complexidade moderada";
  }
  let reason = `envolve ${list.join(", ")}`;
  if (options.visualOnlyQualified && level === "medium") {
    reason += ", sem backend, persistência ou comunicação em tempo real";
  }
  return reason;
}

/**
 * @param {{
 *   flags: { chat: boolean, button: boolean, integrate: boolean, responsive: boolean, theme: boolean, reusable: boolean },
 *   deliverableCount: number,
 *   visualOnly: boolean,
 *   sourceLines?: string[],
 *   whatWillBeDone?: string[],
 *   outOfScope?: string[],
 * }} input
 * @returns {{ level: "low"|"medium"|"high", factors: string[], visualOnlyQualified: boolean }}
 */
function inferCanonicalComplexity(input) {
  const flags = input.flags || {};
  const deliverableCount = Number(input.deliverableCount) || 0;
  const visualOnly = Boolean(input.visualOnly);
  const whatWillBeDone = input.whatWillBeDone || [];
  const corpus = normalizeCorpus(
    [...(input.sourceLines || []), ...whatWillBeDone, ...(input.outOfScope || [])].join(
      " ",
    ),
  );

  /** @type {string[]} */
  const factors = [];

  if (deliverableCount >= 2 || (flags.chat && flags.button)) {
    factors.push("criação de componentes visuais reutilizáveis");
  } else if (deliverableCount >= 1 || flags.chat || flags.button) {
    factors.push("criação de componente visual dedicado");
  }
  if (flags.integrate || (flags.chat && flags.button)) {
    factors.push("integração na tela de Integrações");
  }
  if (flags.responsive) factors.push("validação de responsividade");
  if (flags.theme) factors.push("validação de tema claro/escuro");

  const functionalInScope = hasFunctionalWorkInScope(corpus, whatWillBeDone);
  const advancedUi = hasAdvancedUiSignals(corpus, whatWillBeDone);

  if (functionalInScope) {
    if (!factors.some((f) => /backend|persist|websocket|tempo real/i.test(f))) {
      factors.push("implementação ou integração funcional no escopo");
    }
    return { level: "high", factors, visualOnlyQualified: false };
  }

  if (advancedUi) {
    if (!factors.some((f) => /avançad|canvas|editor/i.test(f))) {
      factors.push("interface visual avançada com maior complexidade técnica");
    }
    return { level: "high", factors, visualOnlyQualified: false };
  }

  if (visualOnly) {
    const uiWeight = visualDeliverableWeight(flags, deliverableCount);
    const qualityWeight =
      (flags.responsive ? 0.35 : 0) + (flags.theme ? 0.35 : 0) + (flags.reusable ? 0.15 : 0);
    const score = uiWeight + qualityWeight;

    let level = "medium";
    if (score <= 1 && !flags.integrate && !flags.responsive && !flags.theme) {
      level = "low";
    }

    return {
      level,
      factors,
      visualOnlyQualified: level === "medium",
    };
  }

  const uiWeight = visualDeliverableWeight(flags, deliverableCount);
  const qualityWeight = (flags.responsive ? 1 : 0) + (flags.theme ? 1 : 0);
  const score = uiWeight + qualityWeight + (flags.integrate ? 1 : 0);

  let level = "medium";
  if (score <= 1 && !flags.integrate) level = "low";
  if (score >= 5 || deliverableCount >= 5) level = "high";

  return { level, factors, visualOnlyQualified: false };
}

module.exports = {
  ADVANCED_UI_RE,
  FUNCTIONAL_IN_SCOPE_RE,
  inferCanonicalComplexity,
  buildComplexityFactorsReason,
  visualDeliverableWeight,
  hasFunctionalWorkInScope,
  hasAdvancedUiSignals,
};
