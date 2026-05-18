import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatOperationalPlanComplexitySentence,
  formatComplexitySentence,
  normalizeComplexityObject,
} from "./operational-plan-complexity.ts";

describe("operational-plan-complexity (UI)", () => {
  it("monta frase final sem duplicação", () => {
    const sentence = formatOperationalPlanComplexitySentence({
      level: "high",
      levelLabelPt: "Alta",
      reason: "envolve integração visual e múltiplos componentes",
      explanation: "envolve integração visual e múltiplos componentes",
    });
    assert.equal(
      sentence,
      "A tarefa foi avaliada como alta porque envolve integração visual e múltiplos componentes.",
    );
    assert.doesNotMatch(sentence, /foi avaliada como.*foi avaliada como/i);
  });

  it("normaliza explanation legada completa", () => {
    const normalized = normalizeComplexityObject({
      level: "medium",
      levelLabelPt: "Média",
      reason: null,
      explanation:
        "A tarefa foi avaliada como média porque envolve criação de componentes reutilizáveis.",
    });
    assert.equal(
      normalized.reason,
      "envolve criação de componentes reutilizáveis.",
    );
    const ui = formatComplexitySentence("medium", normalized.reason, "Média");
    assert.doesNotMatch(ui, /foi avaliada como.*foi avaliada como/i);
  });
});
