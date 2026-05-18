"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  extractComplexityReason,
  formatComplexitySentence,
  buildComplexityPayload,
  buildReasonFromFactors,
  normalizeComplexityObject,
  resolveComplexityReason,
} = require("./operational-plan-complexity.js");
const { generateFullUpdatedPlanPresentation } = require("./generate-full-updated-plan-presentation.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");

describe("operational-plan-complexity", () => {
  it("extractComplexityReason remove prefixo simples e duplicado", () => {
    assert.equal(
      extractComplexityReason(
        "A tarefa foi avaliada como alta porque envolve integração visual",
      ),
      "envolve integração visual",
    );
    assert.equal(
      extractComplexityReason(
        "A tarefa foi avaliada como alta porque a tarefa foi avaliada como alta porque envolve X",
      ),
      "envolve X",
    );
  });

  it("buildComplexityPayload guarda reason puro", () => {
    const c = buildComplexityPayload(
      "medium",
      "envolve criação de componentes reutilizáveis",
    );
    assert.equal(c.reason, "envolve criação de componentes reutilizáveis");
    assert.equal(c.explanation, c.reason);
    assert.doesNotMatch(c.reason || "", /foi avaliada como/i);
  });

  it("formatComplexitySentence monta frase uma vez", () => {
    const sentence = formatComplexitySentence(
      "high",
      "envolve integração visual e múltiplos componentes",
    );
    assert.equal(
      sentence,
      "A tarefa foi avaliada como alta porque envolve integração visual e múltiplos componentes.",
    );
    assert.doesNotMatch(sentence, /foi avaliada como.*foi avaliada como/i);
  });

  it("compatibilidade com explanation legada completa", () => {
    const normalized = normalizeComplexityObject({
      level: "high",
      levelLabelPt: "Alta",
      explanation:
        "A tarefa foi avaliada como alta porque envolve validação de tema claro/escuro.",
    });
    assert.equal(normalized.level, "high");
    assert.equal(
      normalized.reason,
      "envolve validação de tema claro/escuro.",
    );
    const ui = formatComplexitySentence("high", normalized.reason, "Alta");
    assert.doesNotMatch(ui, /foi avaliada como.*foi avaliada como/i);
    assert.match(ui, /porque envolve validação de tema/i);
  });

  it("normalizeComplexityObject preserva level válido", () => {
    const n = normalizeComplexityObject({
      level: "low",
      levelLabelPt: "Baixa",
      explanation: "alteração localizada",
    });
    assert.equal(n.level, "low");
    assert.equal(n.reason, "alteração localizada");
  });

  it("fallback sem reason usa default por level", () => {
    const r = resolveComplexityReason({ level: "medium", reason: null, explanation: null });
    assert.ok(r.length > 4);
    const sentence = formatComplexitySentence("medium", r);
    assert.match(sentence, /^A tarefa foi avaliada como média porque /);
  });

  it("buildReasonFromFactors", () => {
    assert.equal(
      buildReasonFromFactors(
        ["criação de componentes", "integração na tela"],
        "medium",
      ),
      "envolve criação de componentes, integração na tela",
    );
  });

  it("plano v2 pós-polish: reason puro e UI sem duplicação", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: {
        understanding: { summary: null, mainObjective: "Chat visual" },
        whatWillBeDone: [
          "Criar componente visual de chat",
          "Garantir responsividade",
          "Garantir compatibilidade com tema claro e escuro",
        ],
        whatWillChange: [],
        outOfScope: ["Backend"],
        executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
        complexity: { level: "medium", levelLabelPt: "Média", explanation: "x" },
        executionRecommendation: {
          recommendedLevel: "normal",
          levelLabelPt: "Normal",
          explanation: "x",
        },
        miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
        risks: [],
        completionCriteria: [],
        hasContent: true,
      },
      commentText: "botao abrir fechar",
    });

    assert.doesNotMatch(plan.complexity.reason || "", /foi avaliada como/i);
    assert.equal(plan.complexity.explanation, plan.complexity.reason);

    const ui = formatComplexitySentence(
      plan.complexity.level,
      resolveComplexityReason(plan.complexity),
      plan.complexity.levelLabelPt,
    );
    assert.doesNotMatch(ui, /foi avaliada como.*foi avaliada como/i);
    assert.match(ui, /^A tarefa foi avaliada como (média|alta) porque /);
  });

  it("polish com explanation legada duplicada normaliza reason", () => {
    const plan = polishOperationalPlanPresentation({
      understanding: { summary: "Chat", mainObjective: null },
      whatWillBeDone: [
        "Criar componente visual de chat",
        "Criar botão visual para abrir e fechar o chat",
        "Garantir responsividade",
      ],
      whatWillChange: [],
      outOfScope: ["Backend"],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: {
        level: "high",
        levelLabelPt: "Alta",
        explanation:
          "A tarefa foi avaliada como alta porque a tarefa foi avaliada como alta porque impacto",
      },
      executionRecommendation: {
        recommendedLevel: "high",
        levelLabelPt: "Alta",
        explanation: "x",
      },
      miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
      risks: [],
      completionCriteria: [],
      hasContent: true,
    });

    assert.doesNotMatch(plan.complexity.reason || "", /foi avaliada como.*foi avaliada/i);
    const ui = formatComplexitySentence(
      plan.complexity.level,
      plan.complexity.reason,
    );
    assert.doesNotMatch(ui, /foi avaliada como.*foi avaliada como/i);
  });
});
