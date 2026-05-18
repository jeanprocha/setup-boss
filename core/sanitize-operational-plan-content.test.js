"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  isInternalOperationalLine,
  filterOperationalPlanLines,
  inferProductRisksFromScope,
} = require("./sanitize-operational-plan-content.js");

describe("sanitize-operational-plan-content", () => {
  it("detecta artefactos e metainstruções internas", () => {
    const internal = [
      "Rever task-plan-initial.md e task-discovery.md",
      "Plano refinado de forma determinística (sem LLM)",
      "O modo skip-llm não interpreta nuance semântica",
      "Execução técnica, orquestração DAG",
      "Critério: o ficheiro task-plan-refined.md existe",
    ];
    for (const line of internal) {
      assert.equal(isInternalOperationalLine(line), true, line);
    }
  });

  it("mantém linhas de produto", () => {
    const ok = [
      "Criar componente visual de chat reutilizável",
      "Criar botão visual para abrir e fechar o chat",
      "Funcionalidade real do chat",
    ];
    for (const line of ok) {
      assert.equal(isInternalOperationalLine(line), false, line);
    }
  });

  it("filterOperationalPlanLines remove vazamento", () => {
    const out = filterOperationalPlanLines([
      "Criar componente visual de chat",
      "Rever clarification-answers.json",
      "Integrar na tela de Integrações",
    ]);
    assert.equal(out.length, 2);
    assert.ok(out.some((x) => /chat/i.test(x)));
    assert.ok(out.some((x) => /integra/i.test(x)));
  });

  it("inferProductRisksFromScope gera riscos reais para UI", () => {
    const risks = inferProductRisksFromScope({
      whatWillBeDone: [
        "Criar componente visual de chat reutilizável",
        "Garantir responsividade e tema claro/escuro",
      ],
      outOfScope: [],
    });
    assert.ok(risks.length >= 2);
    assert.ok(risks.some((r) => /design system/i.test(r)));
    assert.ok(!risks.some((r) => /skip-llm/i.test(r)));
  });
});
