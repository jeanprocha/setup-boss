"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateFullUpdatedPlanPresentation,
  isMetaPlanPhrase,
  isInternalOperationalLine,
  sanitizeUpdatedPlanPresentation,
} = require("./generate-full-updated-plan-presentation.js");
const { formatComplexitySentence } = require("./operational-plan-complexity.js");

const V1_BASE = {
  understanding: {
    summary: null,
    mainObjective:
      "Criar componente visual de chat reutilizável na tela de integrações, responsivo e com tema claro/escuro.",
  },
  whatWillBeDone: [
    "Criar componente visual de chat",
    "Garantir responsividade",
    "Garantir compatibilidade com tema claro/escuro",
  ],
  whatWillChange: [],
  outOfScope: [
    "Funcionalidade real do chat",
    "Backend",
    "Persistência de mensagens",
    "Comunicação em tempo real",
  ],
  executionStrategy: {
    macroOrder: ["Criar componente visual de chat"],
    approach: "Implementar UI de forma incremental",
    dependencies: [],
  },
  complexity: {
    level: "medium",
    levelLabelPt: "Média",
    explanation: "Envolve componente visual na tela de integrações",
  },
  executionRecommendation: {
    recommendedLevel: "normal",
    levelLabelPt: "Normal",
    explanation: "Equilíbrio entre qualidade e custo.",
  },
  miniTasks: {
    mode: "divided",
    directLabelPt: "Execução direta",
    tasks: [
      { id: "mt-1", title: "Criar componente visual de chat", order: 1 },
    ],
  },
  risks: [],
  completionCriteria: [
    "O componente de chat deve estar integrado na tela de integrações.",
  ],
  hasContent: true,
};

function assertNoMetaPhrases(plan) {
  const all = [
    plan.understanding.summary,
    plan.understanding.mainObjective,
    ...plan.whatWillBeDone,
    ...plan.whatWillChange,
    ...plan.outOfScope,
    ...plan.completionCriteria,
    plan.complexity.reason,
    formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
    plan.executionRecommendation.explanation,
    plan.executionStrategy.approach,
    plan.miniTasks.directLabelPt,
    ...plan.miniTasks.tasks.map((t) => t.title),
  ].filter(Boolean);
  for (const line of all) {
    assert.equal(
      isMetaPlanPhrase(String(line)),
      false,
      `frase meta detectada: ${line}`,
    );
    assert.equal(
      isInternalOperationalLine(String(line)),
      false,
      `linha interna detectada: ${line}`,
    );
  }
}

