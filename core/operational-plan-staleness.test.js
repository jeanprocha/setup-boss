"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  planV2NeedsRegeneration,
  updatedPlanDocIsStale,
} = require("./operational-plan-staleness.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");
const { writePlanPresentationBaseSnapshot } = require("./plan-presentation-base-snapshot.js");
const { readUpdatedPlan, writeUpdatedPlan } = require("../scripts/runtime/plan-comment/plan-comment-store.js");
const {
  regenerateStaleUpdatedPlanForComment,
} = require("../scripts/runtime/plan-comment/generate-updated-plan.js");
const { normalizeAnalysisDoc } = require("../scripts/runtime/plan-comment/plan-comment-analysis-schema.js");

function richBase() {
  return polishOperationalPlanPresentation({
    understanding: {
      summary: null,
      mainObjective:
        "Criar componente visual de chat reutilizável, responsivo e compatível com tema claro/escuro.",
    },
    whatWillBeDone: [
      "Criar componente visual reutilizável do chat na tela de Integrações.",
      "Garantir responsividade do componente.",
      "Garantir compatibilidade com tema claro e escuro.",
    ],
    whatWillChange: [],
    outOfScope: [
      "Funcionalidade real do chat (envio/recebimento de mensagens).",
      "Backend ou APIs de mensagens.",
      "Persistência de histórico de conversas.",
      "Integrações com serviços externos de mensageria.",
      "Autenticação ou permissões específicas do chat.",
    ],
    executionStrategy: { macroOrder: [], approach: null, dependencies: [] },
    complexity: {
      level: "medium",
      levelLabelPt: "Média",
      reason:
        "envolve criação de componentes visuais reutilizáveis, integração na tela de Integrações, sem backend nesta fase",
      explanation:
        "envolve criação de componentes visuais reutilizáveis, integração na tela de Integrações, sem backend nesta fase",
    },
    executionRecommendation: {
      recommendedLevel: "normal",
      levelLabelPt: "Normal",
      explanation: "Equilíbrio entre qualidade e custo.",
    },
    miniTasks: { mode: "direct", directLabelPt: "Direto", tasks: [] },
    risks: [],
    completionCriteria: [
      "O componente de chat aparece corretamente na tela de Integrações.",
      "O componente é reutilizável e responsivo.",
      "O componente respeita tema claro e escuro.",
    ],
    hasContent: true,
  });
}

function staleV2Partial() {
  return {
    understanding: { summary: "Chat", mainObjective: "Criar chat" },
    whatWillBeDone: [
      "Criar componente visual reutilizável do chat.",
      "Criar componente de botão para abrir/fechar o chat.",
    ],
    whatWillChange: [],
    outOfScope: [],
    completionCriteria: ["O chat aparece corretamente", "O botão abre e fecha"],
    complexity: {
      level: "high",
      levelLabelPt: "Alta",
      reason: null,
      explanation:
        "A tarefa foi avaliada como alta porque envolve criação de componentes",
    },
    executionRecommendation: {
      recommendedLevel: "high",
      levelLabelPt: "Alta",
      explanation: "x",
    },
    miniTasks: { mode: "direct", directLabelPt: "D", tasks: [] },
    risks: [],
    hasContent: true,
  };
}

