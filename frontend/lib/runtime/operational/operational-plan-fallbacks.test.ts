import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackComplexity,
  buildFallbackExecutionRecommendation,
  inferComplexityLevelFromScope,
} from "./operational-plan-fallbacks.ts";

const baseSignals = {
  whatWillBeDone: ["Criar componente de chat na tela de integrações"],
  whatWillChange: ["Tela de integrações"],
  outOfScope: [],
  risks: [],
  understandingSummary: "Adicionar chat lateral reutilizável",
  mainObjective: null,
};

describe("operational-plan-fallbacks", () => {
  it("infere complexidade média para escopo visual típico", () => {
    assert.equal(inferComplexityLevelFromScope(baseSignals), "medium");
    const cx = buildFallbackComplexity(baseSignals);
    assert.equal(cx.levelLabelPt, "Média");
    assert.match(cx.explanation ?? "", /chat|componente|integra/i);
  });

  it("recomenda Padrão quando complexidade é média", () => {
    const cx = buildFallbackComplexity(baseSignals);
    const rec = buildFallbackExecutionRecommendation(cx, baseSignals);
    assert.equal(rec.recommendedLevel, "normal");
    assert.equal(rec.levelLabelPt, "Padrão");
    assert.match(rec.explanation ?? "", /equilíbrio|qualidade|custo/i);
  });

  it("infere complexidade alta para escopo estrutural amplo", () => {
    const level = inferComplexityLevelFromScope({
      ...baseSignals,
      whatWillBeDone: [
        "Refatorar módulos de API",
        "Alterar regras de negócio",
        "Migrar pipeline",
        "Atualizar daemon",
        "Revisar arquitetura",
        "Ajustar runtime",
      ],
      risks: ["a", "b", "c"],
    });
    assert.equal(level, "high");
  });
});
