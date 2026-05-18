"use strict";

const {
  META_PHRASE_PATTERNS,
  isMetaPlanPhrase,
  isInternalOperationalLine,
  filterOperationalPlanLines,
} = require("./sanitize-operational-plan-content.js");
const {
  polishOperationalPlanPresentation,
} = require("./polish-operational-plan-presentation.js");
const { normalizeOperationalPhrase } = require("./normalize-operational-plan-language.js");
const { buildComplexityPayload } = require("./operational-plan-complexity.js");

const COMPLEXITY_LABEL_PT = { low: "Baixa", medium: "Média", high: "Alta" };
const REC_LEVEL_PT = { low: "Baixa", normal: "Normal", high: "Alta" };

/** @param {string[]} items */
function filterOperationalLines(items) {
  return filterOperationalPlanLines(items);
}

/**
 * @param {string[]} items
 * @param {string} item
 */
function pushUnique(items, item) {
  const t = String(item || "").trim();
  if (!t || isMetaPlanPhrase(t)) return;
  if (items.some((x) => x.toLowerCase() === t.toLowerCase())) return;
  items.push(t);
}

/**
 * @param {string[][]} lists
 */
function mergeScopeLists(...lists) {
  /** @type {string[]} */
  const out = [];
  for (const list of lists) {
    for (const item of list || []) pushUnique(out, item);
  }
  return filterOperationalLines(out);
}

/**
 * @param {string} commentText
 * @param {string} lower
 * @param {{ whatWillBeDone: string[], outOfScope: string[] }} base
 */
