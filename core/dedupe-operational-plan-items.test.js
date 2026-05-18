"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { dedupeOperationalItems, semanticKey } = require("./dedupe-operational-plan-items.js");

describe("dedupe-operational-plan-items", () => {
  it("deduplica botões semanticamente equivalentes", () => {
    assert.equal(
      semanticKey("Criar botão visual para abrir e fechar o chat"),
      semanticKey("Adicionar um botão que permita abrir e fechar o chat"),
    );
    const out = dedupeOperationalItems([
      "Criar botão visual para abrir e fechar o chat",
      "Adicionar um botão que permita abrir e fechar o chat",
    ]);
    assert.equal(out.length, 1);
    assert.match(out[0], /^Criar botão/i);
  });

  it("mantém itens distintos", () => {
    const out = dedupeOperationalItems([
      "Criar componente visual de chat reutilizável",
      "Garantir responsividade em desktop e mobile",
    ]);
    assert.equal(out.length, 2);
  });
});
