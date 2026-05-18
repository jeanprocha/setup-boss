"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  suggestActivityBranchName,
  slugifyActivityTitle,
  MAX_BRANCH_LENGTH,
} = require("./suggest-activity-branch");

test("slugifyActivityTitle: acentos, espaços e lowercase", () => {
  assert.strictEqual(
    slugifyActivityTitle("Criar Chat na Integração — Botão Abrir"),
    "criar-chat-na-integracao-botao-abrir",
  );
});

test("suggestActivityBranchName: formato padrão com data fixa", () => {
  const name = suggestActivityBranchName("Criar componente de Chat", {
    date: new Date("2026-05-16T12:00:00Z"),
  });
  assert.strictEqual(name, "setup-boss/20260516-criar-componente-de-chat");
});

test("suggestActivityBranchName: remove caracteres inválidos", () => {
  const name = suggestActivityBranchName("feat@#$%foo!!bar", {
    date: new Date("2026-05-16T12:00:00Z"),
  });
  assert.ok(!name.includes("@"));
  assert.ok(!name.includes("#"));
  assert.match(name, /^setup-boss\/20260516-[a-z0-9-]+$/);
});

test("suggestActivityBranchName: respeita limite de tamanho", () => {
  const long = "a".repeat(200);
  const name = suggestActivityBranchName(long, {
    date: new Date("2026-05-16T12:00:00Z"),
  });
  assert.ok(name.length <= MAX_BRANCH_LENGTH);
});

test("suggestActivityBranchName: colisão sugere sufixo -2", () => {
  const title = "Chat integração";
  const date = new Date("2026-05-16T12:00:00Z");
  const base = suggestActivityBranchName(title, { date });
  const second = suggestActivityBranchName(title, {
    date,
    existingBranches: [base],
  });
  assert.strictEqual(second, `${base}-2`);
});

test("suggestActivityBranchName: prefixo configurável", () => {
  const name = suggestActivityBranchName("Tarefa X", {
    date: new Date("2026-05-16T12:00:00Z"),
    prefix: "acme",
  });
  assert.ok(name.startsWith("acme/20260516-"));
});
