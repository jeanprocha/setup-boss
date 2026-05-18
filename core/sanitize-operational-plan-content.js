"use strict";

/** Linhas que são metainstruções de refinamento/aprovação, não escopo de produto. */
const META_PHRASE_PATTERNS = [
  /plano\s+v?\d*\s*atualizado\s+após\s+comentário/i,
  /plano\s+atualizado\s+após\s+comentário/i,
  /plano\s+v2\s+reflete/i,
  /reflete\s+o\s+comentário/i,
  /reflete\s+comentário/i,
  /ajustar\s+interface\s+conforme\s+comentário/i,
  /conforme\s+(o\s+)?comentário\s+do\s+utilizador/i,
  /conforme\s+pedido\s+do\s+comentário/i,
  /incorporar\s+pedido\s+do\s+comentário/i,
  /complexidade\s+recalculada\s+após/i,
  /recomendação\s+ajustada\s+para\s+nível/i,
  /executar\s+ajustes\s+do\s+plano\s+v?\d/i,
  /execução\s+direta\s+do\s+plano\s+atualizado/i,
  /adicionar\s+componente\s+ao\s+escopo/i,
  /adicionar\s+ao\s+escopo/i,
  /conforme\s+pedido\s+no\s+coment[aá]rio/i,
  /etapa\s+seguinte/i,
  /coment[aá]rio\s+do\s+utilizador/i,
  /plano\s+refinado\s+de\s+forma\s+determin[ií]stica/i,
  /s[ií]ntese\s+autom[aá]tica\s+m[ií]nima/i,
  /extracto\s+determin[ií]stico/i,
];

const INTERNAL_INLINE =
  /\b(skip[-_\s]?llm|skip_llm|local_fallback|task-plan[-\w]*|task-discovery|plan-refine-meta|task-plan-initial-meta|clarification-session|clarification-answers|approval-state\.json|run-context\.json|deterministic[-\s]?(generation|review)?|blocking answers?|fallback local|read-model|runtime phase|phase2status|meta\.json|nuance sem[aâ]ntica|n[aã]o interpreta|modo\s+de\s+gera[cç][aã]o)\b/i;

const INTERNAL_PROCESS =
  /\b(DAG|orquestra[cç][aã]o\s+DAG|comando\s+interno|runtime\s+interno|fora\s+do\s+âmbito\s+deste\s+comando|valida[cç][aã]o\s+interna|revis[aã]o\s+autom[aá]tica|aprova[cç][aã]o\s+humana\s+formal|motor\b|pipeline\s+intern)\b/i;

const INTERNAL_REVIEW_STEP =
  /\b(rever|validar|consultar)\s+[`'"]?(task-plan|task-discovery|clarification|\.md|\.json)/i;

const INTERNAL_LLM = /\b(LLM|sem\s+LLM)\b/;

const FILE_ACCEPTANCE =
  /\b(ficheiro|file|artefacto|artifact).{0,56}(existe|exists|presente|gerado|dispon[ií]vel|contém\s+todas)|crit[eé]rio:\s*o\s+ficheiro/i;

const INTERNAL_SUBTASK_TITLE =
  /^(deterministic[-\s]?review|validate[-\s]?|smoke[-\s]?|e2e[-\s]?test|artifact audit)/i;

/**
 * @param {string} text
 */
function isMetaPlanPhrase(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return META_PHRASE_PATTERNS.some((re) => re.test(t));
}

/**
 * @param {string} text
 */
function isInternalOperationalLine(text) {
  const t = String(text || "").trim();
  if (!t || t.length < 3) return true;
  if (isMetaPlanPhrase(t)) return true;
  if (INTERNAL_INLINE.test(t)) return true;
  if (INTERNAL_PROCESS.test(t)) return true;
  if (INTERNAL_REVIEW_STEP.test(t)) return true;
  if (INTERNAL_LLM.test(t)) return true;
  if (FILE_ACCEPTANCE.test(t)) return true;
  if (INTERNAL_SUBTASK_TITLE.test(t)) return true;
  if (/^respostas?\s+de\s+clarifica[cç][aã]o\s+consideradas?/i.test(t)) return true;
  if (/^modo\s+de\s+gera[cç][aã]o\s*:/i.test(t)) return true;
  if (/^escopo\s+alinhado\s+com\s+`task-plan/i.test(t)) return true;
  if (/^execu[cç][aã]o\s+t[eé]cnica\b/i.test(t) && /fora\s+do\s+escopo/i.test(t)) return true;
  return false;
}

/**
 * @param {string[]} items
 */
function filterOperationalPlanLines(items) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const raw of items || []) {
    const t = String(raw || "").trim();
    if (!t || isInternalOperationalLine(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Riscos de produto quando o plano fonte só tinha diagnóstico interno.
 * @param {{ whatWillBeDone: string[], outOfScope: string[] }} scope
 */
function inferProductRisksFromScope(scope) {
  const text = [...(scope.whatWillBeDone || []), ...(scope.outOfScope || [])]
    .join(" ")
    .toLowerCase();
  /** @type {string[]} */
  const risks = [];

  if (/visual|componente|interface|tela|ecr[aã]|chat|layout|design/i.test(text)) {
    risks.push(
      "Risco de inconsistência visual com o design system existente.",
    );
  }
  if (/reutiliz|componente/i.test(text)) {
    risks.push(
      "Risco de acoplamento excessivo se o componente não for reutilizável.",
    );
  }
  if (/responsiv|mobile|ecr[aã]\s+menor/i.test(text)) {
    risks.push(
      "Risco de comportamento inadequado em telas pequenas sem validação de responsividade.",
    );
  }
  if (/tema|claro|escuro|dark/i.test(text)) {
    risks.push(
      "Risco de regressão visual entre tema claro e escuro.",
    );
  }

  return filterOperationalPlanLines(risks).slice(0, 4);
}

module.exports = {
  META_PHRASE_PATTERNS,
  isMetaPlanPhrase,
  isInternalOperationalLine,
  filterOperationalPlanLines,
  inferProductRisksFromScope,
};
