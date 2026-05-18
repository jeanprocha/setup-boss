import type { ApiRuntimeEventRow, RuntimeEventDto } from "@/lib/api/runtime-types";
import type { WorkspaceRunSsePayload } from "@/lib/workspace/sse/workspace-run-sse-types";
import {
  humanizeRawTypeLabel,
  sanitizeHumanMessage,
  sanitizeHumanTitle,
} from "./humanize-runtime-copy.ts";
import type {
  RuntimeUxEvent,
  RuntimeUxKind,
  RuntimeUxPhase,
  RuntimeUxRawInput,
} from "@/lib/runtime/ux/runtime-ux-types";

type CoercedRaw = {
  id: string;
  type: string;
  timestamp: string;
  runId: string | null;
  projectId: string | null;
  message: string | null;
  data: Record<string, unknown>;
  raw: unknown;
};

const SYSTEM_NOISE_TYPES = new Set([
  "scheduler_tick",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "worker_idle",
  "worker_busy",
  "workspace_run_sync.tick",
  "job_available",
  "job_scheduled",
  "job_delayed",
  "retry_available",
  "retry_scheduled",
]);

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isApiRuntimeEventRow(v: unknown): v is ApiRuntimeEventRow {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as ApiRuntimeEventRow).type === "string" &&
    typeof (v as ApiRuntimeEventRow).id === "string" &&
    "timestamp" in v
  );
}

function isRuntimeEventDto(v: unknown): v is RuntimeEventDto {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as RuntimeEventDto).tsIso === "string" &&
    typeof (v as RuntimeEventDto).message === "string" &&
    "channel" in v
  );
}

function isWorkspaceRunSsePayload(v: unknown): v is WorkspaceRunSsePayload {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as WorkspaceRunSsePayload).eventType === "string" &&
    typeof (v as WorkspaceRunSsePayload).workspaceRunId === "string"
  );
}

function coerceRaw(input: RuntimeUxRawInput): CoercedRaw {
  if (isWorkspaceRunSsePayload(input)) {
    const data: Record<string, unknown> = {
      status: input.status,
      workspaceRunId: input.workspaceRunId,
      workspaceId: input.workspaceId,
      miniActivityId: input.miniActivityId ?? null,
    };
    return {
      id: `${input.eventType}:${input.timestamp}:${input.workspaceRunId}`,
      type: input.eventType,
      timestamp: input.timestamp,
      runId: input.runId ?? null,
      projectId: input.projectId ?? null,
      message: input.message ?? null,
      data,
      raw: input,
    };
  }

  if (isApiRuntimeEventRow(input)) {
    const data =
      input.data && typeof input.data === "object" && !Array.isArray(input.data)
        ? { ...input.data }
        : {};
    return {
      id: String(input.id),
      type: String(input.type),
      timestamp: input.timestamp || new Date(0).toISOString(),
      runId: input.runId != null ? String(input.runId) : null,
      projectId: input.projectId != null ? String(input.projectId) : null,
      message:
        readString(data.message) ??
        readString(data.reason) ??
        readString(data.detail) ??
        null,
      data,
      raw: input,
    };
  }

  if (isRuntimeEventDto(input)) {
    const data =
      input.payload && typeof input.payload === "object"
        ? { ...input.payload }
        : {};
    return {
      id: String(input.id),
      type: String(input.type || input.message || "unknown"),
      timestamp: input.tsIso,
      runId: input.runId,
      projectId: readString(data.projectId),
      message: input.message,
      data,
      raw: input,
    };
  }

  const obj = input as Record<string, unknown>;
  const type =
    readString(obj.type) ??
    readString(obj.eventType) ??
    readString(obj.message) ??
    "unknown";
  const timestamp =
    readString(obj.timestamp) ??
    readString(obj.tsIso) ??
    new Date(0).toISOString();
  const data =
    obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)
      ? { ...(obj.data as Record<string, unknown>) }
      : obj.payload && typeof obj.payload === "object" && !Array.isArray(obj.payload)
        ? { ...(obj.payload as Record<string, unknown>) }
        : {};

  return {
    id: readString(obj.id) ?? `${type}:${timestamp}`,
    type,
    timestamp,
    runId:
      obj.runId != null
        ? String(obj.runId)
        : readString(data.runId),
    projectId:
      obj.projectId != null
        ? String(obj.projectId)
        : readString(data.projectId),
    message: readString(obj.message) ?? readString(data.detail),
    data,
    raw: input,
  };
}

function inferKind(type: string): RuntimeUxKind {
  const t = type.toLowerCase();

  if (/^workspace_run(\.|_)/.test(t)) return "workspace";
  if (/^workspace_run_sync\./.test(t)) return "workspace";
  if (/intake|run_created/.test(t)) return "intake";
  if (/knowledge/.test(t)) return "knowledge";
  if (/git_branch|git_/.test(t)) return "git";
  if (/task_plan|refinement|refined|refine/.test(t) && !/approv/.test(t)) {
    return "plan";
  }
  if (/approval|approv|clarification_reject|clarification_refine/.test(t)) {
    return "approval";
  }
  if (/clarif/.test(t)) return "clarification";
  if (/strategy|decomposition|complexity/.test(t)) return "strategy";
  if (/review|operational_review/.test(t)) return "review";
  if (/operational_finalization|finalization/.test(t)) return "review";
  if (/correction|retry_started/.test(t)) return "correction";
  if (/execution|phase_|subtask|handoff|runtime_started|runtime_finished/.test(t)) {
    return "execution";
  }
  if (/job_|worker_|scheduler_|daemon_|maintenance_|recovery_|runtime_recovered|runtime_stale|runtime_orphaned/.test(t)) {
    return "system";
  }
  return "unknown";
}

