import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OperationalExecutableStrategyDto } from "../strategy/strategy-types.ts";
import {
  buildOperationalPlanExecutableView,
  hasExpectedImpactContent,
  shouldShowExpectedImpactSection,
} from "./operational-plan-executable-view.ts";

function richOes(
  overrides: Partial<OperationalExecutableStrategyDto> = {},
): OperationalExecutableStrategyDto {
  return {
    available: true,
    degraded: false,
    version: 1,
    planVersion: "v1",
    sourcePlanVersion: "v1",
    strategySha256: "abc",
    orderingMode: "linear",
    executionPattern: "sequential_by_step",
    macroOrder: ["mini-001-base", "mini-002-ui"],
    dependencies: [
      {
        fromId: "mini-001-base",
        toId: "mini-002-ui",
        label: "UI depende da base",
        kind: "blocks",
      },
    ],
    validationApproach: "per_mini_task",
    expectedImpact: {
      affectedFiles: ["frontend/components/ChatPanel.tsx"],
      affectedComponents: ["ChatPanel"],
      affectedModules: ["integrações"],
      structuralRisk: "low",
      visualRisk: "medium",
      behaviorRisk: "low",
      summary: null,
    },
    miniTasks: [
      {
        id: "mini-001-base",
        subtaskId: "001",
        order: 1,
        title: "Criar componente base",
        objective: "Estruturar o componente reutilizável de chat.",
        scope: {
          summary: "Componentes de integração, estilos visuais.",
          highlights: [],
        },
        affectedFiles: [],
        affectedDomains: ["frontend"],
        dependsOnIds: [],
        complexity: "medium",
        risk: "low",
        acceptanceCriteria: [
          "componente renderiza corretamente",
          "layout responsivo",
        ],
        completionCriteria: [],
        validationHints: [],
      },
      {
        id: "mini-002-ui",
        subtaskId: "002",
        order: 2,
        title: "Integrar na tela",
        objective: "Ligar o chat à página de integrações.",
        scope: { summary: null, highlights: [] },
        affectedFiles: [],
        affectedDomains: [],
        dependsOnIds: ["mini-001-base"],
        complexity: "medium",
        risk: "medium",
        acceptanceCriteria: [],
        completionCriteria: ["botão abre e fecha o painel"],
        validationHints: [],
      },
    ],
    approvalState: { approved: false, strategySha256: "abc" },
    ...overrides,
  };
}

describe("buildOperationalPlanExecutableView", () => {
  it("projeta OES completo com mini-tarefas ricas e dependência", () => {
    const view = buildOperationalPlanExecutableView(richOes());
    assert.ok(view);
    assert.equal(view.mode, "full");
    assert.equal(view.miniTasks.length, 2);
    assert.match(view.miniTasks[0].title, /componente base/i);
    assert.match(view.miniTasks[0].objective ?? "", /reutilizável/i);
    assert.match(view.miniTasks[0].scopeSummary ?? "", /integração/i);
    assert.equal(view.miniTasks[0].complexityLabelPt, "Média");
    assert.equal(view.miniTasks[0].riskLabelPt, "Baixo");
    assert.ok(view.miniTasks[0].completionCriteria.length >= 2);
    assert.match(
      view.miniTasks[1].dependencyLine ?? "",
      /Depende de: Mini-tarefa 1 — Criar componente base/,
    );
    assert.match(view.executionStrategy?.narrative ?? "", /sequencial/i);
    assert.match(view.executionStrategy?.narrative ?? "", /cada etapa/i);
    assert.ok(hasExpectedImpactContent(view.expectedImpact));
  });

  it("retorna modo degradado sem mini-tarefas", () => {
    const view = buildOperationalPlanExecutableView(
      richOes({ available: false, degraded: true, miniTasks: [] }),
    );
    assert.ok(view);
    assert.equal(view.mode, "degraded");
    assert.equal(view.miniTasks.length, 0);
    assert.match(view.degradedNotice ?? "", /indisponível/i);
    assert.match(view.impactUnavailableNotice ?? "", /Impacto detalhado/i);
  });

  it("retorna null quando OES ausente", () => {
    assert.equal(buildOperationalPlanExecutableView(null), null);
    assert.equal(buildOperationalPlanExecutableView(undefined), null);
  });

  it("impacto vazio não marca conteúdo útil", () => {
    const view = buildOperationalPlanExecutableView(
      richOes({
        expectedImpact: {
          affectedFiles: [],
          affectedComponents: [],
          affectedModules: [],
          structuralRisk: "medium",
          visualRisk: "medium",
          behaviorRisk: "medium",
          summary: null,
        },
      }),
    );
    assert.ok(view);
    assert.equal(view.expectedImpact, null);
    assert.equal(shouldShowExpectedImpactSection(view), false);
  });

  it("modo degradado mostra secção de impacto com aviso", () => {
    const view = buildOperationalPlanExecutableView(
      richOes({ degraded: true, available: true }),
    );
    assert.ok(view);
    assert.equal(view.mode, "degraded");
    assert.equal(shouldShowExpectedImpactSection(view), true);
  });
});