function interpretCommentAdditions(commentText, lower, base) {
  /** @type {string[]} */
  const additions = [];
  /** @type {string[]} */
  const changes = [];
  /** @type {string[]} */
  const outOfScopeAdds = [];
  /** @type {string[]} */
  const risks = [];

  const baseText = [
    ...base.whatWillBeDone,
    ...base.outOfScope,
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(anexos?|upload|ficheiro|arquivo)\b/.test(lower)) {
    const structuralOnly =
      /\b(só|somente|apenas|estrutural|visual|preparar|futur)\b/.test(lower) &&
      !/\b(funcional|integra|api|backend|upload real)\b/.test(lower);
    if (structuralOnly) {
      pushUnique(
        additions,
        "Preparar estrutura visual e de dados para suporte futuro a anexos (sem upload funcional nesta fase)",
      );
      pushUnique(
        outOfScopeAdds,
        "Upload funcional e integração completa de anexos nesta fase",
      );
    } else {
      pushUnique(additions, "Incluir suporte a anexos no fluxo conforme pedido");
    }
    pushUnique(
      risks,
      "Suporte a anexos pode aumentar dependências técnicas — validar integração antes da execução",
    );
  }

  if (/\b(bot[aã]o|btn)\b/.test(lower) && /\b(abrir|fechar|toggle|mostrar|esconder)\b/.test(lower)) {
    pushUnique(additions, "Criar botão visual para abrir e fechar o chat");
    if (/integra|tela|ecr[aã]|interface|componente/i.test(baseText + lower)) {
      pushUnique(
        additions,
        "Integrar botão de abrir/fechar com o componente de chat na tela de integrações",
      );
    }
  } else if (/\b(bot[aã]o|btn)\b/.test(lower)) {
    pushUnique(additions, "Criar botão visual para abrir e fechar o chat");
  }

  if (/\b(chat|conversa)\b/.test(lower) && /\b(criar|adicionar|incluir|implementar)\b/.test(lower)) {
    if (!base.whatWillBeDone.some((x) => /\bchat\b/i.test(x))) {
      pushUnique(additions, "Criar componente visual de chat reutilizável");
    }
  }

  if (/\b(responsiv|mobile|adapt[aá]vel)\b/.test(lower)) {
    pushUnique(
      additions,
      "Garantir responsividade em desktop e mobile",
    );
  }

  if (/\b(tema|dark|claro|escuro|modo)\b/.test(lower)) {
    pushUnique(
      additions,
      "Garantir compatibilidade com tema claro e escuro",
    );
  }

  if (/\b(backend|api|servidor)\b/.test(lower)) {
    if (!/backend|api|servidor/i.test(baseText)) {
      pushUnique(changes, "Expandir escopo para incluir backend/API alinhado ao pedido");
    } else {
      pushUnique(additions, "Implementar ou ajustar backend/API conforme pedido");
    }
  }

  if (/\b(remover|tirar|excluir|retirar)\b/.test(lower)) {
    const snippet = commentText.length <= 100 ? commentText : `${commentText.slice(0, 97).trim()}…`;
    pushUnique(changes, `Remover ou reduzir do escopo: ${snippet}`);
  }

  if (/\b(teste|testes|e2e|valida[cç][aã]o)\b/.test(lower)) {
    pushUnique(additions, "Incluir validação por testes no critério de conclusão");
  }

  if (additions.length === 0 && changes.length === 0) {
    const cleaned = commentText
      .replace(/^(quero|preciso|gostaria|favor|por favor|também|tambem)\s+/i, "")
      .replace(/[.!?]+\s*$/, "")
      .trim();
    if (cleaned.length >= 8) {
      const verb =
        /^(criar|adicionar|incluir|implementar|alterar|atualizar|remover)\b/i.test(cleaned)
          ? ""
          : "Incluir no escopo: ";
      const item = `${verb}${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
      if (!isMetaPlanPhrase(item)) pushUnique(additions, item);
    }
  }

  return { additions, changes, outOfScopeAdds, risks };
}

/**
 * @param {{
 *   summary: string|null,
 *   mainObjective: string|null,
 *   commentText: string,
 *   additions: string[],
 * }} input
 */
function rebuildUnifiedUnderstanding(input) {
  const anchor =
    input.mainObjective?.trim() ||
    input.summary?.trim() ||
    null;
  const comment = input.commentText.trim();
  const additions = input.additions.filter(Boolean);

  if (anchor) {
    return {
      summary: normalizeOperationalPhrase(anchor),
      mainObjective: input.mainObjective?.trim()
        ? normalizeOperationalPhrase(input.mainObjective.trim())
        : null,
    };
  }

  if (comment) {
    const s =
      comment.charAt(0).toUpperCase() +
      (comment.endsWith(".") ? comment.slice(1) : `${comment.slice(1)}.`);
    return { summary: s, mainObjective: null };
  }

  return { summary: null, mainObjective: null };
}

/**
 * @param {string} level
 */
function recommendedLevelForComplexity(level) {
  if (level === "high") return "high";
  if (level === "low") return "low";
  return "normal";
}

/**
 * @param {{
 *   whatWillBeDone: string[],
 *   whatWillChange: string[],
 *   outOfScope: string[],
 *   risks: string[],
 *   understandingSummary: string|null,
 *   mainObjective: string|null,
 * }} signals
 */
function inferComplexityLevel(signals) {
  const itemCount =
    signals.whatWillBeDone.length + signals.whatWillChange.length;
  const riskCount = signals.risks.length;
  const text = [
    signals.understandingSummary,
    signals.mainObjective,
    ...signals.whatWillBeDone,
    ...signals.whatWillChange,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const structural =
    /arquitet|módulo|modulo|backend|api|migra|refator/i.test(text) &&
    !/componente visual|tela de integra/i.test(text);
  if (structural || riskCount >= 3 || itemCount >= 6) return "high";
  if (itemCount <= 1 && riskCount === 0 && text.length < 80) return "low";
  return "medium";
}

/**
 * Motivo puro de complexidade (sem prefixo «A tarefa foi avaliada…»).
 *
 * @param {string} level
 * @param {{
 *   whatWillBeDone: string[],
 *   understandingSummary: string|null,
 * }} signals
 */
function buildComplexityReason(level, signals) {
  const hint =
    signals.whatWillBeDone.find((x) => x.trim().length >= 8) ||
    signals.understandingSummary?.trim() ||
    null;
  if (hint) {
    const short =
      hint.length > 110 ? `${hint.slice(0, 107).trim()}…` : hint;
    if (level === "low") {
      return `Alteração localizada: ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    if (level === "high") {
      return `Impacto relevante no escopo: ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    if (/componente|visual|tela|integra/i.test(short)) {
      return `Envolve ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
    }
    return short.charAt(0).toUpperCase() + short.slice(1);
  }
  if (level === "low") return "Escopo reduzido e entregas pontuais.";
  if (level === "high") return "Escopo amplo com várias frentes de trabalho.";
  return "Escopo moderado com entregas coordenadas.";
}

/**
 * @param {string} level
 */
function buildExecutionRecommendationExplanation(level) {
  if (level === "low") {
    return "Prioriza velocidade e baixo custo operacional para entregas localizadas.";
  }
  if (level === "high") {
    return "Maior profundidade de análise e validação para o escopo identificado.";
  }
  return "Equilíbrio entre qualidade, contexto e custo para esta atividade.";
}

/**
 * @param {string[]} whatWillBeDone
 * @param {string[]} outOfScope
 * @param {{ summary: string|null }} understanding
 */
function rebuildCompletionCriteria(whatWillBeDone, outOfScope, understanding) {
  /** @type {string[]} */
  const criteria = [];
  const deliverables = whatWillBeDone.filter(
    (x) => !/valida[cç][aã]o|teste/i.test(x),
  );
  const quality = whatWillBeDone.filter((x) =>
    /responsiv|tema|reutiliz|integra/i.test(x),
  );

  if (deliverables.length) {
    const parts = deliverables
      .slice(0, 4)
      .map((d) => d.replace(/^Criar\s+/i, "").replace(/^Integrar\s+/i, "integração de "))
      .join(", ");
    let sentence = `Os entregáveis (${parts}) devem estar concluídos e integrados conforme o plano.`;
    if (quality.some((q) => /responsiv/i.test(q))) {
      sentence = sentence.replace(/\.$/, ", com comportamento responsivo.");
    }
    if (quality.some((q) => /tema/i.test(q))) {
      sentence = sentence.replace(/\.$/, ", compatíveis com tema claro e escuro.");
    }
    if (!sentence.endsWith(".")) sentence += ".";
    pushUnique(criteria, sentence);
  } else if (understanding.summary) {
    pushUnique(
      criteria,
      `${understanding.summary.replace(/\.$/, "")} — critérios de aceitação verificáveis na interface.`,
    );
  }

  for (const o of outOfScope.slice(0, 2)) {
    if (/funcional|backend|persist/i.test(o)) {
      pushUnique(
        criteria,
        `Confirmar que permanecem fora do escopo: ${o.charAt(0).toLowerCase()}${o.slice(1)}`,
      );
    }
  }

  return filterOperationalLines(criteria);
}

/**
 * @param {string[]} whatWillBeDone
 * @param {object|null|undefined} baseStrategy
 */
function rebuildExecutionStrategy(whatWillBeDone, baseStrategy) {
  const macroOrder = filterOperationalLines(
    Array.isArray(baseStrategy?.macroOrder) && baseStrategy.macroOrder.length
      ? [...baseStrategy.macroOrder, ...whatWillBeDone]
      : [...whatWillBeDone],
  ).slice(0, 8);

  const visual =
    whatWillBeDone.some((x) => /visual|componente|interface|tela/i.test(x)) ||
    macroOrder.some((x) => /visual|componente|interface|tela/i.test(x));

  const approach = visual
    ? "Implementar componentes visuais de forma incremental, validando integração, responsividade e tema em cada passo."
    : "Executar entregas na ordem definida, validando cada passo antes de avançar.";

  return {
    macroOrder,
    approach,
    dependencies: Array.isArray(baseStrategy?.dependencies)
      ? filterOperationalLines(baseStrategy.dependencies)
      : [],
  };
}

/**
 * @param {string[]} whatWillBeDone
 */
function rebuildMiniTasks(whatWillBeDone) {
  const items = whatWillBeDone.filter((t) => t.length >= 4);
  if (items.length < 2) {
    return {
      mode: "direct",
      directLabelPt: "Execução direta num único passo",
      tasks: [],
    };
  }
  return {
    mode: "divided",
    directLabelPt: "Execução direta num único passo",
    tasks: items.map((title, i) => ({
      id: `mt-v2-${i + 1}`,
      title: title.length > 120 ? `${title.slice(0, 117)}…` : title,
      order: i + 1,
    })),
  };
}

/** @param {"divided"|"direct"} mode */
function normalizeMiniTasksMode(mode, taskCount) {
  return taskCount > 0 ? "divided" : "direct";
}

/**
 * @param {Array<{ question: string, answer: string }>|null|undefined} additionalAnswers
 * @param {string} commentText
 * @param {{ whatWillBeDone: string[], outOfScope: string[] }} scope
 */
function applyAdditionalAnswers(additionalAnswers, commentText, scope) {
  for (const row of additionalAnswers || []) {
    const q = String(row.question || "").trim();
    const a = String(row.answer || "").trim();
    if (!a) continue;
    if (
      /\b(visual|estrutural|prepar)\b/i.test(a) &&
      /\b(anexos?|upload)\b/i.test(q + commentText)
    ) {
      pushUnique(
        scope.whatWillBeDone,
        "Preparar apenas estrutura visual/dados para anexos futuros (sem integração funcional agora)",
      );
      pushUnique(
        scope.outOfScope,
        "Upload funcional e integração completa de anexos nesta fase",
      );
    } else if (/\b(funcional|integra|completo)\b/i.test(a)) {
      pushUnique(scope.whatWillBeDone, "Incluir suporte funcional conforme resposta");
    } else if (/\b(fora|n[aã]o|sem)\b/i.test(a) && /\bescopo\b/i.test(q)) {
      pushUnique(scope.outOfScope, a);
    } else if (a.length >= 12 && !isMetaPlanPhrase(a)) {
      pushUnique(scope.whatWillBeDone, a);
    }
  }
}

/**
 * Gera apresentação completa e autónoma do plano v2 (não é delta).
 *
 * @param {{
 *   planExcerpt?: string,
 *   basePresentation?: object|null,
 *   parsedExcerpt?: object|null,
 *   commentText: string,
 *   analysis?: object|null,
 *   additionalAnswers?: Array<{ question: string, answer: string }>|null,
 * }} input
 */
function generateFullUpdatedPlanPresentation(input) {
  const commentText = String(input.commentText || "").trim();
  const lower = commentText.toLowerCase();
  const parsed = input.parsedExcerpt || null;
  const base = input.basePresentation;

  const baseWhatWillBeDone = mergeScopeLists(
    Array.isArray(base?.whatWillBeDone) ? base.whatWillBeDone : [],
    parsed?.whatWillBeDone || [],
  );
  const baseWhatWillChange = mergeScopeLists(
    Array.isArray(base?.whatWillChange) ? base.whatWillChange : [],
    parsed?.whatWillChange || [],
  );
  const baseOutOfScope = mergeScopeLists(
    Array.isArray(base?.outOfScope) ? base.outOfScope : [],
    parsed?.outOfScope || [],
  );
  let baseCompletionCriteria = mergeScopeLists(
    Array.isArray(base?.completionCriteria) ? base.completionCriteria : [],
    parsed?.completionCriteria || [],
  );
  let baseRisks = filterOperationalLines(
    (Array.isArray(base?.risks) ? base.risks : [])
      .map((r) =>
        typeof r === "string" ? r : String(r?.label || "").trim(),
      )
      .filter(Boolean),
  );

  const baseUnderstanding = {
    summary:
      (base?.understanding?.summary && String(base.understanding.summary)) ||
      parsed?.summary ||
      null,
    mainObjective:
      (base?.understanding?.mainObjective &&
        String(base.understanding.mainObjective)) ||
      parsed?.mainObjective ||
      null,
  };

  const scopeBase = {
    whatWillBeDone: [...baseWhatWillBeDone],
    outOfScope: [...baseOutOfScope],
  };
  const interpreted = interpretCommentAdditions(commentText, lower, scopeBase);

  const whatWillBeDone = [...baseWhatWillBeDone];
  const whatWillChange = [...baseWhatWillChange];
  const outOfScope = [...baseOutOfScope];

  for (const item of interpreted.additions) pushUnique(whatWillBeDone, item);
  for (const item of interpreted.changes) pushUnique(whatWillChange, item);
  for (const item of interpreted.outOfScopeAdds) pushUnique(outOfScope, item);
  for (const item of interpreted.risks) {
    if (!baseRisks.includes(item)) baseRisks.push(item);
  }

  const changeSummary = String(input.analysis?.planChangeSummary || "").trim();
  if (changeSummary && !isMetaPlanPhrase(changeSummary)) {
    if (/\b(remover|reduzir|alterar)\b/i.test(changeSummary)) {
      pushUnique(whatWillChange, changeSummary);
    } else {
      pushUnique(whatWillBeDone, changeSummary);
    }
  }

  applyAdditionalAnswers(input.additionalAnswers, commentText, {
    whatWillBeDone,
    outOfScope,
  });

  const understanding = rebuildUnifiedUnderstanding({
    summary: baseUnderstanding.summary,
    mainObjective: baseUnderstanding.mainObjective,
    commentText,
    additions: interpreted.additions,
  });

  const scopeSignals = {
    whatWillBeDone: filterOperationalLines(whatWillBeDone),
    whatWillChange: filterOperationalLines(whatWillChange),
    outOfScope: filterOperationalLines(outOfScope),
    risks: baseRisks,
    understandingSummary: understanding.summary,
    mainObjective: understanding.mainObjective,
  };

  const complexityLevel = inferComplexityLevel(scopeSignals);
  const recommendedLevel = recommendedLevelForComplexity(complexityLevel);

  let completionCriteria = rebuildCompletionCriteria(
    scopeSignals.whatWillBeDone,
    scopeSignals.outOfScope,
    understanding,
  );
  if (!completionCriteria.length && baseCompletionCriteria.length) {
    completionCriteria = filterOperationalLines(baseCompletionCriteria);
  }

  const executionStrategy = rebuildExecutionStrategy(
    scopeSignals.whatWillBeDone,
    base?.executionStrategy,
  );
  const miniTasks = rebuildMiniTasks(scopeSignals.whatWillBeDone);

  const mappedRisks = scopeSignals.risks.map((label, i) => ({
    id: `risk-v2-${i}`,
    label,
    level: "medium",
    levelLabelPt: "Médio",
  }));

  const finalWhatWillBeDone = scopeSignals.whatWillBeDone;
  const finalWhatWillChange = scopeSignals.whatWillChange;
  const finalOutOfScope = scopeSignals.outOfScope;
  const miniTasksMode = normalizeMiniTasksMode(miniTasks.mode, miniTasks.tasks.length);

  return sanitizeUpdatedPlanPresentation({
    understanding,
    whatWillBeDone: finalWhatWillBeDone,
    whatWillChange: finalWhatWillChange,
    outOfScope: finalOutOfScope,
    executionStrategy,
    complexity: buildComplexityPayload(
      complexityLevel,
      buildComplexityReason(complexityLevel, scopeSignals),
    ),
    executionRecommendation: {
      recommendedLevel,
      levelLabelPt: REC_LEVEL_PT[recommendedLevel],
      explanation: buildExecutionRecommendationExplanation(recommendedLevel),
    },
    miniTasks: {
      mode: miniTasksMode,
      directLabelPt: "Execução direta num único passo",
      tasks: miniTasks.tasks,
    },
    risks: mappedRisks,
    completionCriteria,
    hasContent: Boolean(
      understanding.summary ||
        understanding.mainObjective ||
        finalWhatWillBeDone.length ||
        finalWhatWillChange.length ||
        finalOutOfScope.length ||
        completionCriteria.length,
    ),
  });
}

/**
 * Sanitiza apresentação persistida (remove frases meta legadas).
 * @param {object|null} presentation
 */
function sanitizeUpdatedPlanPresentation(presentation) {
  if (!presentation || typeof presentation !== "object") return presentation;
  return polishOperationalPlanPresentation(presentation);
}

const { planV2NeedsRegeneration } = require("./operational-plan-staleness.js");

module.exports = {
  generateFullUpdatedPlanPresentation,
  sanitizeUpdatedPlanPresentation,
  inferComplexityLevel,
  isMetaPlanPhrase,
  isInternalOperationalLine,
  filterOperationalLines,
  planV2NeedsRegeneration,
  META_PHRASE_PATTERNS,
};
