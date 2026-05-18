"use strict";

const COMPLEXITY_LABEL_PT = { low: "Baixa", medium: "Média", high: "Alta" };
const COMPLEXITY_WORD_PT = { low: "baixa", medium: "média", high: "alta" };

/** Prefixo de frase completa legada — remover ao normalizar. */
const EVALUATED_PREFIX_RE =
  /^a\s+tarefa\s+foi\s+avaliada\s+como\s+(?:baixa|m[eé]dia|alta)\s+porque\s+/i;

/**
 * Extrai motivo puro (sem prefixo «A tarefa foi avaliada…»), inclusive duplicações legadas.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function extractComplexityReason(raw) {
  let t = String(raw || "").trim();
  if (!t) return null;
  let prev;
  do {
    prev = t;
    t = t.replace(EVALUATED_PREFIX_RE, "").trim();
  } while (t !== prev && EVALUATED_PREFIX_RE.test(t));
  t = t.replace(/^porque\s+/i, "").trim();
  return t || null;
}

/**
 * @param {"low"|"medium"|"high"} level
 */
function defaultComplexityReason(level) {
  if (level === "low") return "escopo reduzido e entregas pontuais";
  if (level === "high") return "escopo amplo com várias frentes de trabalho";
  return "entregas coordenadas de complexidade moderada";
}

/**
 * @param {string[]} factors
 * @param {"low"|"medium"|"high"} level
 * @param {{ visualOnlyQualified?: boolean }} [options]
 */
function buildReasonFromFactors(factors, level, options = {}) {
  const list = (factors || []).filter(Boolean);
  if (list.length) {
    let reason = `envolve ${list.join(", ")}`;
    if (options.visualOnlyQualified && level === "medium") {
      reason += ", sem backend, persistência ou comunicação em tempo real";
    }
    return reason;
  }
  return defaultComplexityReason(level);
}

/**
 * Único ponto que monta a frase completa para exibição.
 *
 * @param {"low"|"medium"|"high"} level
 * @param {string|null|undefined} reason
 * @param {string|null|undefined} [levelLabelPt]
 */
function formatComplexitySentence(level, reason, levelLabelPt) {
  const word = COMPLEXITY_WORD_PT[level] || "média";
  const pure =
    extractComplexityReason(reason) ||
    (reason ? String(reason).trim() : null) ||
    defaultComplexityReason(level);
  let because = pure.charAt(0).toLowerCase() + pure.slice(1);
  because = because.replace(/[.!?]+\s*$/, "").trim();
  because = because.replace(/^porque\s+/i, "").trim();
  return `A tarefa foi avaliada como ${word} porque ${because}.`;
}

/**
 * @param {"low"|"medium"|"high"} level
 * @param {string|null|undefined} rawReason
 */
function buildComplexityPayload(level, rawReason) {
  const reason =
    extractComplexityReason(rawReason) ||
    (rawReason ? String(rawReason).trim() : null) ||
    null;
  return {
    level,
    levelLabelPt: COMPLEXITY_LABEL_PT[level] || "Média",
    reason,
    /** Legado: mesmo valor que `reason` (motivo puro, sem prefixo). */
    explanation: reason,
  };
}

/**
 * Normaliza objeto complexity vindo de API/planos antigos.
 * @param {object|null|undefined} complexity
 */
function normalizeComplexityObject(complexity) {
  if (!complexity || typeof complexity !== "object") return complexity;
  const level =
    complexity.level === "low" ||
    complexity.level === "medium" ||
    complexity.level === "high"
      ? complexity.level
      : "medium";
  const raw = complexity.reason ?? complexity.explanation;
  const reason =
    extractComplexityReason(raw) ||
    (raw ? String(raw).trim() : null) ||
    null;
  return {
    ...complexity,
    level,
    levelLabelPt:
      complexity.levelLabelPt || COMPLEXITY_LABEL_PT[level] || "Média",
    reason,
    explanation: reason,
  };
}

/**
 * @param {{ reason?: string|null, explanation?: string|null, level: string }} complexity
 * @param {() => string} [fallback]
 */
function resolveComplexityReason(complexity, fallback) {
  const raw = complexity?.reason ?? complexity?.explanation;
  const pure = extractComplexityReason(raw) || (raw ? String(raw).trim() : null);
  if (pure) return pure;
  if (fallback) return fallback();
  const level = complexity?.level;
  if (level === "low" || level === "medium" || level === "high") {
    return defaultComplexityReason(level);
  }
  return defaultComplexityReason("medium");
}

module.exports = {
  COMPLEXITY_LABEL_PT,
  COMPLEXITY_WORD_PT,
  EVALUATED_PREFIX_RE,
  extractComplexityReason,
  defaultComplexityReason,
  buildReasonFromFactors,
  formatComplexitySentence,
  buildComplexityPayload,
  normalizeComplexityObject,
  resolveComplexityReason,
};
