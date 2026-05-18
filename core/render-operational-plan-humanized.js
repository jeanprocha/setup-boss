"use strict";

const { dedupeSentenceSyntax } = require("./normalize-operational-plan-structure.js");
const { inferProductRisksFromScope } = require("./sanitize-operational-plan-content.js");
const {
  buildComplexityPayload,
  buildReasonFromFactors,
} = require("./operational-plan-complexity.js");

const COMPLEXITY_LABEL_PT = { low: "Baixa", medium: "Média", high: "Alta" };
const REC_LEVEL_PT = { low: "Baixa", normal: "Normal", high: "Alta" };

/**
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 */
function renderUnderstanding(canonical) {
  const { flags, visualOnly } = canonical;
  /** @type {string[]} */
  const parts = [];

  if (flags.chat) {
    let lead =
      "Será criado um componente visual de chat na tela de Integrações";
    if (visualOnly) {
      lead += ", inicialmente sem funcionalidade real de envio de mensagens";
    }
    const qualities = [];
    if (flags.reusable) qualities.push("reutilizável");
    if (flags.responsive) qualities.push("responsivo");
    if (flags.theme) qualities.push("compatível com tema claro/escuro");
    if (qualities.length) {
      lead += `. O componente deve ser ${qualities.join(", ")}`;
    }
    parts.push(lead);
  }

  if (flags.button) {
    parts.push(
      "Também será criado um botão para abrir e fechar o chat visualmente",
    );
  }

  if (!parts.length && canonical.deliverables.length) {
    parts.push(
      canonical.deliverables
        .slice(0, 2)
        .map((d) => d.label.replace(/\.$/, ""))
        .join(". "),
    );
  }

  return parts.length ? dedupeSentenceSyntax(parts.join(". ")) : null;
}

/**
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 */
function renderObjective(canonical) {
  const { flags, visualOnly } = canonical;
  if (flags.chat) {
    const base = visualOnly
      ? "Criar uma interface visual de chat reutilizável na tela de Integrações."
      : "Criar componente de chat reutilizável na tela de Integrações.";
    return dedupeSentenceSyntax(base);
  }
  const first = canonical.deliverables[0];
  return first ? first.label : null;
}

/**
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 */
function renderDeliverables(canonical) {
  /** @type {string[]} */
  const lines = [];
  for (const d of canonical.deliverables) {
    let label = d.label;
    if (d.kind === "task:validate_responsive" || d.kind === "deliverable:integrate") {
      /* já em tasks */
    }
    if (d.kind === "deliverable:chat_visual") {
      label = "Criar componente visual reutilizável do chat.";
    } else if (d.kind === "deliverable:button_toggle") {
      label = "Criar componente de botão para abrir/fechar o chat.";
    } else if (d.kind === "deliverable:integrate") {
      label = "Integrar os componentes na tela de Integrações.";
    }
    if (!lines.some((x) => x.toLowerCase() === label.toLowerCase())) {
      lines.push(label.endsWith(".") ? label : `${label}.`);
    }
  }

  if (
    canonical.flags.responsive &&
    !lines.some((x) => /^Validar responsividade/i.test(x))
  ) {
    lines.push("Validar responsividade.");
  }
  if (
    canonical.flags.theme &&
    !lines.some((x) => /^Validar compatibilidade com tema/i.test(x))
  ) {
    lines.push("Validar compatibilidade com tema claro/escuro.");
  }

  return lines;
}

/**
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 */
function renderCompletionCriteria(canonical) {
  const { flags } = canonical;
  /** @type {string[]} */
  const criteria = [];

  if (flags.chat) {
    criteria.push("O chat aparece corretamente na tela de Integrações.");
  }
  if (flags.button) {
    criteria.push("O botão abre e fecha o chat visualmente.");
  }
  if (flags.responsive) {
    criteria.push("O layout funciona em desktop e mobile.");
  }
  if (flags.theme) {
    criteria.push("O componente suporta tema claro e escuro.");
  }
  if (flags.reusable) {
    criteria.push("O componente pode ser reutilizado em outras telas.");
  }

  return criteria;
}