function inferPhase(type: string, data: Record<string, unknown>): RuntimeUxPhase {
  const t = type.toLowerCase();

  if (/failed|crash|stuck|recovery_failed|workspace_run\.error/.test(t)) {
    return "failed";
  }
  if (/reject/.test(t) && !/recovered/.test(t)) return "failed";
  if (
    /waiting_user|waiting_approval|waiting_clarification|approval_requested|questions_generated/.test(
      t,
    ) ||
    readString(data.status) === "waiting_user_action"
  ) {
    return "waiting";
  }
  if (
    /task_plan_.*_created|clarification_approve/.test(t) ||
    /completed|conclu|approved|ready_for_execution|strategy_ready|phase2_ready/.test(
      t,
    ) ||
    (t === "strategy_completed" && data.skipped === true)
  ) {
    return "completed";
  }
  if (/started|triggered|enqueued|initialized/.test(t)) {
    return "started";
  }
  if (/requested/.test(t) && t !== "approval_requested") {
    return "started";
  }
  if (/created/.test(t)) {
    return "started";
  }
  if (/progress|running|phase_started|decomposition|llm_/.test(t)) {
    return "running";
  }
  if (SYSTEM_NOISE_TYPES.has(t)) return "info";
  return "info";
}

type EventCopy = { title: string; message: string };

