"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canonicalizeOperationalPlanFromPresentation,
} = require("./canonicalize-operational-plan.js");
const { renderOperationalPlanHumanized } = require("./render-operational-plan-humanized.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");
const { isMetalanguageLine } = require("./normalize-operational-plan-structure.js");
const { formatComplexitySentence } = require("./operational-plan-complexity.js");

const POLLUTED = {
  understanding: {
    summary:
      "Será criado um componente de chat na tela integrações na tela de Integrações.",
    mainObjective: "funcionalidade do chat, agora é só componente visual",
  },
  whatWillBeDone: [
    "Adicionar ao plano a criação de um componente de botão para abrir/fechar o chat",
    "Criar botão visual para abrir e fechar o chat",
    "funcionalidade do chat, agora é só componente visual",
    "Garantir responsividade",
    "Garantir compatibilidade com tema claro e escuro",
  ],
  whatWillChange: [],
  outOfScope: ["Funcionalidade real do chat", "Backend"],
  executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
  complexity: {
    level: "high",
    levelLabelPt: "Alta",
    explanation:
      "A tarefa foi avaliada como alta porque a tarefa foi avaliada como alta porque impacto relevante no escopo",
  },
  executionRecommendation: {
    recommendedLevel: "high",
    levelLabelPt: "Alta",
    explanation: "Normal",
  },
  miniTasks: {
    mode: "direct",
    directLabelPt: "Direto",
    tasks: [
      { id: "1", title: "funcionalidade do chat", order: 1 },
      { id: "2", title: "abertura e fecho do painel", order: 2 },
    ],
  },
  risks: [],
  completionCriteria: ["componente reutilizavel, responsivo e tema claro/escuro"],
  hasContent: true,
};

describe("canonicalize + render pipeline", () => {
  it("rejeita metalinguagem na origem", () => {
    assert.equal(
      isMetalanguageLine("Adicionar ao plano a criação de um componente"),
      true,
    );
  });

  it("canonicaliza átomos sem propagar texto cru", () => {
    const canonical = canonicalizeOperationalPlanFromPresentation(POLLUTED);
    assert.ok(canonical);
    assert.ok(canonical.flags.chat);
    assert.ok(canonical.flags.button);
    assert.ok(canonical.deliverables.length >= 2);
    assert.ok(
      !canonical.deliverables.some((d) => /adicionar ao plano/i.test(d.label)),
    );
  });

  it("renderiza plano humanizado esperado (chat + botão)", () => {
    const plan = polishOperationalPlanPresentation({
      ...POLLUTED,
      whatWillBeDone: [...POLLUTED.whatWillBeDone],
    });

    const all = [
      plan.understanding.summary,
      plan.understanding.mainObjective,
      ...plan.whatWillBeDone,
      ...plan.completionCriteria,
      plan.complexity.reason,
      formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
      ...plan.miniTasks.tasks.map((t) => t.title),
    ].filter(Boolean);

    for (const line of all) {
      assert.doesNotMatch(String(line), /adicionar ao plano|funcionalidade do chat|fecho\b/i);
      assert.doesNotMatch(String(line), /foi avaliada como.*foi avaliada/i);
      assert.doesNotMatch(String(line), /impacto relevante no escopo/i);
    }

    assert.doesNotMatch(plan.complexity.reason || "", /foi avaliada como/i);

    assert.match(plan.understanding.summary || "", /componente visual de chat/i);
    assert.match(plan.understanding.summary || "", /botão/i);
    assert.doesNotMatch(plan.understanding.summary || "", /na tela de Integrações\s+na tela/i);

    assert.match(plan.understanding.mainObjective || "", /interface visual/i);
    assert.equal(
      plan.whatWillBeDone.filter((x) => /bot[aã]o/i.test(x) && /abrir|fechar/i.test(x))
        .length,
      1,
    );
    assert.ok(plan.completionCriteria.length >= 4);
    assert.ok(
      plan.completionCriteria.some((c) => /desktop e mobile/i.test(c)),
    );
    assert.ok(
      plan.completionCriteria.some((c) => /tema claro e escuro/i.test(c)),
    );
    assert.match(plan.complexity.reason || "", /envolve/i);
    assert.equal(plan.complexity.level, "medium");
    assert.match(
      formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
      /^A tarefa foi avaliada como média porque envolve/i,
    );
    assert.ok(plan.miniTasks.tasks.length >= 4);
    assert.ok(
      plan.miniTasks.tasks.some((t) => /Integrar chat e botão/i.test(t.title)),
    );
    assert.ok(plan.outOfScope.some((x) => /Envio real de mensagens/i.test(x)));
  });

  it("render direto do canônico", () => {
    const canonical = canonicalizeOperationalPlanFromPresentation(POLLUTED);
    const plan = renderOperationalPlanHumanized(canonical, null);
    assert.ok(plan.whatWillBeDone.length >= 3);
    assert.ok(plan.completionCriteria.length >= 3);
  });
});
