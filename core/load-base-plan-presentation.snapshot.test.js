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
const { writePlanPresentationBaseSnapshot } = require("./plan-presentation-base-snapshot.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");
const { generateFullUpdatedPlanPresentation } = require("./generate-full-updated-plan-presentation.js");
const { BASE_SNAPSHOT_FILE } = require("./plan-presentation-base-snapshot.js");

function richSnapshotPresentation() {
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
    executionStrategy: {
      macroOrder: [],
      approach: "Implementar componentes visuais de forma incremental.",
      dependencies: [],
    },
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

describe("loadBasePlanPresentation — snapshot SSOT", () => {
  /** @type {string} */
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-snap-load-"));
    fs.writeFileSync(
      path.join(tmpDir, "task-plan-refined.md"),
      `## Objetivo
Criar chat.

## Passos Propostos
- Apenas chat sem tema nem fora do escopo explícito

## Fora do Escopo
- Backend
`,
      "utf-8",
    );
    writePlanPresentationBaseSnapshot(tmpDir, richSnapshotPresentation(), {
      source: "ui",
    });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prefere snapshot canonicalizado em vez de markdown pobre", () => {
    const base = loadBasePlanPresentation(tmpDir, "c-new");
    assert.ok(base?.hasContent);
    assert.ok(base.whatWillBeDone.some((x) => /tema/i.test(x)));
    assert.ok(base.outOfScope.length >= 4);
    assert.equal(base.complexity.level, "medium");
    assert.ok(
      base.completionCriteria.some((c) => /tema claro|tema escuro|tema claro e escuro/i.test(c)),
    );
  });

  it("gera v2 preservando tema, fora do escopo e complexidade média", () => {
    const base = loadBasePlanPresentation(tmpDir, "c-new");
    const excerpt = loadPlanExcerptForComment(tmpDir, "c-new");
    const plan = generateFullUpdatedPlanPresentation({
      basePresentation: base,
      planExcerpt: excerpt,
      commentText: "criar também componente de botão que vai abrir/fechar o chat",
    });

    assert.ok(plan.whatWillBeDone.some((x) => /botão/i.test(x) && /abrir|fechar/i.test(x)));
    assert.ok(plan.whatWillBeDone.some((x) => /tema/i.test(x)));
    assert.ok(plan.outOfScope.length >= 4);
    assert.equal(plan.complexity.level, "medium");
    assert.ok(
      plan.completionCriteria.some((c) => /tema/i.test(c)),
      "critérios devem incluir tema",
    );
  });

  it("bootstrap legado persiste snapshot quando ausente", () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-legacy-boot-"));
    try {
      fs.writeFileSync(
        path.join(legacyDir, "task-plan-refined.md"),
        `## Objetivo
Criar componente de chat na tela de integração.

## Passos Propostos
- Criar componente visual de chat reutilizável
- Garantir responsividade
- Garantir compatibilidade com tema claro e escuro

## Fora do Escopo
- Funcionalidade real do chat
- Backend
`,
        "utf-8",
      );
      assert.ok(!fs.existsSync(path.join(legacyDir, BASE_SNAPSHOT_FILE)));
      const base = loadBasePlanPresentation(legacyDir, "c1");
      assert.ok(base?.hasContent);
      assert.ok(fs.existsSync(path.join(legacyDir, BASE_SNAPSHOT_FILE)));
    } finally {
      fs.rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
