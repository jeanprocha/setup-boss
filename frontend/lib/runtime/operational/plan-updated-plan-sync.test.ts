import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import type { OperationalPlanPresentation } from "./operational-plan-types.ts";
import type { PlanUpdatedPlanDto } from "./plan-comment-follow-up-types.ts";
import type { PlanCommentThreadState } from "./plan-approval-timeline-types.ts";
import {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  isLocalUpdatedPlanStale,
  shouldRemoteUpdatedPlanReplaceLocal,
  mergeRemoteThread,
  sanitizeThreadsUpdatedPlansFromStorage,
  prepareUpdatedPlanForPersistence,
  normalizeClientUpdatedPlan,
} from "./plan-updated-plan-sync.ts";
import {
  readPlanApprovalTimeline,
  writePlanApprovalTimeline,
  appendPlanApprovalCommentThread,
} from "./plan-approval-timeline-storage.ts";
import { createPlanApprovalUserCommentBlock } from "./plan-approval-timeline-types.ts";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { polishOperationalPlanPresentation } =
  require("../../../../core/polish-operational-plan-presentation.js") as {
    polishOperationalPlanPresentation: (
      p: OperationalPlanPresentation,
    ) => OperationalPlanPresentation;
  };

function richBase(): OperationalPlanPresentation {
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

function staleLocalPlan(): PlanUpdatedPlanDto {
  return {
    commentId: "c1",
    planVersion: 2,
    schemaVersion: 1,
    canonicalized: false,
    generatedAt: "2026-05-14T10:00:00.000Z",
    supersedesPlanVersion: 1,
    presentation: {
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
    },
  };
}

function freshRemotePlan(): PlanUpdatedPlanDto {
  const base = richBase();
  const presentation = polishOperationalPlanPresentation({
    ...base,
    whatWillBeDone: [
      ...base.whatWillBeDone,
      "Criar componente de botão para abrir/fechar o chat.",
    ],
  });
  return {
    commentId: "c1",
    planVersion: 2,
    schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
    canonicalized: true,
    generatedAt: "2026-05-18T12:00:00.000Z",
    supersedesPlanVersion: 1,
    presentation,
  };
}

function emptyThread(commentId = "c1"): PlanCommentThreadState {
  return {
    comment: {
      id: commentId,
      kind: "user_comment",
      text: "criar também componente de botão que vai abrir/fechar o chat",
      createdAt: "2026-05-14T09:00:00.000Z",
    },
    analysisStatus: "done",
    analysis: null,
    analysisError: null,
    additionalQuestions: null,
    additionalAnswers: null,
    additionalAnswersStatus: "idle",
    additionalAnswersError: null,
    updatedPlan: staleLocalPlan(),
    updatedPlanStatus: "done",
  };
}

const RUN = "run-sync-test";

describe("plan-updated-plan-sync", () => {
  const base = richBase();

  it("detecta local stale (high, sem tema, sem OOS)", () => {
    assert.equal(isLocalUpdatedPlanStale(staleLocalPlan(), base), true);
  });

  it("schemaVersion remoto maior → remoto prevalece", () => {
    const local = staleLocalPlan();
    const remote = freshRemotePlan();
    assert.equal(shouldRemoteUpdatedPlanReplaceLocal(local, remote, base), true);
  });

  it("local stale + remoto canonicalizado → substitui", () => {
    const merged = mergeRemoteThread(
      emptyThread(),
      { analysis: null, additionalQuestions: null, additionalAnswers: null, updatedPlan: freshRemotePlan() },
      base,
    );
    assert.notEqual(merged.updatedPlan, null);
    assert.equal(merged.updatedPlan?.presentation.complexity.level, "medium");
    assert.ok(merged.updatedPlan?.presentation.outOfScope.length >= 4);
    assert.ok(
      merged.updatedPlan?.presentation.completionCriteria.some((c) =>
        /tema/i.test(c),
      ),
    );
  });

  it("prepareUpdatedPlanForPersistence bloqueia stale", () => {
    assert.equal(prepareUpdatedPlanForPersistence(staleLocalPlan(), base), null);
  });

  it("normalizeClientUpdatedPlan aceita remoto fresco", () => {
    const n = normalizeClientUpdatedPlan(freshRemotePlan(), base);
    assert.ok(n);
    assert.equal(n?.schemaVersion, OPERATIONAL_PLAN_SCHEMA_VERSION);
    assert.equal(n?.canonicalized, true);
  });
});

describe("sessionStorage hydration", () => {
  beforeEach(() => {
    global.sessionStorage = {
      store: new Map<string, string>(),
      getItem(key: string) {
        return this.store.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.store.set(key, value);
      },
      removeItem(key: string) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      },
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("sanitizeThreads remove stale do sessionStorage", () => {
    const block = createPlanApprovalUserCommentBlock("botão", "c1");
    appendPlanApprovalCommentThread(RUN, block);
    writePlanApprovalTimeline(RUN, {
      version: 2,
      threads: [
        {
          ...emptyThread("c1"),
          comment: block,
        },
      ],
    });

    const state = readPlanApprovalTimeline(RUN);
    const sanitized = sanitizeThreadsUpdatedPlansFromStorage(
      state.threads,
      richBase(),
    );
    writePlanApprovalTimeline(RUN, { version: 2, threads: sanitized });

    const reloaded = readPlanApprovalTimeline(RUN);
    assert.equal(reloaded.threads[0]?.updatedPlan, null);
    assert.equal(reloaded.threads[0]?.updatedPlanStatus, "generating");
  });

  it("após merge remoto, sessionStorage guarda plano canonicalizado", () => {
    const block = createPlanApprovalUserCommentBlock("botão", "c1");
    const thread = { ...emptyThread("c1"), comment: block };
    const merged = mergeRemoteThread(
      thread,
      {
        analysis: null,
        additionalQuestions: null,
        additionalAnswers: null,
        updatedPlan: freshRemotePlan(),
      },
      richBase(),
    );
    writePlanApprovalTimeline(RUN, { version: 2, threads: [merged] });

    const stored = readPlanApprovalTimeline(RUN);
    const plan = stored.threads[0]?.updatedPlan;
    assert.equal(plan?.schemaVersion, OPERATIONAL_PLAN_SCHEMA_VERSION);
    assert.equal(plan?.canonicalized, true);
    assert.equal(plan?.presentation.complexity.level, "medium");
    assert.ok(plan?.presentation.outOfScope.length >= 4);
  });
});
