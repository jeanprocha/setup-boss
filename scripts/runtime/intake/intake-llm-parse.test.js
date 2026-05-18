"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  parseTaskIntakeLlmOutput,
  MARK_DISCOVERY,
  MARK_PLAN,
} = require("./intake-llm-parse");

test("parser extrai discovery e plan a partir dos marcadores", () => {
  const raw = `${MARK_DISCOVERY}
## Entendimento da Task
x
${MARK_PLAN}
## Objetivo
y
`;
  const r = parseTaskIntakeLlmOutput(raw);
  assert.strictEqual(r.ok, true);
  if (r.ok) {
    assert.ok(r.taskDiscoveryMarkdown.includes("## Entendimento da Task"));
    assert.ok(!r.taskDiscoveryMarkdown.includes(MARK_PLAN));
    assert.ok(r.taskPlanInitialMarkdown.includes("## Objetivo"));
  }
});

test("parser falha sem marcador discovery", () => {
  const r = parseTaskIntakeLlmOutput(`intro\n${MARK_PLAN}\n## Objetivo\nz`);
  assert.strictEqual(r.ok, false);
  if (!r.ok) {
    assert.strictEqual(r.error.code, "INTAKE_LLM_PARSE_MISSING_MARKERS");
  }
});

test("parser falha com texto antes do primeiro marcador", () => {
  const r = parseTaskIntakeLlmOutput(`nota\n${MARK_DISCOVERY}\n## A\n${MARK_PLAN}\n## B`);
  assert.strictEqual(r.ok, false);
});

test("parser ignora BOM inicial", () => {
  const raw = `\uFEFF${MARK_DISCOVERY}\n## Entendimento da Task\na\n${MARK_PLAN}\n## Objetivo\nb\n`;
  const r = parseTaskIntakeLlmOutput(raw);
  assert.strictEqual(r.ok, true);
});

test("parser falha com bloco discovery vazio", () => {
  const r = parseTaskIntakeLlmOutput(`${MARK_DISCOVERY}\n\n${MARK_PLAN}\n## Objetivo\nx`);
  assert.strictEqual(r.ok, false);
  if (!r.ok) {
    assert.strictEqual(r.error.code, "INTAKE_LLM_PARSE_EMPTY_BLOCK");
  }
});