describe("generateFullUpdatedPlanPresentation", () => {
  it("gera plano v2 completo e autónomo (chat + botão)", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_BASE,
      commentText: "Criar também um botão para abrir/fechar o chat.",
      analysis: { planChangeSummary: "Incluir botão abrir/fechar o chat" },
    });

    assertNoMetaPhrases(plan);
    assert.ok(plan.hasContent);

    assert.ok(
      plan.whatWillBeDone.some((x) => /componente visual.*chat/i.test(x)),
      "mantém item do v1",
    );
    assert.ok(
      plan.whatWillBeDone.some((x) => /botão/i.test(x) && /abrir|fechar/i.test(x)),
      "incorpora botão do comentário",
    );
    assert.ok(
      plan.whatWillBeDone.some((x) => /integra/i.test(x)),
      "inclui integração",
    );
    assert.ok(plan.outOfScope.some((x) => /backend/i.test(x)));
    assert.ok(
      plan.outOfScope.some((x) => /envio real de mensagens|funcionalidade real/i.test(x)),
    );

    assert.ok(
      plan.understanding.summary &&
        /chat/i.test(plan.understanding.summary) &&
        /botão/i.test(plan.understanding.summary),
    );

    assert.ok(plan.completionCriteria.length >= 1);
    assert.ok(plan.miniTasks.tasks.length >= 2);
    assert.equal(plan.miniTasks.mode, "divided");
    assert.ok(!/recalculada após/i.test(plan.complexity.reason || ""));
    assert.doesNotMatch(
      formatComplexitySentence(plan.complexity.level, plan.complexity.reason),
      /foi avaliada como.*foi avaliada como/i,
    );
  });

  it("incorpora pedido de anexos sem frases meta", () => {
    const plan = generateFullUpdatedPlanPresentation({
      planExcerpt: "Resumo: Chat lateral\n\nO que será feito:\n- UI do chat",
      commentText: "Incluir suporte a upload de anexos no chat.",
      analysis: { planChangeSummary: "Incluir upload de anexos" },
    });
    assertNoMetaPhrases(plan);
    assert.ok(plan.whatWillBeDone.some((x) => /anexo/i.test(x)));
  });

  it("respeita respostas adicionais estruturais", () => {
    const plan = generateFullUpdatedPlanPresentation({
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
    assertNoMetaPhrases(plan);
  });

  it("cenário obrigatório chat + botão (v1 estruturado + comentário)", () => {
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: V1_BASE,
      commentText:
        "vamos adicionar criação de um componente de botão para abrir/fechar o chat",
    });

    assertNoMetaPhrases(plan);
    assert.ok(plan.whatWillBeDone.some((x) => /chat/i.test(x)));
    assert.ok(plan.whatWillBeDone.some((x) => /botão/i.test(x)));
    assert.ok(plan.whatWillBeDone.some((x) => /responsiv/i.test(x)));
    assert.ok(plan.whatWillBeDone.some((x) => /tema/i.test(x)));
    assert.ok(
      plan.outOfScope.some((x) => /envio real de mensagens|funcionalidade real/i.test(x)),
    );
    assert.ok(
      plan.completionCriteria.some(
        (c) => /chat/i.test(c) && (/botão|abrir|fechar/i.test(c) || plan.whatWillBeDone.length >= 2),
      ),
    );
  });

  it("filtra plano fonte skip-llm e incorpora comentário de botão", () => {
    const pollutedBase = {
      understanding: {
        summary:
          "Plano refinado de forma determinística (sem LLM), alinhado com o plano inicial.",
        mainObjective: null,
      },
      whatWillBeDone: [
        "Rever task-plan-initial.md e task-discovery.md em conjunto com clarification-answers.json",
        "Executar a implementação conforme o plano refinado (fora do âmbito deste comando)",
        "Criar componente visual de chat reutilizável",
        "Garantir responsividade",
      ],
      whatWillChange: [],
      outOfScope: [
        "Execução técnica, revisão automática, orquestração DAG",
        "Backend do chat",
      ],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: {
        level: "high",
        levelLabelPt: "Alta",
        explanation: "Impacto em runtime e DAG",
      },
      executionRecommendation: {
        recommendedLevel: "high",
        levelLabelPt: "Alta",
        explanation: "Normal",
      },
      miniTasks: {
        mode: "direct",
        directLabelPt: "Direto",
        tasks: [{ id: "mt-1", title: "deterministic-review", order: 1 }],
      },
      risks: [
        {
          id: "r1",
          label: "O modo skip-llm não interpreta nuance semântica",
          level: "medium",
          levelLabelPt: "Médio",
        },
      ],
      completionCriteria: [
        "O ficheiro task-plan-refined.md existe e contém todas as secções",
      ],
      hasContent: true,
    };

    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: pollutedBase,
      commentText:
        "criar tambem componente de botão, que vai ser capaz de abrir/fechar o chat",
    });

    assertNoMetaPhrases(plan);
    assert.ok(plan.whatWillBeDone.some((x) => /chat/i.test(x)));
    assert.ok(plan.whatWillBeDone.some((x) => /botão/i.test(x)));
    assert.ok(
      !plan.whatWillBeDone.some((x) => /task-plan|clarification|skip-llm|DAG/i.test(x)),
    );
    assert.ok(plan.outOfScope.some((x) => /backend/i.test(x)));
    assert.ok(
      !plan.risks.some((r) => /skip-llm|nuance semântica/i.test(r.label)),
    );
    assert.ok(
      plan.risks.some((r) => /design system|responsiv|reutiliz/i.test(r.label)),
    );
    assert.ok(
      !plan.completionCriteria.some((c) => /ficheiro|task-plan-refined/i.test(c)),
    );
  });

  it("sanitizeUpdatedPlanPresentation remove frases legadas", () => {
    const cleaned = sanitizeUpdatedPlanPresentation({
      understanding: {
        summary: "Plano atualizado após comentário: foo",
        mainObjective: null,
      },
      whatWillBeDone: ["Ajustar interface conforme comentário do utilizador"],
      whatWillChange: [],
      outOfScope: [],
      executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
      complexity: {
        level: "medium",
        levelLabelPt: "Média",
        explanation: "Complexidade recalculada após o comentário (medium).",
      },
      executionRecommendation: {
        recommendedLevel: "normal",
        levelLabelPt: "Normal",
        explanation: "Recomendação ajustada para nível normal após revisão.",
      },
      miniTasks: {
        mode: "direct",
        directLabelPt: "Execução direta do plano atualizado",
        tasks: [],
      },
      risks: [],
      completionCriteria: ["Plano v2 reflete o comentário"],
      hasContent: true,
    });
    assert.equal(cleaned.understanding.summary, null);
    assert.equal(cleaned.whatWillBeDone.length, 0);
    assert.equal(cleaned.completionCriteria.length, 0);
    assert.ok(!/recalculada/i.test(cleaned.complexity.reason || ""));
  });
});
