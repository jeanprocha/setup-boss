"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");
const { isInternalOperationalLine } = require("./sanitize-operational-plan-content.js");
const { formatComplexitySentence } = require("./operational-plan-complexity.js");

const CHAT_V1 = {
  understanding: {
    summary: "Será desenvolvido criar componente de chat na área de tela de integrações.",
    mainObjective: "criar componente de chat",
  },
  whatWillBeDone: [
    "Criar componente visual de chat reutilizável",
    "Criar botão visual para abrir e fechar o chat",
    "Adicionar um botão que permita abrir e fechar o chat",
    "Integrar botão na tela de integrações",
    "Garantir responsividade em diferentes tamanhos de ecrã",
    "Garantir compatibilidade com tema claro e escuro",
    "Ajustar funcionalidade do chat para ser só visual",
  ],
  whatWillChange: [],
  outOfScope: ["Funcionalidade real do chat", "Backend"],
  executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
  complexity: {
    level: "high",
    levelLabelPt: "Alta",
    explanation: "Impacto relevante no escopo: criar componente visual de chat",
  },
  executionRecommendation: {
    recommendedLevel: "normal",
    levelLabelPt: "Normal",
    explanation: "Equilíbrio entre qualidade e custo.",
  },
  miniTasks: { mode: "direct", directLabelPt: "Direto", tasks: [] },
  risks: [
    {
      id: "r1",
      label: "O modo skip-llm não interpreta nuance semântica",
      level: "medium",
      levelLabelPt: "Médio",
    },
  ],
  completionCriteria: [
    "componente reutilizavel, responsivo e tema claro/escuro",
  ],
  hasContent: true,
};

describe("polish-operational-plan-presentation", () => {
  it("cenário chat: linguagem, dedupe, critérios e mini-tarefas", () => {
    const plan = polishOperationalPlanPresentation({
      ...CHAT_V1,
      whatWillBeDone: [...CHAT_V1.whatWillBeDone],
    });

    const all = [
      plan.understanding.summary,
      ...plan.whatWillBeDone,
      ...plan.completionCriteria,
      plan.complexity.reason,
      formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
      ...plan.miniTasks.tasks.map((t) => t.title),
      ...plan.risks.map((r) => r.label),
    ].filter(Boolean);

    for (const line of all) {
      assert.equal(isInternalOperationalLine(String(line)), false, line);
      assert.doesNotMatch(String(line), /Será desenvolvido criar/i);
      assert.doesNotMatch(String(line), /na área de tela/i);
      assert.doesNotMatch(String(line), /ecrã|queres|ficheiro/i);
      assert.doesNotMatch(String(line), /skip-llm/i);
    }

    assert.doesNotMatch(plan.understanding.summary || "", /funcionalidade do chat/i);
    assert.equal(
      plan.whatWillBeDone.filter(
        (x) => /bot[aã]o/i.test(x) && /abrir|fechar/i.test(x),
      ).length,
      1,
      "dedupe botão abrir/fechar",
    );
    assert.ok(
      plan.whatWillBeDone.some((x) => /componente visual.*chat/i.test(x)),
    );
    assert.ok(plan.outOfScope.some((x) => /envio real de mensagens/i.test(x)));
    assert.ok(
      plan.completionCriteria.some((c) => /aparece corretamente na tela de Integrações/i.test(c)),
    );
    assert.ok(
      plan.completionCriteria.some((c) => /abre e fecha o chat visualmente/i.test(c)),
    );
    assert.doesNotMatch(plan.complexity.reason || "", /foi avaliada como/i);
    assert.match(
      formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
      /^A tarefa foi avaliada como (média|alta) porque /,
    );
    assert.doesNotMatch(
      plan.complexity.reason || "",
      /impacto relevante no escopo/i,
    );
    assert.ok(plan.miniTasks.tasks.length >= 4);
    assert.ok(
      plan.miniTasks.tasks.some((t) => /Validar responsividade/i.test(t.title)),
    );
  });
});
