import type {
  ObservabilityDaemonLogEntryDto,
  RuntimeEventDto,
} from "@/lib/api/runtime-types";
import { isLowSignalEventType } from "@/lib/runtime/observability/observability-event-helpers";

export type RuntimeLogUiTier = "important" | "progress" | "technical" | "noise";

export type NormalizedRuntimeLogInput = {
  id?: string;
  tsIso: string;
  level?: string;
  channel?: string;
  category?: string;
  type?: string;
  message: string;
  detail?: string | null;
  meta?: string | null;
  detailTruncated?: boolean;
  detailBytes?: number;
  runId?: string | null;
  phaseHint?: string | null;
  severity?: "info" | "warn" | "error";
};

export type NormalizedRuntimeLogForUi = {
  tier: RuntimeLogUiTier;
  displayMessage: string;
  compactDetail: string | null;
  omitRawPayload: boolean;
  payloadOmittedBytes: number | null;
  phase: string | null;
  shortRunId: string | null;
  level: string;
  channel: string;
};

const NOISE_EVENT_NAMES = new Set([
  "scheduler_tick",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "worker_idle",
  "worker_busy",
  "worker_started",
  "worker_stopping",
  "worker_stopped",
  "heartbeat",
  "connected",
  "stream-open",
  "workspace_run_sync.tick",
  "workspace_run_sync.summary",
  "workspace_run_sync.backoff",
  "workspace_run_sync.completed",
  "workspace_run_sync.waiting",
  "workspace_run_sync.advance",
  "job_available",
  "job_scheduled",
  "job_delayed",
  "job_claimed",
  "job_started",
  "job_completed",
  "job_enqueued",
  /** Legado pós auto-start: hint POST strategy não aplica quando inline já gerou. */
  "strategy_waiting_user_action",
]);

const TECHNICAL_EVENT_PATTERNS = [
  /^runtime\.output_dir_resolved$/i,
  /^runtime\.projects\.(pipeline|list)$/i,
  /^runtime\.projects\./i,
];

const IMPORTANT_EVENT_PATTERNS = [
  /strategy_(started|completed|failed)/i,
  /strategy_auto_start/i,
  /clarification.*approv/i,
  /clarification_approve/i,
  /phase2_ready_for_execution/i,
  /phase_started|phase_completed|phase_failed/i,
  /job_(failed|completed|cancelled)/i,
  /runtime\.emit\./i,
  /waiting_user/i,
  /strategy_waiting/i,
];

const PROGRESS_EVENT_PATTERNS = [
  /^strategy_/i,
  /^runtime\.strategy_/i,
  /decomposition/i,
  /complexity_analysis/i,
  /ai_strategy/i,
  /execution_order/i,
  /shared_runtime/i,
  /handoff/i,
  /intake_completed/i,
  /review_completed/i,
];

