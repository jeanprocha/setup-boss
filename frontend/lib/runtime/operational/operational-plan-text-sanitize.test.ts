import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeOperationalParagraph,
  sanitizeOperationalText,
  splitHumanListItems,
} from "./operational-plan-text-sanitize.ts";
import { filterHumanOperationalLines } from "./operational-plan-humanize.ts";
import { translateOperationalPlan } from "./translate-operational-plan.ts";

describe("operational-plan-text-sanitize", () => {
  it("remove marcadores markdown e blockquote", () => {
    assert.equal(sanitizeOperationalText("> ## Contexto"), null);
    assert.equal(
      sanitizeOperationalText("> ## Critério de sucesso"),
      null,
    );
    assert.equal(
      sanitizeOperationalText("Criar componente de chat"),
      "Criar componente de chat",
    );
  });

  it("normaliza Fora: > prefixo", () => {
    assert.deepEqual(
      splitHumanListItems("Fora: > funcionalidade do chat, backend"),
      ["Funcionalidade do chat", "Backend"],
    );
  });

  it("rejeita labels vazias", () => {
    assert.equal(
      sanitizeOperationalText("Respostas de clarificação consideradas:"),
      null,
    );
  });

  it("parágrafo multilinha com blockquote", () => {
    assert.equal(
      sanitizeOperationalParagraph("> ## Contexto\n> apenas visual"),
      "apenas visual",
    );
  });
});

describe("translateOperationalPlan markdown residues", () => {
  it("não expõe ## nem > no JSON do plano", () => {
    const plan = translateOperationalPlan({
      clarification: {
        session: {
          runId: "r1",
          phase2Status: "plan_refined",
          runtimePhase: "refinement_ready",
          currentRound: 1,
          questionsCount: 4,
          answersCount: 4,
          pendingBlockingCount: 0,
          updatedAt: null,
        },
        questions: [
          {
            id: "q1",
            prompt: "Qual é o objetivo final desta atividade?",
            status: "answered",
            answer: "criar o componente de chat",
            blocking: true,
          },
          {
            id: "q3",
            prompt: "O que está fora do escopo por enquanto?",
            status: "answered",
            answer: "Fora: > funcionalidade do chat, backend, persistência",
            blocking: false,
          },
        ],
        answers: [],
        refinement: {
          available: true,
          refinedTask: "> ## Contexto\nRefino local",
          scopeChanges: ["> ## Critério de sucesso", "Respostas de clarificação consideradas:"],
          acceptanceCriteria: ["> UI pronta"],
          risks: [],
          executionReadiness: "pending_approval",
        },
        approval: { status: "pending", notes: null, decidedAt: null, planRef: null },
        source: "runtime",
        unsupportedReason: null,
      },
    });

    const text = JSON.stringify(plan);
    assert.doesNotMatch(text, /> ##/);
    assert.doesNotMatch(text, /consideradas:/i);
    assert.ok(
      plan.outOfScope.some((x) => /funcionalidade|backend|persist/i.test(x)),
    );
    assert.ok(
      filterHumanOperationalLines(["> ## Contexto"]).length === 0,
    );
  });
});
