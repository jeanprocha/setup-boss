"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  inferCanonicalComplexity,
  buildComplexityFactorsReason,
} = require("./infer-operational-plan-complexity.js");
const { generateFullUpdatedPlanPresentation } = require("./generate-full-updated-plan-presentation.js");
const { formatComplexitySentence } = require("./operational-plan-complexity.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");

const CHAT_FLAGS = {
  chat: true,
  button: true,
  integrate: true,
  responsive: true,
  theme: true,
  reusable: true,
};

const V1_CHAT = {
  understanding: {
    summary: null,
    mainObjective:
      "Criar componente visual de chat reutilizável na tela de integrações, responsivo e com tema claro/escuro.",
  },
  whatWillBeDone: [
    "Criar componente visual de chat",
    "Garantir responsividade",
    "Garantir compatibilidade com tema claro e escuro",
  ],
  whatWillChange: [],
  outOfScope: [
    "Funcionalidade real do chat",
    "Backend",
    "Persistência",
    "WebSocket",
  ],
  executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
  complexity: {
    level: "medium",
    levelLabelPt: "Média",
    reason: "x",
    explanation: "x",
  },
  executionRecommendation: {
    recommendedLevel: "normal",
    levelLabelPt: "Normal",
    explanation: "x",
  },
  miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
  risks: [],
  completionCriteria: [],
  hasContent: true,
};

describe("infer-operational-plan-complexity", () => {
  it("chat visual + botão + tema + responsividade → medium (visualOnly)", () => {
    const r = inferCanonicalComplexity({
      flags: CHAT_FLAGS,
      deliverableCount: 3,
      visualOnly: true,
      sourceLines: V1_CHAT.whatWillBeDone,
      whatWillBeDone: V1_CHAT.whatWillBeDone,
      outOfScope: V1_CHAT.outOfScope,
    });
    assert.equal(r.level, "medium");
    assert.equal(r.visualOnlyQualified, true);
    assert.ok(r.factors.some((f) => /componentes visuais reutiliz/i.test(f)));
    assert.ok(r.factors.some((f) => /responsividade/i.test(f)));
    assert.ok(r.factors.some((f) => /tema claro/i.test(f)));
  });

  it("UI visual mínima → low", () => {
    const r = inferCanonicalComplexity({
      flags: {
        chat: true,
        button: false,
        integrate: false,
        responsive: false,
        theme: false,
        reusable: false,
      },
      deliverableCount: 1,
      visualOnly: true,
      whatWillBeDone: ["Criar componente visual de chat"],
    });
    assert.equal(r.level, "low");
  });

  it("backend + websocket no escopo → high", () => {
    const r = inferCanonicalComplexity({
      flags: { ...CHAT_FLAGS, integrate: true },
      deliverableCount: 2,
      visualOnly: false,
      whatWillBeDone: [
        "Implementar backend do chat com WebSocket para tempo real",
      ],
      sourceLines: ["Implementar backend do chat com WebSocket"],
    });
    assert.equal(r.level, "high");
  });

  it("persistência e sincronização no escopo → high", () => {
    const r = inferCanonicalComplexity({
      flags: CHAT_FLAGS,
      deliverableCount: 2,
      visualOnly: false,
      whatWillBeDone: [
        "Criar interface com persistência local e sincronização em tempo real",
      ],
    });
    assert.equal(r.level, "high");
  });

  it("canvas / editor avançado → high mesmo visualOnly", () => {
    const r = inferCanonicalComplexity({
      flags: CHAT_FLAGS,
      deliverableCount: 2,
      visualOnly: true,
      whatWillBeDone: [
        "Criar editor visual com canvas e drag-and-drop avançado",
      ],
    });
    assert.equal(r.level, "high");
  });

  it("responsividade e tema sozinhos não elevam para high em visualOnly", () => {
    const r = inferCanonicalComplexity({
      flags: {
        chat: false,
        button: false,
        integrate: false,
        responsive: true,
        theme: true,
        reusable: false,
      },
      deliverableCount: 0,
      visualOnly: true,
      whatWillBeDone: [
        "Garantir responsividade",
        "Garantir compatibilidade com tema claro e escuro",
      ],
    });
    assert.notEqual(r.level, "high");
    assert.equal(r.level, "medium");
  });

  it("reason visualOnly inclui qualificador sem backend", () => {
    const reason = buildComplexityFactorsReason(
      [
        "criação de componentes visuais reutilizáveis",
        "integração na tela de Integrações",
        "validação de responsividade",
        "validação de tema claro/escuro",
      ],
      "medium",
      { visualOnlyQualified: true },
    );
    assert.match(reason, /sem backend, persistência ou comunicação em tempo real/i);
  });
});

describe("infer Fase C — pipeline integrado", () => {
  it("plano chat+botão após comentário fica medium com explicação qualificada", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_CHAT,
      commentText: "criar componente de botão abrir/fechar o chat",
    });

    assert.equal(plan.complexity.level, "medium");
    assert.match(plan.complexity.reason || "", /sem backend/i);
    assert.doesNotMatch(plan.complexity.reason || "", /impacto relevante/i);

    const sentence = formatComplexitySentence(
      plan.complexity.level,
      plan.complexity.reason,
    );
    assert.match(sentence, /foi avaliada como média porque envolve/i);
    assert.doesNotMatch(sentence, /foi avaliada como alta/i);
    assert.doesNotMatch(sentence, /foi avaliada como.*foi avaliada como/i);
  });

  it("polish POLLUTED mantém medium (não alta) para cenário chat", () => {
    const plan = polishOperationalPlanPresentation({
      understanding: {
        summary: "Chat visual na tela de Integrações",
        mainObjective: "Criar chat visual reutilizável",
      },
      whatWillBeDone: [
        "Criar componente visual de chat",
        "Criar botão visual para abrir e fechar o chat",
        "Garantir responsividade",
        "Garantir compatibilidade com tema claro e escuro",
      ],
      whatWillChange: [],
      outOfScope: ["Backend", "Funcionalidade real do chat"],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: {
        level: "high",
        levelLabelPt: "Alta",
        reason: "impacto relevante",
        explanation: "impacto relevante",
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

    assert.equal(plan.complexity.level, "medium");
  });
});
