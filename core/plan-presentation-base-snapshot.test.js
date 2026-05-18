"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  BASE_SNAPSHOT_FILE,
  SCHEMA_VERSION,
  readPlanPresentationBaseSnapshot,
  readPlanPresentationBaseSnapshotDoc,
  writePlanPresentationBaseSnapshot,
} = require("./plan-presentation-base-snapshot.js");
const { polishOperationalPlanPresentation } = require("./polish-operational-plan-presentation.js");

function richV1Presentation() {
  return polishOperationalPlanPresentation({
    understanding: {
      summary: "Chat visual na tela de Integrações.",
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
    ],
    executionStrategy: {
      macroOrder: [],
      approach: null,
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

describe("plan-presentation-base-snapshot", () => {
  /** @type {string} */
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-plan-snap-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("grava schemaVersion, generatedAt e canonicalized", () => {
    const pres = richV1Presentation();
    const doc = writePlanPresentationBaseSnapshot(tmpDir, pres, { source: "ui" });
    assert.equal(doc.schemaVersion, SCHEMA_VERSION);
    assert.ok(doc.schemaVersion >= 2);
    assert.equal(doc.canonicalized, true);
    assert.ok(doc.generatedAt);
    assert.equal(doc.planVersion, 1);
    assert.ok(fs.existsSync(path.join(tmpDir, BASE_SNAPSHOT_FILE)));
  });

  it("lê apresentação canonicalizada do disco", () => {
    const loaded = readPlanPresentationBaseSnapshot(tmpDir);
    assert.ok(loaded?.hasContent);
    assert.ok(loaded.whatWillBeDone.some((x) => /tema/i.test(x)));
    assert.ok(loaded.outOfScope.length >= 3);
    assert.equal(loaded.complexity.level, "medium");

    const meta = readPlanPresentationBaseSnapshotDoc(tmpDir);
    assert.equal(meta?.canonicalized, true);
  });
});