function buildEventCopy(
  type: string,
  kind: RuntimeUxKind,
  phase: RuntimeUxPhase,
  data: Record<string, unknown>,
  fallbackMessage: string | null,
): EventCopy {
  const t = type.toLowerCase();
  const questionsCount =
    typeof data.questionsCount === "number" ? data.questionsCount : null;
  const phaseName =
    readString(data.phase) ??
    readString(data.phaseId) ??
    readString(data.name);
  const skipped = data.skipped === true;

  const known: Record<string, EventCopy> = {
    run_created: {
      title: "Run iniciado",
      message: "Intake e enfileiramento da corrida.",
    },
    intake_completed: {
      title: "Intake concluído",
      message: "Pedido registado e pronto para clarificação.",
    },
    clarification_questions_generated: {
      title: "Perguntas geradas",
      message:
        questionsCount != null
          ? `${questionsCount} pergunta(s) aguardam resposta.`
          : "Aguarda respostas de clarificação.",
    },
    clarification_answers_submitted: {
      title: "Respostas recebidas",
      message: "Clarificação submetida pelo utilizador.",
    },
    clarification_initialized: {
      title: "Clarificação inicializada",
      message:
        questionsCount === 0
          ? "Estado diagnóstico sem perguntas."
          : "Sessão de clarificação pronta.",
    },
    task_plan_initial_created: {
      title: "Plano inicial criado",
      message: "Primeira versão do plano disponível.",
    },
    task_plan_refined_created: {
      title: "Plano refinado criado",
      message: "Refinamento do plano concluído.",
    },
    refinement_failed: {
      title: "Refinamento falhou",
      message: readString(data.error) ?? "Não foi possível refinar o plano.",
    },
    approval_requested: {
      title: "Aprovação necessária",
      message: "Plano aguarda decisão humana.",
    },
    clarification_approve: {
      title: "Plano aprovado",
      message: "Aprovação recebida — a seguir para estratégia.",
    },
    clarification_approved: {
      title: "Plano aprovado",
      message: "Aprovação recebida — a seguir para estratégia.",
    },
    clarification_reject: {
      title: "Plano rejeitado",
      message: "Revisão solicitada pelo utilizador.",
    },
    clarification_refine: {
      title: "Refinamento solicitado",
      message: "Pedido de refinamento do plano.",
    },
    strategy_requested: {
      title: "Estratégia solicitada",
      message: "Geração de estratégia enfileirada.",
    },
    strategy_started: {
      title: "Estratégia em curso",
      message: "Gerando estratégia operacional…",
    },
    strategy_completed: {
      title: "Estratégia concluída",
      message: skipped
        ? "Nenhuma decomposição adicional necessária."
        : "Estratégia operacional pronta.",
    },
    strategy_failed: {
      title: "Estratégia falhou",
      message: readString(data.error) ?? "Falha na geração de estratégia.",
    },
    strategy_auto_started_after_approval: {
      title: "Estratégia auto-iniciada",
      message: "Arranque automático após aprovação.",
    },
    execution_triggered: {
      title: "Execução enfileirada",
      message: "Pedido de execução registado.",
    },
    execution_start_blocked: {
      title: "Execução bloqueada",
      message:
        readString(data.message) ??
        "Não foi possível iniciar a execução neste momento.",
    },
    execution_started: {
      title: "Execução iniciada",
      message: "Executor a processar a corrida.",
    },
    execution_completed: {
      title: "Execução concluída",
      message: "Pipeline de execução terminou com sucesso.",
    },
    execution_failed: {
      title: "Execução falhou",
      message: readString(data.error) ?? "Falha durante a execução.",
    },
    review_started: {
      title: "Revisão iniciada",
      message: "Resultado em revisão.",
    },
    review_completed: {
      title: "Revisão concluída",
      message: "Revisão finalizada.",
    },
    review_rejected: {
      title: "Revisão rejeitada",
      message: "Correção ou novo ciclo pode ser necessário.",
    },
    operational_finalization_completed: {
      title: "Atividade finalizada",
      message: "Finalização operacional concluída.",
    },
    operational_finalization_adjustment_requested: {
      title: "Ajuste final solicitado",
      message: "Revisão reaberta para ajustes.",
    },
    git_branch_failed: {
      title: "Falha ao preparar branch",
      message: readString(data.message) ?? "Não foi possível preparar a branch.",
    },
    correction_started: {
      title: "Correção iniciada",
      message: "Aplicando correção ao resultado.",
    },
    correction_completed: {
      title: "Correção concluída",
      message: "Correção aplicada com sucesso.",
    },
    git_branch_prepared: {
      title: "Branch Git preparada",
      message: readString(data.branch) ?? "Branch de trabalho pronta.",
    },
    "workspace_run.started": {
      title: "Workspace run iniciado",
      message: "Sincronização de workspace em curso.",
    },
    "workspace_run.advanced": {
      title: "Workspace run avançou",
      message: readString(data.status) ?? "Fase do workspace atualizada.",
    },
    "workspace_run.waiting_user_action": {
      title: "Ação humana no workspace",
      message: "Workspace aguarda intervenção.",
    },
    "workspace_run.completed": {
      title: "Workspace run concluído",
      message: "Sincronização de workspace terminada.",
    },
    "workspace_run.failed": {
      title: "Workspace run falhou",
      message: readString(data.message) ?? "Falha na sincronização do workspace.",
    },
    "workspace_run.error": {
      title: "Erro no workspace",
      message: readString(data.message) ?? "Erro de sincronização.",
    },
    phase_started: {
      title: phaseName ? `Fase: ${phaseName}` : "Fase iniciada",
      message: "Pipeline em progresso.",
    },
    phase_completed: {
      title: phaseName ? `Fase concluída: ${phaseName}` : "Fase concluída",
      message: "Etapa do pipeline concluída.",
    },
    phase_failed: {
      title: phaseName ? `Fase falhou: ${phaseName}` : "Fase falhou",
      message: readString(data.error) ?? "Falha numa fase do pipeline.",
    },
  };

  const exact = known[t];
  if (exact) return exact;

  if (kind === "workspace" && phase === "waiting") {
    return {
      title: "Workspace aguarda ação",
      message: fallbackMessage ?? "Intervenção necessária no workspace.",
    };
  }

  if (phase === "waiting") {
    return {
      title: "Aguarda ação humana",
      message: fallbackMessage ?? "Intervenção do utilizador necessária.",
    };
  }

  if (phase === "failed") {
    return {
      title: "Falha na etapa",
      message:
        sanitizeHumanMessage(fallbackMessage) ||
        "Ocorreu um problema nesta etapa.",
    };
  }

  if (phase === "completed") {
    return {
      title: "Etapa concluída",
      message: sanitizeHumanMessage(fallbackMessage) || "Etapa finalizada.",
    };
  }

  if (phase === "running" || phase === "started") {
    return {
      title: "Em progresso",
      message: sanitizeHumanMessage(fallbackMessage) || "A processar…",
    };
  }

  const title = sanitizeHumanTitle(humanizeRawTypeLabel(type));
  const message =
    sanitizeHumanMessage(fallbackMessage) ||
    (kind === "unknown" ? "" : "Atividade registada.");
  return { title, message };
}

/** Transforma evento bruto (API, DTO, SSE workspace ou genérico) em evento UX normalizado. */
export function normalizeRuntimeEvent(input: RuntimeUxRawInput): RuntimeUxEvent {
  const coerced = coerceRaw(input);
  const kind = inferKind(coerced.type);
  const phase = inferPhase(coerced.type, coerced.data);
  const copy = buildEventCopy(
    coerced.type,
    kind,
    phase,
    coerced.data,
    coerced.message,
  );

  return {
    id: coerced.id,
    timestamp: coerced.timestamp,
    kind,
    phase,
    title: sanitizeHumanTitle(copy.title),
    message: sanitizeHumanMessage(copy.message),
    runId: coerced.runId,
    projectId: coerced.projectId,
    raw: coerced.raw,
  };
}

/** Normaliza e ordena cronologicamente uma lista de eventos brutos. */
export function normalizeRuntimeUxEvents(
  inputs: readonly RuntimeUxRawInput[],
): RuntimeUxEvent[] {
  return [...inputs]
    .map(normalizeRuntimeEvent)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
