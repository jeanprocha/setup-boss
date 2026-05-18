"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  loadBasePlanPresentation,
  loadPlanExcerptForComment,
} = require("./load-base-plan-presentation.js");
const { generateFullUpdatedPlanPresentation } = require("./generate-full-updated-plan-presentation.js");
const {
  isMetaPlanPhrase,
  isInternalOperationalLine,
} = require("./generate-full-updated-plan-presentation.js");

describe("loadBasePlanPresentation", () => {
  /** @type {string} */
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-base-"));
    fs.writeFileSync(
      path.join(tmpDir, "task-plan-refined.md"),
      `## Objetivo
Criar componente de chat na tela de integração.

## Passos Propostos
- Criar componente visual de chat reutilizável
- Garantir responsividade
- Garantir compatibilidade com tema claro e escuro

## Fora do Escopo
- Funcionalidade real do chat
- Backend
- Persistência de mensagens

## Critérios de Aceite
- Componente integrado na tela de integrações
`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tmpDir, "clarification-answers.json"),
      JSON.stringify({
        answers: [
          {
            question_id: "q1",
            question: "Qual o objetivo?",
            answer: "criar componente de chat",
          },
          {
            question_id: "q2",
            question: "O que entra no escopo?",
            answer: "componente visual apenas",
          },
          {
            question_id: "q3",
            question: "Critério de conclusão?",
            answer:
              "componente reutilizável, responsivo e compatível com tema claro/escuro",
          },
        ],
      }),
      "utf-8",
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reconstrói v1 a partir de markdown e clarificação", () => {
    const base = loadBasePlanPresentation(tmpDir, "c-new");
    assert.ok(base?.hasContent);
    assert.ok(/chat/i.test(base.understanding.mainObjective || ""));
    assert.ok(base.whatWillBeDone.some((x) => /componente visual.*chat/i.test(x)));
    assert.ok(
      base.outOfScope.some((x) => /envio real de mensagens|funcionalidade real/i.test(x)),
    );
  });

  it("remove metainstruções de task-plan-refined skip-llm", () => {
    const skipDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-skip-"));
    fs.writeFileSync(
      path.join(skipDir, "task-plan-refined.md"),
      `## Objetivo
Plano refinado de forma determinística (sem LLM).

## Passos Propostos
1. Rever \`task-plan-initial.md\` e \`task-discovery.md\`
2. Criar componente visual de chat reutilizável
3. Garantir responsividade e tema claro/escuro

## Fora do Escopo
- Execução técnica, orquestração DAG
- Backend do chat

## Riscos Restantes
- O modo skip-llm não interpreta nuance semântica

## Critérios de Aceite
- O ficheiro task-plan-refined.md existe
`,
      "utf-8",
    );
    try {
      const base = loadBasePlanPresentation(skipDir, "c-skip");
      assert.ok(base?.hasContent);
      const all = [
        base.understanding.summary,
        base.understanding.mainObjective,
        ...base.whatWillBeDone,
        ...base.outOfScope,
        ...base.completionCriteria,
        ...base.risks.map((r) => r.label),
      ].filter(Boolean);
      for (const line of all) {
        assert.equal(isInternalOperationalLine(String(line)), false, String(line));
        assert.equal(isMetaPlanPhrase(String(line)), false, String(line));
      }
      assert.ok(base.whatWillBeDone.some((x) => /chat/i.test(x)));
      assert.ok(!base.whatWillBeDone.some((x) => /task-plan-initial/i.test(x)));
    } finally {
      fs.rmSync(skipDir, { recursive: true, force: true });
    }
  });

  it("gera v2 completo no fluxo servidor (sem basePresentation prévio)", () => {
    const excerpt = loadPlanExcerptForComment(tmpDir, "c-new");
    assert.ok(/O que será feito:/i.test(excerpt));

    const base = loadBasePlanPresentation(tmpDir, "c-new");
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: base,
      planExcerpt: excerpt,
      commentText:
        "vamos adicionar criação de um componente de botão para abrir/fechar o chat",
    });

    assert.ok(plan.whatWillBeDone.some((x) => /chat/i.test(x)));
    assert.ok(
      plan.whatWillBeDone.some((x) => /botão/i.test(x) && /abrir|fechar/i.test(x)),
    );
    assert.ok(
      plan.outOfScope.some((x) => /envio real de mensagens|funcionalidade real/i.test(x)),
    );

    const all = [
      plan.understanding.summary,
      ...plan.whatWillBeDone,
      ...plan.completionCriteria,
    ].filter(Boolean);
    for (const line of all) {
      assert.equal(isMetaPlanPhrase(String(line)), false, `meta: ${line}`);
    }
  });
});
