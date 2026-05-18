"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOperationalPhrase,
  buildSummaryFromClarificationSlots,
  detectVisualOnlyScope,
  normalizeScopeLine,
} = require("./normalize-operational-plan-language.js");

describe("normalize-operational-plan-language", () => {
  it("corrige concatenação quebrada", () => {
    assert.match(
      normalizeOperationalPhrase("Será desenvolvido criar componente de chat"),
      /Será criado/i,
    );
    assert.match(
      normalizeOperationalPhrase("na área de tela de integrações"),
      /na tela de Integrações/i,
    );
  });

  it("padroniza PT-BR", () => {
    assert.match(
      normalizeOperationalPhrase("validar em diferentes tamanhos de ecrã"),
      /desktop e mobile|tela/i,
    );
    assert.doesNotMatch(
      normalizeOperationalPhrase("queres acrescentar anexos"),
      /queres/i,
    );
  });

  it("buildSummaryFromClarificationSlots gera frase natural", () => {
    const s = buildSummaryFromClarificationSlots(
      "criar componente de chat",
      "tela de integrações",
      "apenas visual por agora",
      "componente reutilizável, responsivo e tema claro/escuro",
    );
    assert.ok(s);
    assert.match(s, /Será criado um componente/i);
    assert.doesNotMatch(s, /Será desenvolvido criar/i);
    assert.match(s, /tela de Integrações/i);
  });

  it("escopo visual substitui funcionalidade do chat", () => {
    const line = normalizeScopeLine(
      "Ajustar funcionalidade do chat para ser só visual",
      true,
    );
    assert.match(line, /interface visual do chat/i);
    assert.doesNotMatch(line, /funcionalidade do chat/i);
  });

  it("detectVisualOnlyScope", () => {
    assert.equal(
      detectVisualOnlyScope(
        ["Criar componente visual de chat"],
        ["Backend", "Funcionalidade real do chat"],
      ),
      true,
    );
  });
});
