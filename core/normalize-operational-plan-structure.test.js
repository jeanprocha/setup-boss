"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseLineToAtom,
  parseLineToAtoms,
  isMetalanguageLine,
  dedupeSentenceSyntax,
} = require("./normalize-operational-plan-structure.js");

describe("normalize-operational-plan-structure", () => {
  it("parseia metalinguagem como null", () => {
    assert.equal(
      parseLineToAtom("Adicionar ao plano a criação de um botão", true),
      null,
    );
    assert.equal(isMetalanguageLine("Adicionar ao plano a criação"), true);
  });

  it("converte linha poluída em átomo de chat visual", () => {
    const atom = parseLineToAtom(
      "funcionalidade do chat, agora é só componente visual",
      true,
    );
    assert.equal(atom?.kind, "deliverable:chat_visual");
  });

  it("dedupeSentenceSyntax remove tela duplicada", () => {
    const s = dedupeSentenceSyntax(
      "Será criado um componente na tela de Integrações na tela de Integrações.",
    );
    assert.equal((s.match(/tela de Integrações/gi) || []).length, 1);
  });

  it("parseLineToAtoms extrai múltiplos sinais numa linha composta", () => {
    const atoms = parseLineToAtoms(
      "componente reutilizável, responsivo e tema claro/escuro",
      true,
    );
    const kinds = new Set(atoms.map((a) => a.kind));
    assert.ok(kinds.has("flag:reusable"));
    assert.ok(kinds.has("task:validate_responsive"));
    assert.ok(kinds.has("task:validate_theme"));
  });

  it("parseLineToAtoms preserva chat e sinais na mesma linha", () => {
    const atoms = parseLineToAtoms(
      "Criar componente visual de chat reutilizável, responsivo e tema claro/escuro",
      true,
    );
    const kinds = new Set(atoms.map((a) => a.kind));
    assert.ok(kinds.has("deliverable:chat_visual"));
    assert.ok(kinds.has("flag:reusable"));
    assert.ok(kinds.has("task:validate_theme"));
  });
});
