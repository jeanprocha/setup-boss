import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import {
  buildHumanCompletionCriteria,
  buildHumanRisks,
  buildHumanWhatWillBeDone,
  buildHumanSummaryFromClarification,
  filterHumanOperationalLines,
  isInternalOperationalText,
} from "./operational-plan-humanize.ts";
import { parseRefinedPlanPresentation } from "../clarification/parse-refined-plan.ts";
import { translateOperationalPlan } from "./translate-operational-plan.ts";

describe("isInternalOperationalText", () => {
  it("detecta diagnóstico do runtime", () => {
    assert.equal(
      isInternalOperationalText(
        "O ficheiro task-plan-refined.md existe no output da run.",
      ),
      true,
    );
    assert.equal(
      isInternalOperationalText("skip-llm não interpreta nuance semântica"),
      true,
    );
  });

  it("aceita linguagem de implementação", () => {
    assert.equal(
      isInternalOperationalText("Pode haver conflito de estilos no dark mode"),
      false,
    );
  });
});

describe("buildHumanSummaryFromClarification", () => {
  it("sintetiza resumo a partir das respostas HITL", () => {
    const bundle = {
      questions: [
        {
          id: "q1",
          prompt: "Qual é o objetivo final desta atividade?",
          status: "answered",
          answer: "criar o componente de chat",
          blocking: true,
        },
        {
          id: "q2",
          prompt: "Quais arquivos, telas ou módulos provavelmente estão envolvidos?",
          status: "answered",
          answer: "integração",
          blocking: true,
        },
        {
          id: "q3",
          prompt: "O que está fora do escopo por enquanto?",
          status: "answered",
          answer: "funcionalidade do chat, por hora apenas visual",
          blocking: false,
        },
        {
          id: "q4",
          prompt: "Qual critério mínimo define que esta etapa foi concluída com sucesso?",
          status: "answered",
          answer: "componente reutilizável, responsivo e tema claro/escuro",
          blocking: true,
        },
      ],
    } as unknown as ClarificationBundleDto;

    const summary = buildHumanSummaryFromClarification(bundle);
    assert.ok(summary);
    assert.match(summary!, /componente de chat/i);
    assert.match(summary!, /integração/i);
    assert.doesNotMatch(summary!, /skip-llm/i);
  });
});

describe("translateOperationalPlan humanizado", () => {
  it("não expõe critérios técnicos nem skip-llm", () => {
    const plan = translateOperationalPlan({
      clarification: {
        session: {
          runId: "r1",
          phase2Status: "plan_refined",
          runtimePhase: "refinement_ready",
          currentRound: 1,
          questionsCount: 5,
          answersCount: 5,
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
        ],
        answers: [],
        refinement: {
          available: true,
          refinedTask: "Refino determinístico local",
          scopeChanges: [],
          acceptanceCriteria: [
            "O ficheiro task-plan-refined.md existe.",
            "skip-llm não interpreta nuance semântica.",
          ],
          risks: ["Falha no motor skip-llm", "Regressão visual no layout"],
          executionReadiness: "pending_approval",
        },
        approval: { status: "pending", notes: null, decidedAt: null, planRef: null },
        source: "runtime",
        unsupportedReason: null,
      },
    });

    const text = JSON.stringify(plan).toLowerCase();
    assert.doesNotMatch(text, /skip-llm/);
    assert.doesNotMatch(text, /task-plan-refined/);
    assert.ok(
      plan.whatWillBeDone.every((s) => !s.startsWith("Critério:")),
    );
    assert.ok(plan.risks.some((r) => /layout|visual|regressão/i.test(r.label)));
    assert.equal(plan.completionCriteria.length, 0);
  });

  it("usa passos humanos da strategy em vez de critérios internos", () => {
    const refined = parseRefinedPlanPresentation({
      available: true,
      acceptanceCriteria: ["O ficheiro task-plan-refined.md existe."],
      risks: [],
    });
    const steps = buildHumanWhatWillBeDone(
      refined,
      {
        ordering: {
          sequence: [
            {
              position: 1,
              subtaskId: "s1",
              title: "Criar componente de chat",
              dependsOn: [],
              status: "ready",
            },
          ],
          orderingMode: "linear",
          readyIds: [],
          pendingIds: [],
          blockingDependencies: [],
        },
        subtasks: [],
      } as never,
      { questions: [], answers: [] } as ClarificationBundleDto,
    );
    assert.deepEqual(steps, ["Criar componente de chat"]);
  });

  it("filtra linhas internas em lote", () => {
    assert.deepEqual(
      filterHumanOperationalLines([
        "Integrar na tela",
        "task-plan-refined.md existe",
        "Integrar na tela",
      ]),
      ["Integrar na tela"],
    );
  });

  it("riscos humanos prevalecem sobre motor", () => {
    const refined = parseRefinedPlanPresentation({
      available: true,
      risks: ["Regressão no layout", "skip-llm limita refinamento"],
    });
    const risks = buildHumanRisks(refined, null);
    assert.deepEqual(risks, ["Regressão no layout"]);
  });

  it("critérios de conclusão vêm das respostas HITL", () => {
    const refined = parseRefinedPlanPresentation({
      available: true,
      acceptanceCriteria: ["O ficheiro task-plan-refined.md existe."],
    });
    const criteria = buildHumanCompletionCriteria(refined, {
      questions: [
        {
          id: "q4",
          prompt: "Qual critério mínimo define que esta etapa foi concluída com sucesso?",
          status: "answered",
          answer: "componente funcional e integrado",
          blocking: true,
        },
      ],
    } as ClarificationBundleDto);
    assert.deepEqual(criteria, ["componente funcional e integrado"]);
  });
});
