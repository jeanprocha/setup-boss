"use strict";

/** PT-PT → PT-BR e termos operacionais padronizados. */
const PT_PT_TO_BR = [
  [/ecr[aã]s/gi, "telas"],
  [/ecr[aã]/gi, "tela"],
  [/\bficheiros?\b/gi, "arquivos"],
  [/\butilizadores?\b/gi, "usuários"],
  [/\butilizador\b/gi, "usuário"],
  [/\bqueres\b/gi, "você deseja"],
  [/\bconclusão\s+explícita\b/gi, "conclusão"],
  [/\bvalidação\s+por\s+testes\s+no\s+critério\s+de\s+conclusão\b/gi, "validação por testes"],
  [/\bdiferentes\s+tamanhos\s+de\s+ecrã\b/gi, "diferentes tamanhos de tela"],
  [/\bdiferentes\s+tamanhos\s+de\s+tela\b/gi, "desktop e mobile"],
  [/\bfecho\b/gi, "fechamento"],
  [/\babertura e fecho\b/gi, "abertura e fechamento"],
];

const BROKEN_PREFIX =
  /^Será\s+(desenvolvido|criado|implementado|adicionado)\s+(criar|implementar|desenvolver|adicionar|integrar)\s+/i;

const PARTICIPLE = {
  criar: "criado",
  implementar: "implementado",
  desenvolver: "desenvolvido",
  adicionar: "adicionado",
  integrar: "integrada",
};

/**
 * @param {string} s
 */
function stripAccents(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} text
 */
function normalizeOperationalPhrase(text) {
  let t = String(text || "").trim();
  if (!t) return "";

  for (const [re, rep] of PT_PT_TO_BR) {
    t = t.replace(re, rep);
  }

  const broken = BROKEN_PREFIX.exec(t);
  if (broken) {
    const part = PARTICIPLE[broken[2].toLowerCase()] || "realizado";
    t = t.replace(BROKEN_PREFIX, `Será ${part} `);
  }

  t = t
    .replace(/\bna área de tela de\s+/gi, "na tela de ")
    .replace(/\bna área de\s+/gi, "na ")
    .replace(/\btela de integrações\b/gi, "tela de Integrações")
    .replace(/\bintegrações\b/gi, (match, offset, full) => {
      const before = full.slice(Math.max(0, offset - 14), offset).toLowerCase();
      return before.includes("tela de") ? "Integrações" : match;
    })
    .replace(/\s+/g, " ")
    .trim();

  if (t && !/[.!?]$/.test(t) && t.length > 40) {
    t += ".";
  }

  return t;
}

/**
 * @param {string[]} whatWillBeDone
 * @param {string[]} outOfScope
 */
function detectVisualOnlyScope(whatWillBeDone, outOfScope) {
  const done = (whatWillBeDone || []).join(" ").toLowerCase();
  const out = (outOfScope || []).join(" ").toLowerCase();
  const visual =
    /visual|componente|interface|ui\b|layout|mock|\bchat\b/i.test(done);
  const excludesReal =
    /funcionalidade real|backend|persist|websocket|mensagens|api externa|envio real|sem\s+funcional|apenas\s+visual|somente\s+visual/i.test(
      out,
    );
  const backendInScope = /backend|websocket|persistência|api\s+real|envio\s+real/i.test(
    done,
  );
  if (!visual || backendInScope) return false;
  if (excludesReal) return true;
  const chatVisual =
    /\bchat\b/.test(done) &&
    /visual|componente|interface|ui\b|reutiliz|bot[aã]o/i.test(done);
  if (chatVisual) return true;
  if (!outOfScope || outOfScope.length === 0) return true;
  return false;
}

/**
 * @param {string} line
 * @param {boolean} visualOnly
 */
function normalizeScopeLine(line, visualOnly) {
  let t = normalizeOperationalPhrase(line);
  if (!t) return t;

  if (visualOnly) {
    t = t
      .replace(
        /\bfuncionalidade\s+(real\s+)?(do|de)\s+chat\b/gi,
        "interface visual do chat",
      )
      .replace(/\bfuncionalidade\s+do\s+chat\b/gi, "interface visual do chat")
      .replace(
        /\bcriar\s+funcionalidade\b/gi,
        "criar interface visual",
      );
  }

  if (/^criar\s+/i.test(t)) {
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }
  if (!/[.!?]$/.test(t) && t.length > 12) {
    t += ".";
  }
  return t;
}

/**
 * @param {string} objective
 * @param {string|null|undefined} modules
 * @param {string|null|undefined} outOfScope
 * @param {string|null|undefined} success
 */
function buildSummaryFromClarificationSlots(objective, modules, outOfScope, success) {
  if (!objective?.trim()) return null;

  let obj = objective.trim().replace(/^(criar|implementar|desenvolver|adicionar)\s+/i, "");
  obj = normalizeOperationalPhrase(obj);
  if (!obj) return null;

  let summary = `Será criado um ${obj.charAt(0).toLowerCase()}${obj.slice(1)}`;

  if (modules?.trim()) {
    let place = normalizeOperationalPhrase(modules.trim());
    place = place.replace(/^tela de\s+/i, "");
    place = place.replace(/^na área de\s+/i, "");
    if (!/^tela de/i.test(place)) {
      place = `tela de ${place.charAt(0).toUpperCase()}${place.slice(1)}`;
    } else {
      place = place.charAt(0).toUpperCase() + place.slice(1);
    }
    summary += ` na ${place}`;
  }

  const visualOnly =
    outOfScope &&
    /apenas\s+visual|somente\s+visual|sem\s+funcional|por\s+agora.*visual/i.test(
      outOfScope,
    );
  if (visualOnly) {
    summary += ", inicialmente sem funcionalidade real de envio de mensagens";
  }

  if (success?.trim()) {
    const s = normalizeOperationalPhrase(success.trim());
    if (/responsiv|tema|reutiliz/i.test(s)) {
      const bits = [];
      if (/reutiliz/i.test(s)) bits.push("reutilizável");
      if (/responsiv/i.test(s)) bits.push("responsivo");
      if (/tema|claro|escuro/i.test(s)) bits.push("compatível com tema claro/escuro");
      if (bits.length) {
        summary += `. O componente deve ser ${bits.join(", ")}`;
      }
    }
  }

  return normalizeOperationalPhrase(summary);
}

/**
 * @param {string} explanation
 */
function isGenericComplexityExplanation(explanation) {
  const t = String(explanation || "").toLowerCase();
  return (
    /impacto relevante no escopo/i.test(t) ||
    /escopo amplo com várias frentes/i.test(t) ||
    /escopo moderado com entregas coordenadas/i.test(t) ||
    /alteração localizada:/i.test(t) ||
    /^envolve\s+/i.test(t) && t.length < 60
  );
}

module.exports = {
  stripAccents,
  normalizeOperationalPhrase,
  normalizeScopeLine,
  detectVisualOnlyScope,
  buildSummaryFromClarificationSlots,
  isGenericComplexityExplanation,
};
