"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalizeOperationalPlanFromPresentation,
} = require("./canonicalize-operational-plan.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");
const { generateFullUpdatedPlanPresentation } = require("./generate-full-updated-plan-presentation.js");

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
    reason: "envolve componente visual",
    explanation: "envolve componente visual",
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

describe("canonicalize Fase B — preservação semântica", () => {
  it("tema em linha composta gera flags.theme e critério", () => {
    const canonical = canonicalizeOperationalPlanFromPresentation({
      understanding: { summary: null, mainObjective: null },
      whatWillBeDone: [],
      whatWillChange: [],
      outOfScope: [],
      completionCriteria: [
        "componente reutilizável, responsivo e tema claro/escuro",
      ],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: { level: "medium", levelLabelPt: "Média", reason: null, explanation: null },
      executionRecommendation: {
        recommendedLevel: "normal",
        levelLabelPt: "Normal",
        explanation: null,
      },
      miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
      risks: [],
      hasContent: true,
    });
    assert.ok(canonical);
    assert.equal(canonical.flags.theme, true);
    assert.equal(canonical.flags.responsive, true);
    assert.equal(canonical.flags.reusable, true);

    const plan = polishOperationalPlanPresentation({
      understanding: { summary: null, mainObjective: null },
      whatWillBeDone: [],
      completionCriteria: [
        "componente reutilizável, responsivo e tema claro/escuro",
      ],
      whatWillChange: [],
      outOfScope: [],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: { level: "medium", levelLabelPt: "Média", reason: "x", explanation: "x" },
      executionRecommendation: {
        recommendedLevel: "normal",
        levelLabelPt: "Normal",
        explanation: "x",
      },
      miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
      risks: [],
      hasContent: true,
    });
    assert.ok(
      plan.completionCriteria.some((c) => /tema claro e escuro/i.test(c)),
    );
  });

  it("comentário com botão mantém complexidade medium", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_CHAT,
      commentText: "também criar botão para abrir e fechar o chat",
    });
    assert.equal(plan.complexity.level, "medium");
    assert.match(plan.complexity.reason || "", /sem backend/i);
  });

  it("comentário com botão não remove tema do v1", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_CHAT,
      commentText: "também criar botão para abrir e fechar o chat",
    });

    assert.ok(plan.whatWillBeDone.some((x) => /tema/i.test(x)));
    assert.ok(
      plan.completionCriteria.some((c) => /tema claro e escuro/i.test(c)),
    );
    assert.match(plan.understanding.summary || "", /tema claro\/escuro|tema claro e escuro/i);
    assert.ok(plan.whatWillBeDone.some((x) => /bot[aã]o/i.test(x)));
  });

  it("preserva fora do escopo do v1 após comentário", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_CHAT,
      commentText: "adicionar botão abrir fechar",
    });

    assert.ok(plan.outOfScope.some((x) => /backend/i.test(x)));
    assert.ok(plan.outOfScope.some((x) => /websocket/i.test(x)));
    assert.ok(
      plan.outOfScope.some((x) => /envio real de mensagens|funcionalidade real/i.test(x)),
    );
  });

  it("visualOnly sem outOfScope aplica defaults seguros", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: {
        ...V1_CHAT,
        outOfScope: [],
      },
      commentText: "criar botão abrir fechar",
    });

    assert.ok(plan.outOfScope.length >= 4);
    assert.ok(plan.outOfScope.some((x) => /envio real de mensagens/i.test(x)));
    assert.ok(plan.outOfScope.some((x) => /backend/i.test(x)));
    assert.ok(plan.outOfScope.some((x) => /persist/i.test(x)));
    assert.ok(plan.outOfScope.some((x) => /websocket/i.test(x)));
  });

  it("critérios completos no cenário chat + botão", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_CHAT,
      commentText: "criar componente de botão abrir/fechar o chat",
    });

    assert.ok(
      plan.completionCriteria.some((c) => /desktop e mobile/i.test(c)),
    );
    assert.ok(
      plan.completionCriteria.some((c) => /tema claro e escuro/i.test(c)),
    );
    assert.ok(
      plan.completionCriteria.some((c) => /reutiliz/i.test(c)),
    );
    assert.ok(
      plan.completionCriteria.some((c) => /abre e fecha o chat/i.test(c)),
    );
    assert.ok(
      plan.whatWillBeDone.some((x) => /Validar compatibilidade com tema/i.test(x)),
    );
  });
});
