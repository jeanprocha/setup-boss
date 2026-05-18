"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { generateUpdatedPlanHeuristic } = require("./generate-updated-plan-heuristic.js");
const { isMetaPlanPhrase } = require("../../../core/generate-full-updated-plan-presentation.js");

describe("generateUpdatedPlanHeuristic", () => {
  it("incorpora pedido claro de anexos", () => {
    const plan = generateUpdatedPlanHeuristic({
      planExcerpt: "Resumo: Chat lateral\n\nO que será feito:\n- UI do chat",
      commentText: "Incluir suporte a upload de anexos no chat.",
      analysis: { planChangeSummary: "Incluir upload de anexos" },
    });
    assert.ok(plan.whatWillBeDone.some((x) => /anexo/i.test(x)));
    assert.equal(plan.hasContent, true);
    assert.ok(plan.complexity.level);
    assert.equal(isMetaPlanPhrase(plan.complexity.explanation || ""), false);
  });

  it("respeita respostas adicionais estruturais", () => {
    const plan = generateUpdatedPlanHeuristic({
      planExcerpt: "Resumo: Chat",
      commentText: "Quero deixar preparado para anexos futuramente.",
      analysis: { planChangeSummary: "anexos futuros" },
      additionalAnswers: [
        {
          question: "O suporte a anexos deve ser apenas estrutural?",
          answer: "Apenas estrutura visual por enquanto",
        },
      ],
    });
    assert.ok(
      plan.whatWillBeDone.some((x) => /estrutura visual/i.test(x)) ||
        plan.outOfScope.some((x) => /upload funcional/i.test(x)),
    );
  });

  it("delega geração completa ao core (chat + botão)", () => {
    const plan = generateUpdatedPlanHeuristic({
      basePresentation: {
        understanding: {
          summary: null,
          mainObjective:
            "Criar componente visual de chat reutilizável na tela de integrações, responsivo e com tema claro/escuro.",
        },
        whatWillBeDone: ["Criar componente visual de chat"],
        whatWillChange: [],
        outOfScope: ["Backend"],
        executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
        complexity: { level: "medium", levelLabelPt: "Média", explanation: "Média" },
        executionRecommendation: {
          recommendedLevel: "normal",
          levelLabelPt: "Normal",
          explanation: "Normal",
        },
        miniTasks: { mode: "direct", directLabelPt: "Direto", tasks: [] },
        risks: [],
        completionCriteria: [],
        hasContent: true,
      },
      commentText: "Criar também um botão para abrir/fechar o chat.",
    });
    assert.ok(plan.whatWillBeDone.some((x) => /botão/i.test(x)));
    assert.equal(isMetaPlanPhrase(plan.understanding.summary || ""), false);
  });
});