describe("operational-plan-staleness", () => {
  const base = richBase();

  it("schemaVersion antiga exige regen", () => {
    assert.equal(
      planV2NeedsRegeneration(staleV2Partial(), base, {
        schemaVersion: 1,
        canonicalized: true,
      }),
      true,
    );
  });

  it("canonicalized ausente exige regen", () => {
    assert.equal(
      planV2NeedsRegeneration(staleV2Partial(), base, {
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: false,
      }),
      true,
    );
  });

  it("perda de tema exige regen", () => {
    assert.equal(
      planV2NeedsRegeneration(staleV2Partial(), base, {
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
      }),
      true,
    );
  });

  it("outOfScope vazio com base rica exige regen", () => {
    const v2 = { ...staleV2Partial(), outOfScope: [] };
    assert.equal(
      planV2NeedsRegeneration(v2, base, {
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
      }),
      true,
    );
  });

  it("visualOnly com complexity high exige regen", () => {
    const b = richBase();
    const v2 = {
      ...b,
      whatWillBeDone: [
        ...b.whatWillBeDone,
        "Criar componente de botão para abrir/fechar o chat.",
      ],
      complexity: {
        level: "high",
        levelLabelPt: "Alta",
        reason: "escopo amplo com várias frentes",
        explanation: "escopo amplo com várias frentes",
      },
    };
    assert.equal(
      planV2NeedsRegeneration(v2, base, {
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
      }),
      true,
    );
  });

  it("plano fresco canonicalizado não exige regen", () => {
    const v2 = polishOperationalPlanPresentation({
      ...richBase(),
      whatWillBeDone: [
        ...richBase().whatWillBeDone,
        "Criar componente de botão para abrir/fechar o chat.",
      ],
    });
    assert.equal(
      planV2NeedsRegeneration(v2, base, {
        schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
        canonicalized: true,
      }),
      false,
    );
  });
});

describe("generate-updated-plan stale repair", () => {
  /** @type {string} */
  let tmpDir;
  const commentId = "c-stale-1";

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-stale-"));
    writePlanPresentationBaseSnapshot(tmpDir, richBase(), { source: "ui" });
    fs.mkdirSync(path.join(tmpDir, "plan-comments", commentId), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plan-comments", commentId, "comment.json"),
      JSON.stringify({
        id: commentId,
        text: "criar também componente de botão que vai abrir/fechar o chat",
        createdAt: new Date().toISOString(),
      }),
      "utf-8",
    );
    const analysis = normalizeAnalysisDoc(
      {
        commentId,
        classification: "update_plan",
        reason: "Atualizar plano",
        requiresNewPlan: true,
        requiresQuestions: false,
      },
      commentId,
    );
    fs.writeFileSync(
      path.join(tmpDir, "plan-comments", commentId, "plan-comment-analysis.json"),
      JSON.stringify(analysis, null, 2),
      "utf-8",
    );
    writeUpdatedPlan(tmpDir, commentId, {
      commentId,
      planVersion: 2,
      schemaVersion: 1,
      canonicalized: false,
      generatedAt: new Date().toISOString(),
      presentation: staleV2Partial(),
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("readUpdatedPlan repara artefato stale no disco", () => {
    const loaded = readUpdatedPlan(tmpDir, commentId);
    assert.ok(loaded?.presentation);
    assert.equal(loaded.schemaVersion, OPERATIONAL_PLAN_SCHEMA_VERSION);
    assert.equal(loaded.canonicalized, true);
    assert.ok(loaded.presentation.outOfScope.length >= 4);
    assert.equal(loaded.presentation.complexity.level, "medium");
    assert.ok(
      loaded.presentation.whatWillBeDone.some(
        (x) => /botão/i.test(x) && /abrir|fechar/i.test(x),
      ),
    );
    assert.ok(
      loaded.presentation.completionCriteria.some((c) => /tema/i.test(c)),
    );
  });

  it("regenerateStaleUpdatedPlanForComment sobrescreve JSON antigo", () => {
    const result = regenerateStaleUpdatedPlanForComment({
      outputDir: tmpDir,
      commentId,
      commentText: "criar também componente de botão que vai abrir/fechar o chat",
      analysis: normalizeAnalysisDoc(
        {
          classification: "update_plan",
          requiresNewPlan: true,
          requiresQuestions: false,
        },
        commentId,
      ),
    });
    assert.equal(result.ok, true);
    assert.equal(result.regenerated, true);
    assert.equal(updatedPlanDocIsStale(result.updatedPlan, richBase()), false);
  });
});
