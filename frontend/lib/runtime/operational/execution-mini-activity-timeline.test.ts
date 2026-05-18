import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { MaterializedMiniActivityDto } from "../execution/execution-types.ts";
import {
  buildMiniActivityOperationalHistory,
  deriveMiniActivityTimelineTier,
  labelMiniActivityVisualState,
  resolveMiniActivityVisualState,
} from "./execution-mini-activity-timeline.ts";

function baseMa(
  overrides: Partial<MaterializedMiniActivityDto> = {},
): MaterializedMiniActivityDto {
  return {
    miniActivityId: "ma-1",
    miniTaskId: "mt-1",
    subtaskId: "001",
    order: 1,
    title: "Criar componente",
    objective: "Base do chat",
    scopeSummary: null,
    dependsOnMiniActivityIds: [],
    completionCriteria: ["Componente renderiza"],
    status: "pending",
    reviewState: "none",
    reviewStatus: null,
    reviewSummary: null,
    reviewArtifactRef: null,
    correctionRequired: false,
    correctionRef: null,
    correctionPhase: "none",
    reviewedAt: null,
    progress: { percent: 0, step: null },
    linkedSubtaskExecutionRel: null,
    operationalHistory: [],
    transitionHistory: [],
    ...overrides,
  };
}

describe("resolveMiniActivityVisualState", () => {
  it("running → Em execução", () => {
    assert.equal(
      labelMiniActivityVisualState(
        resolveMiniActivityVisualState(baseMa({ status: "running" })),
      ),
      "Em execução",
    );
  });

  it("review rejeitado → Correção necessária", () => {
    assert.equal(
      resolveMiniActivityVisualState(
        baseMa({
          status: "review",
          reviewStatus: "rejected",
          correctionRequired: true,
          correctionPhase: "correction_required",
        }),
      ),
      "correction_required",
    );
  });

  it("correction_running → Corrigindo", () => {
    assert.equal(
      resolveMiniActivityVisualState(
        baseMa({
          status: "review",
          correctionPhase: "correction_running",
        }),
      ),
      "correcting",
    );
  });

  it("failed → Falhou", () => {
    assert.equal(
      resolveMiniActivityVisualState(baseMa({ status: "failed" })),
      "failed",
    );
  });

  it("blocked_by_dependency → Bloqueada", () => {
    assert.equal(
      resolveMiniActivityVisualState(
        baseMa({ status: "blocked_by_dependency" }),
      ),
      "blocked",
    );
  });
});

describe("deriveMiniActivityTimelineTier", () => {
  it("ativa destacada", () => {
    assert.equal(
      deriveMiniActivityTimelineTier(
        baseMa({ status: "running" }),
        "ma-1",
      ),
      "active",
    );
  });

  it("concluída compacta", () => {
    assert.equal(
      deriveMiniActivityTimelineTier(
        baseMa({ status: "completed" }),
        "ma-2",
      ),
      "compact",
    );
  });

  it("próxima simples", () => {
    assert.equal(
      deriveMiniActivityTimelineTier(baseMa({ status: "ready" }), "ma-2"),
      "upcoming",
    );
  });
});

describe("buildMiniActivityOperationalHistory", () => {
  it("transição para running gera iniciou execução", () => {
    const history = buildMiniActivityOperationalHistory(
      baseMa({
        transitionHistory: [
          {
            at: "2026-05-17T10:00:00.000Z",
            from: "ready",
            to: "running",
            reason: "start",
          },
        ],
        operationalHistory: [
          {
            type: "review_started",
            at: "2026-05-17T10:05:00.000Z",
            reason: null,
          },
        ],
      }),
    );
    assert.equal(history.length, 2);
    assert.equal(history[0]?.labelPt, "Iniciou execução");
    assert.equal(history[1]?.labelPt, "Entrou em revisão");
  });

  it("review rejeitado e correção no histórico", () => {
    const history = buildMiniActivityOperationalHistory(
      baseMa({
        operationalHistory: [
          {
            type: "review_rejected",
            at: "2026-05-17T11:00:00.000Z",
            reason: null,
          },
          {
            type: "correction_started",
            at: "2026-05-17T11:10:00.000Z",
            reason: null,
          },
          {
            type: "correction_completed",
            at: "2026-05-17T11:20:00.000Z",
            reason: null,
          },
          {
            type: "review_retried",
            at: "2026-05-17T11:30:00.000Z",
            reason: null,
          },
        ],
      }),
    );
    assert.ok(history.some((h) => h.labelPt === "Review rejeitado"));
    assert.ok(history.some((h) => h.labelPt === "Correção iniciada"));
    assert.ok(history.some((h) => h.labelPt === "Correção concluída"));
    assert.ok(history.some((h) => h.labelPt === "Nova revisão"));
  });
});