/**
 * Motivo puro de complexidade (sem prefixo de frase completa).
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 */
function renderComplexityReason(canonical) {
  const { level, factors, visualOnlyQualified } = canonical.complexity;
  return buildReasonFromFactors(factors, level, {
    visualOnlyQualified: Boolean(visualOnlyQualified),
  });
}

/**
 * @param {import("./canonicalize-operational-plan.js").OperationalPlanCanonical} canonical
 * @param {object|null|undefined} sourcePresentation
 */
function renderOperationalPlanHumanized(canonical, sourcePresentation) {
  if (!canonical) return sourcePresentation || null;

  const understandingSummary = renderUnderstanding(canonical);
  const mainObjective = renderObjective(canonical);
  const whatWillBeDone = renderDeliverables(canonical);
  const completionCriteria = renderCompletionCriteria(canonical);
  const level = canonical.complexity.level;

  const miniTaskTitles = canonical.tasks.map((t) => t.label.replace(/\.$/, ""));
  const risksRaw =
    canonical.risks.length > 0
      ? canonical.risks
      : inferProductRisksFromScope({
          whatWillBeDone,
          outOfScope: canonical.outOfScope,
        });

  const recommendedLevel =
    level === "high" ? "high" : level === "low" ? "low" : "normal";

  const presentation = {
    understanding: {
      summary: understandingSummary,
      mainObjective,
    },
    whatWillBeDone,
    whatWillChange: [],
    outOfScope: canonical.outOfScope,
    executionStrategy: {
      macroOrder: whatWillBeDone.map((x) => x.replace(/\.$/, "")),
      approach: canonical.flags.chat
        ? "Implementar componentes visuais de forma incremental, validando integração, responsividade e tema em cada passo."
        : "Executar entregas na ordem definida, validando cada passo antes de avançar.",
      dependencies: [],
    },
    complexity: buildComplexityPayload(
      level,
      renderComplexityReason(canonical),
    ),
    executionRecommendation: {
      recommendedLevel,
      levelLabelPt: REC_LEVEL_PT[recommendedLevel],
      explanation:
        recommendedLevel === "low"
          ? "Prioriza velocidade e baixo custo operacional para entregas localizadas."
          : recommendedLevel === "high"
            ? "Maior profundidade de análise e validação para o escopo identificado."
            : "Equilíbrio entre qualidade, contexto e custo para esta atividade.",
    },
    miniTasks: {
      mode: miniTaskTitles.length > 1 ? "divided" : "direct",
      directLabelPt: "Execução direta num único passo",
      tasks: miniTaskTitles.map((title, i) => ({
        id: `mt-canonical-${i + 1}`,
        title,
        order: i + 1,
      })),
    },
    risks: risksRaw.map((label, i) => ({
      id: `risk-canonical-${i}`,
      label,
      level: "medium",
      levelLabelPt: "Médio",
    })),
    completionCriteria,
    hasContent: false,
  };

  presentation.miniTasks.mode =
    presentation.miniTasks.tasks.length > 1 ? "divided" : "direct";

  if (sourcePresentation?.executableStrategyView !== undefined) {
    presentation.executableStrategyView = sourcePresentation.executableStrategyView;
  }

  presentation.hasContent = Boolean(
    presentation.understanding.summary ||
      presentation.understanding.mainObjective ||
      presentation.whatWillBeDone.length ||
      presentation.outOfScope.length ||
      presentation.completionCriteria.length,
  );

  return presentation;
}

module.exports = {
  renderOperationalPlanHumanized,
  renderUnderstanding,
  renderObjective,
  renderDeliverability: renderDeliverables,
  renderCompletionCriteria,
  renderComplexityReason,
};
