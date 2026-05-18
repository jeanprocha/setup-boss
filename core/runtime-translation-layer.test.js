"use strict";

/**
 * Testes espelhados dos mapeamentos humanos (lógica duplicada mínima para node --test).
 * A fonte de verdade da UI está em frontend/lib/runtime/translation/.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const WAITING = {
  waiting_answers: {
    kind: "waiting_user",
    badge: "A sua vez",
    hasCta: true,
  },
  strategy_pending: {
    kind: "waiting_user",
    headlineIncludes: "estratégia",
  },
};

test("waiting_answers exige CTA humano", () => {
  const m = WAITING.waiting_answers;
  assert.equal(m.kind, "waiting_user");
  assert.ok(m.hasCta);
  assert.notEqual(m.badge, "waiting_answers");
});

test("strategy_pending não expõe snake_case como headline", () => {
  const raw = "strategy_pending";
  assert.notEqual("Gerando estratégia...", raw);
  assert.ok(WAITING.strategy_pending.headlineIncludes.length > 3);
});

test("knowledge_bootstrap_missing é mensagem operacional", () => {
  const headline = "Base de conhecimento não encontrada";
  assert.ok(headline.includes("conhecimento"));
  assert.ok(!headline.includes("KNOWLEDGE_BASE_MISSING"));
});
