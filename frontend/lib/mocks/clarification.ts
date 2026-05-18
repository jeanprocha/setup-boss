import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";

const waitingAnswers: ClarificationBundleDto = {
  session: {
    runId: "run-1023",
    phase2Status: "questions_generated",
    runtimePhase: "waiting_answers",
    currentRound: 1,
    questionsCount: 3,
    answersCount: 1,
    pendingBlockingCount: 2,
    updatedAt: new Date().toISOString(),
  },
  questions: [
    {
      id: "q-scope",
      prompt: "O escopo inclui alterações na Runtime API ou só frontend?",
      kind: "single_choice",
      blocking: true,
      options: ["Só frontend", "Frontend + daemon", "Indefinido — precisa discovery"],
      status: "answered",
      answer: "Frontend + daemon",
    },
    {
      id: "q-hitl",
      prompt: "Confirmar que aprovações HITL ficam auditáveis no ActivityStream?",
      kind: "confirm",
      blocking: true,
      options: [],
      status: "pending",
      answer: null,
    },
    {
      id: "q-risks",
      prompt: "Riscos conhecidos para esta entrega (texto livre).",
      kind: "free_text",
      blocking: true,
      options: [],
      status: "pending",
      answer: null,
    },
  ],
  answers: [
    {
      questionId: "q-scope",
      value: "Frontend + daemon",
      recordedAt: new Date().toISOString(),
    },
  ],
  refinement: {
    available: false,
    refinedTask: null,
    scopeChanges: [],
    acceptanceCriteria: [],
    risks: [],
    executionReadiness: "not_ready",
  },
  approval: { status: "none", notes: null, decidedAt: null, planRef: null },
  source: "mock",
  unsupportedReason: null,
};

const awaitingApproval: ClarificationBundleDto = {
  session: {
    runId: "run-1022",
    phase2Status: "plan_refined",
    runtimePhase: "awaiting_approval",
    currentRound: 1,
    questionsCount: 2,
    answersCount: 2,
    pendingBlockingCount: 0,
    updatedAt: new Date().toISOString(),
  },
  questions: [
    {
      id: "q-review",
      prompt: "Critério de aceite para fechar review gate?",
      kind: "free_text",
      blocking: true,
      options: [],
      status: "answered",
      answer: "Veredito humano registado + integrity OK",
    },
    {
      id: "q-rollback",
      prompt: "Rollback automático se review falhar?",
      kind: "confirm",
      blocking: false,
      options: [],
      status: "answered",
      answer: "true",
    },
  ],
  answers: [],
  refinement: {
    available: true,
    refinedTask: "Fechar gate de review com HITL e integrity report.",
    scopeChanges: [
      "Inclui Runtime API read-only e painel Mission Control.",
      "Exclui multi-user approvals e comentários realtime.",
    ],
    acceptanceCriteria: [
      "Operador vê perguntas e refinement no painel",
      "Aprovação/rejeição reflecte no timeline",
      "Build frontend passa",
    ],
    risks: ["Review determinístico falhou — decisão humana obrigatória"],
    executionReadiness: "pending_approval",
  },
  approval: { status: "pending", notes: null, decidedAt: null, planRef: "task-plan-refined.md" },
  source: "mock",
  unsupportedReason: null,
};

const ready: ClarificationBundleDto = {
  ...awaitingApproval,
  session: {
    ...awaitingApproval.session,
    runId: "run-ready",
    phase2Status: "ready_for_execution",
    runtimePhase: "ready_for_execution",
  },
  approval: {
    status: "approved",
    notes: "Aprovado para execução (mock).",
    decidedAt: new Date().toISOString(),
    planRef: "task-plan-refined.md",
  },
  refinement: {
    ...awaitingApproval.refinement,
    executionReadiness: "ready",
  },
};

const byRun: Record<string, ClarificationBundleDto> = {
  "run-1023": waitingAnswers,
  "run-1022": awaitingApproval,
  "run-ready": ready,
};

const emptyUnsupported = (runId: string): ClarificationBundleDto => ({
  session: {
    runId,
    phase2Status: null,
    runtimePhase: "unavailable",
    currentRound: 0,
    questionsCount: 0,
    answersCount: 0,
    pendingBlockingCount: 0,
    updatedAt: null,
  },
  questions: [],
  answers: [],
  refinement: {
    available: false,
    refinedTask: null,
    scopeChanges: [],
    acceptanceCriteria: [],
    risks: [],
    executionReadiness: "not_ready",
  },
  approval: { status: "none", notes: null, decidedAt: null, planRef: null },
  source: "unsupported",
  unsupportedReason: "Sem sessão de clarificação mock para esta corrida.",
});

export function getMockClarificationBundle(runId: string): ClarificationBundleDto {
  const base = byRun[runId] ?? emptyUnsupported(runId);
  return {
    ...base,
    session: { ...base.session, runId },
    source: base.source === "unsupported" ? "unsupported" : "mock",
  };
}

export function applyMockAnswers(
  bundle: ClarificationBundleDto,
  answers: { questionId: string; value: string }[],
): ClarificationBundleDto {
  const nextQuestions = bundle.questions.map((q) => {
    const hit = answers.find((a) => a.questionId === q.id);
    if (!hit) return q;
    return { ...q, status: "answered" as const, answer: hit.value };
  });
  const pending = nextQuestions.filter(
    (q) => q.blocking && q.status === "pending",
  ).length;
  const answersCount = nextQuestions.filter((q) => q.status === "answered").length;
  return {
    ...bundle,
    questions: nextQuestions,
    answers: [
      ...bundle.answers,
      ...answers.map((a) => ({
        questionId: a.questionId,
        value: a.value,
        recordedAt: new Date().toISOString(),
      })),
    ],
    session: {
      ...bundle.session,
      answersCount,
      pendingBlockingCount: pending,
      runtimePhase: pending > 0 ? "waiting_answers" : "refinement_ready",
      phase2Status: pending > 0 ? "questions_generated" : "answers_recorded",
    },
  };
}

export function applyMockApprove(bundle: ClarificationBundleDto): ClarificationBundleDto {
  return {
    ...bundle,
    session: {
      ...bundle.session,
      runtimePhase: "ready_for_execution",
      phase2Status: "ready_for_execution",
    },
    approval: {
      status: "approved",
      notes: "Aprovado (mock UI).",
      decidedAt: new Date().toISOString(),
      planRef: bundle.approval.planRef,
    },
    refinement: {
      ...bundle.refinement,
      executionReadiness: "ready",
    },
  };
}

export function applyMockReject(bundle: ClarificationBundleDto): ClarificationBundleDto {
  return {
    ...bundle,
    session: {
      ...bundle.session,
      runtimePhase: "rejected",
      phase2Status: "approval_rejected",
    },
    approval: {
      status: "rejected",
      notes: "Rejeitado (mock UI).",
      decidedAt: new Date().toISOString(),
      planRef: bundle.approval.planRef,
    },
  };
}
