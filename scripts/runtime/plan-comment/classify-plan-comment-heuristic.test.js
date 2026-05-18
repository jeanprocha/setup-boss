"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  classifyPlanCommentHeuristic,
} = require("./classify-plan-comment-heuristic.js");
const { reconcilePlanCommentClassification } = require("./plan-comment-intent.js");
const { buildQuestionResponse } = require("./classify-plan-comment-heuristic.js");

describe("classifyPlanCommentHeuristic", () => {
  it("classifica dúvida sobre dificuldade (pode dificuldade média?)", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "pode dificuldade média?",
    });
    assert.equal(r.classification, "question");
    assert.equal(r.requiresNewPlan, false);
    assert.equal(r.requiresQuestions, false);
    assert.match(r.assistantResponse, /dificuldade|complexidade|escopo/i);
  });

  it("classifica por que dificuldade média como question", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "por que dificuldade média?",
    });
    assert.equal(r.classification, "question");
    assert.equal(r.requiresQuestions, false);
  });

  it("classifica ceticismo sobre complexidade como question", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "isso não deveria ser alta?",
    });
    assert.equal(r.classification, "question");
    assert.ok(r.assistantResponse.length > 20);
  });

  it("classifica mude para dificuldade alta como update_plan", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "mude para dificuldade alta",
    });
    assert.equal(r.classification, "update_plan");
    assert.equal(r.requiresNewPlan, true);
    assert.equal(r.requiresQuestions, false);
  });

  it("classifica quero incluir backend como update_plan", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "quero incluir backend",
    });
    assert.equal(r.classification, "update_plan");
    assert.equal(r.requiresNewPlan, true);
  });

  it("classifica talvez incluir backend futuramente como needs_questions", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "talvez incluir backend futuramente",
    });
    assert.equal(r.classification, "needs_questions");
    assert.equal(r.requiresQuestions, true);
    assert.ok(r.suggestedQuestions.length > 0);
  });

  it("classifica dúvida sem alteração (backend fora do escopo)", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "Por que não vai implementar backend agora?",
      planExcerpt: "## Fora do Escopo\n- Backend",
    });
    assert.equal(r.classification, "question");
    assert.equal(r.requiresNewPlan, false);
    assert.ok(r.assistantResponse.length > 10);
  });

  it("classifica pedido claro de alteração", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "Incluir suporte a upload de anexos no chat.",
    });
    assert.equal(r.classification, "update_plan");
    assert.equal(r.requiresNewPlan, true);
    assert.ok(r.planChangeSummary);
  });

  it("classifica alteração ambígua com anexos", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "Talvez preparar para anexos futuramente.",
    });
    assert.equal(r.classification, "needs_questions");
    assert.equal(r.requiresQuestions, true);
    assert.ok(r.suggestedQuestions.length > 0);
  });

  it("classifica observação sem impacto", () => {
    const r = classifyPlanCommentHeuristic({
      commentText: "Ok, entendi.",
    });
    assert.equal(r.classification, "no_change");
    assert.equal(r.requiresNewPlan, false);
  });
});

describe("reconcilePlanCommentClassification", () => {
  it("rebaixa needs_questions do LLM para question em pergunta sobre dificuldade", () => {
    const reconciled = reconcilePlanCommentClassification(
      {
        classification: "needs_questions",
        reason: "ambiguidade",
        assistantResponse: "preciso de mais dados",
        requiresNewPlan: false,
        requiresQuestions: true,
        suggestedQuestions: ["Qual nível?"],
        planChangeSummary: "",
        mode: "llm",
      },
      "pode dificuldade média?",
      "",
      { buildQuestionResponse },
    );
    assert.equal(reconciled.classification, "question");
    assert.equal(reconciled.requiresQuestions, false);
    assert.equal(reconciled.suggestedQuestions.length, 0);
    assert.match(reconciled.assistantResponse, /dificuldade|complexidade|escopo/i);
  });
});
