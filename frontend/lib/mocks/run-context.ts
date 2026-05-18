import type { RuntimeUiState } from "./runtime-states";

export type MockSubtask = { id: string; title: string; state: RuntimeUiState };

export type MockRisk = { id: string; label: string; level: "low" | "med" | "high" };

export type MockRunContext = {
  runId: string;
  taskTitle: string;
  taskSummary: string;
  complexity: "low" | "medium" | "high";
  aiRecommendation: string;
  subtasks: MockSubtask[];
  risks: MockRisk[];
  executionPhase: string;
};

const defaultContext: MockRunContext = {
  runId: "*",
  taskTitle: "Pipeline completo até review",
  taskSummary:
    "Normalizar artefactos de strategy, executar subtasks com gates HITL e fechar com integrity report (mock).",
  complexity: "medium",
  aiRecommendation:
    "Manter execução em modo observação; priorizar validação de patch antes de merge (sintético).",
  subtasks: [
    { id: "st-1", title: "intake-discovery", state: "success" },
    { id: "st-2", title: "clarify-approval", state: "success" },
    { id: "st-3", title: "strategy-decompose", state: "success" },
    { id: "st-4", title: "executor-apply", state: "running" },
    { id: "st-5", title: "review-gate", state: "waiting_approval" },
  ],
  risks: [
    { id: "r1", label: "Drift semântico em manifest", level: "med" },
    { id: "r2", label: "Patch volumoso (>200 LOC)", level: "low" },
  ],
  executionPhase: "execution · subtask 4/5",
};

const byRun: Record<string, Partial<MockRunContext>> = {
  "run-1024": {
    executionPhase: "execution · motor activo",
    subtasks: [
      { id: "st-1", title: "build-execution-session", state: "success" },
      { id: "st-2", title: "subtask-executor", state: "running" },
      { id: "st-3", title: "run-execution-review", state: "blocked" },
    ],
  },
  "run-1022": {
    taskTitle: "Gate de review — decisão humana",
    executionPhase: "review · HITL",
    aiRecommendation:
      "Aguardar veredito humano; não avançar executor até aprovação registada (mock).",
    subtasks: [
      { id: "st-1", title: "deterministic-review", state: "failed" },
      { id: "st-2", title: "hitl-approval", state: "waiting_approval" },
    ],
    risks: [
      { id: "r1", label: "Rejeição de review bloqueia pipeline", level: "high" },
    ],
  },
  "run-1018": {
    taskTitle: "Correção pós-review",
    complexity: "high",
    executionPhase: "review · política",
    aiRecommendation:
      "Resolver bloqueio de política antes de novo intento de apply (mock).",
    risks: [
      { id: "r1", label: "Governança semântica", level: "high" },
      { id: "r2", label: "Dependência de fase anterior", level: "med" },
    ],
  },
};

export function getMockRunContext(runId: string | null): MockRunContext {
  if (!runId) return { ...defaultContext, runId: "—" };
  const patch = byRun[runId] ?? {};
  return {
    ...defaultContext,
    ...patch,
    runId,
    subtasks: patch.subtasks ?? defaultContext.subtasks,
    risks: patch.risks ?? defaultContext.risks,
  };
}