function shortRunId(runId: string | null | undefined): string | null {
  if (!runId) return null;
  const s = String(runId);
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

export function classifyRuntimeLogTier(
  input: Pick<
    NormalizedRuntimeLogInput,
    "type" | "message" | "channel" | "category" | "severity" | "level"
  >,
): RuntimeLogUiTier {
  const type = String(input.type || input.message || "").toLowerCase();
  const msg = String(input.message || "").toLowerCase();
  const level = String(input.level || "").toUpperCase();
  const sev = input.severity;

  if (sev === "error" || sev === "warn" || level === "ERROR" || level === "WARN") {
    return "important";
  }
  if (NOISE_EVENT_NAMES.has(type) || isLowSignalEventType(type)) return "noise";
  if (TECHNICAL_EVENT_PATTERNS.some((re) => re.test(type) || re.test(msg))) {
    return "technical";
  }
  if (IMPORTANT_EVENT_PATTERNS.some((re) => re.test(type) || re.test(msg))) {
    return "important";
  }
  if (PROGRESS_EVENT_PATTERNS.some((re) => re.test(type) || re.test(msg))) {
    return "progress";
  }
  if (input.channel === "policy" || input.channel === "integrity") return "important";
  return "technical";
}

function compactTechnicalMessage(message: string, detail: string | null): string {
  const m = message.trim();
  if (/^runtime\.projects\.pipeline$/i.test(m)) {
    const countMatch = detail?.match(/finalCount[=:]\s*(\d+)/i);
    const demoMatch = detail?.match(/demosRemoved[=:]\s*(\d+)/i);
    const n = countMatch?.[1] ?? "?";
    const d = demoMatch?.[1] ?? "0";
    return `runtime.projects.pipeline — ${n} projetos encontrados, ${d} demos removidos`;
  }
  if (/^runtime\.projects\.list$/i.test(m)) {
    return "runtime.projects.list — lista de projetos actualizada";
  }
  if (/^runtime\.output_dir_resolved$/i.test(m)) {
    return "runtime.output_dir_resolved — directório de saída resolvido";
  }
  return m;
}

function formatOmittedPayload(bytes: number): string {
  const kb = bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  return `Payload técnico grande (${kb})`;
}

export function normalizeRuntimeLogForUi(
  input: NormalizedRuntimeLogInput,
): NormalizedRuntimeLogForUi {
  const tier = classifyRuntimeLogTier(input);
  const level = String(input.level || "INFO").toUpperCase();
  const channel = input.channel || input.category || "runtime";
  const phase = input.phaseHint ?? null;
  const shortId = shortRunId(input.runId ?? null);

  if (input.detailTruncated && input.detailBytes != null) {
    return {
      tier,
      displayMessage: input.message,
      compactDetail: formatOmittedPayload(input.detailBytes),
      omitRawPayload: true,
      payloadOmittedBytes: input.detailBytes,
      phase,
      shortRunId: shortId,
      level,
      channel,
    };
  }

  const rawDetail = input.detail?.trim() || null;
  const omitHuge =
    Boolean(rawDetail && rawDetail.length > 4000) ||
    tier === "noise";

  if (tier === "technical" || tier === "noise") {
    const displayMessage = compactTechnicalMessage(input.message, rawDetail);
    return {
      tier,
      displayMessage,
      compactDetail: omitHuge && rawDetail ? formatOmittedPayload(rawDetail.length) : null,
      omitRawPayload: omitHuge,
      payloadOmittedBytes: omitHuge && rawDetail ? rawDetail.length : null,
      phase,
      shortRunId: shortId,
      level,
      channel,
    };
  }

  return {
    tier,
    displayMessage: input.message,
    compactDetail: omitHuge && rawDetail ? formatOmittedPayload(rawDetail.length) : rawDetail,
    omitRawPayload: omitHuge,
    payloadOmittedBytes: omitHuge && rawDetail ? rawDetail.length : null,
    phase,
    shortRunId: shortId,
    level,
    channel,
  };
}

export function runtimeEventToNormalizedInput(
  ev: RuntimeEventDto,
): NormalizedRuntimeLogInput {
  return {
    id: ev.id,
    tsIso: ev.tsIso,
    level:
      ev.severity === "error"
        ? "ERROR"
        : ev.severity === "warn"
          ? "WARN"
          : "INFO",
    channel: ev.channel,
    type: ev.type,
    message: ev.message,
    detail: ev.payload ? JSON.stringify(ev.payload) : null,
    runId: ev.runId,
    phaseHint: ev.phaseHint,
    severity: ev.severity,
  };
}

export function daemonEntryToNormalizedInput(
  d: ObservabilityDaemonLogEntryDto,
  fallbackTs?: string,
): NormalizedRuntimeLogInput {
  return {
    id: d.id,
    tsIso: d.tsIso ?? fallbackTs ?? "",
    level: d.level,
    channel: "daemon",
    category: d.category,
    type: d.message,
    message: d.message,
    detail: d.detail,
    detailTruncated: d.detailTruncated,
    detailBytes: d.detailBytes,
  };
}

/** Chave de dedupe quando não há id estável. */
export function runtimeLogDedupeKey(row: {
  id?: string;
  tsIso: string;
  level?: string;
  channel?: string;
  category?: string;
  message: string;
  runId?: string | null;
}): string {
  if (row.id) return row.id;
  return [
    row.tsIso,
    row.level ?? "",
    row.channel ?? row.category ?? "",
    row.message.slice(0, 200),
    row.runId ?? "",
  ].join("|");
}

const STRATEGY_ACTIVITY_LABELS: Record<string, string> = {
  run_created: "Run criada",
  intake_completed: "Intake concluído",
  spec_generated: "SPEC gerada",
  clarification_questions_generated: "Perguntas geradas",
  clarification_answers_submitted: "Respostas enviadas",
  task_plan_initial_created: "Plano gerado",
  task_plan_refined_created: "Plano refinado gerado",
  clarification_approve: "Plano aprovado",
  clarification_approved: "Plano aprovado",
  git_branch_prepared: "Branch preparada",
  git_branch_failed: "Falha ao preparar branch",
  execution_started: "Execução iniciada",
  execution_triggered: "Execução enfileirada",
  execution_enqueued: "Execução enfileirada",
  execution_ready: "Execução pronta",
  execution_runtime_started: "Execução iniciada",
  execution_runtime_completed: "Execução concluída",
  execution_completed: "Execução concluída",
  execution_failed: "Falha na execução",
  git_branch_pushed: "Branch publicada no remoto",
  subtask_execution_initialized: "Mini-tarefa preparada",
  review_completed: "Review concluído",
  operational_finalization_completed: "Atividade finalizada",
  operational_finalization_adjustment_requested: "Ajuste final solicitado",
  strategy_requested: "Estratégia solicitada",
  strategy_started: "Estratégia iniciada",
  strategy_auto_started_after_approval: "Geração automática iniciada",
  strategy_plan_loaded: "Plano refinado carregado",
  strategy_context_prepared: "Contexto preparado",
  strategy_decomposition_started: "Decomposição iniciada",
  strategy_llm_started: "Análise IA iniciada",
  strategy_llm_completed: "Análise IA concluída",
  strategy_artifacts_written: "Artefactos escritos",
  strategy_completed: "Estratégia concluída",
  strategy_failed: "Estratégia falhou",
  runtime_strategy_started: "Runtime: estratégia iniciada",
  runtime_strategy_completed: "Runtime: estratégia concluída",
  phase2_ready_for_execution: "Pronto para execução (fase 2)",
  complexity_analysis_completed: "Análise de complexidade",
  decomposition_completed: "Decomposição concluída",
};

export function strategyActivityLabel(typeOrMessage: string): string {
  const key = String(typeOrMessage || "")
    .toLowerCase()
    .replace(/^runtime\./, "");
  if (STRATEGY_ACTIVITY_LABELS[key]) return STRATEGY_ACTIVITY_LABELS[key];
  for (const [k, label] of Object.entries(STRATEGY_ACTIVITY_LABELS)) {
    if (key.includes(k)) return label;
  }
  const human = key.replace(/[._]/g, " ").trim();
  if (!human) return "Evento do runtime";
  return human.charAt(0).toUpperCase() + human.slice(1);
}

export function isMeaningfulStrategyProgressEvent(
  ev: RuntimeEventDto,
): boolean {
  const tier = classifyRuntimeLogTier(runtimeEventToNormalizedInput(ev));
  return tier === "important" || tier === "progress";
}
