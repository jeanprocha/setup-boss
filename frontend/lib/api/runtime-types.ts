import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";

/** GET /runtime/heartbeat — diagnóstico operacional mínimo. */
export type RuntimeHeartbeatDto = {
  daemonAlive: boolean;
  runningJobsCount: number;
  currentJobId: string | null;
  currentRunId: string | null;
  lastRuntimeActivityAt: string | null;
  workerState: "idle" | "busy";
  queueSize: number;
  daemonStartedAt: string | null;
  updatedAt: string;
};

/** Resposta mínima GET /health (daemon real). */
export type RuntimeHealthDto = {
  ok: boolean;
  daemon: "running" | "stopped" | string;
  pid: number | null;
  uptimeMs: number | null;
};

/** Estado derivado para a UI (sem expor paths internos). */
export type RuntimeConnectionState = {
  /** ligação ao proxy + upstream com sucesso */
  reachable: boolean;
  /** fila ou subsistema com anomalia (GET /status) */
  degraded: boolean;
  /** dados apresentados vêm do runtime ou UI offline */
  dataSource: "runtime" | "offline";
  lastError: string | null;
  daemon: "running" | "stopped" | "unknown";
};

export type ProjectSummaryDto = {
  id: string;
  displayName: string;
  /** Linha para title/tooltip: path, id técnico */
  technicalSummary?: string | null;
  /** Texto curto para UI — contagens agregadas, nunca path absoluto */
  subtitle: string | null;
  lastSeenAt: string | null;
};

/** Estado Git exposto pelo runtime (run-context.git + gate de execução). */
export type RunGitSummaryDto = {
  status?: string;
  activityBranch?: string;
  errorCode?: string;
  errorMessage?: string;
  /** Código do gate server-side quando POST /execute seria bloqueado */
  executeBlockCode?: string;
  /** HEAD actual do repositório (quando o gate de execução falha) */
  currentBranch?: string;
  pushStatus?: string;
  pushRemote?: string;
  pushBranch?: string;
  pushedAt?: string | null;
  pushErrorMessage?: string | null;
};

export type RunSummaryDto = {
  id: string;
  runId: string | null;
  projectId: string | null;
  label: string;
  /** Título curto do daemon (prioridade sobre composição local) */
  activityTitle?: string | null;
  /** Texto original do pedido (intake), quando disponível no job */
  taskInput?: string | null;
  archived?: boolean;
  phase: string;
  state: RuntimeUiState;
  startedAtLabel: string | null;
  /** Nunca path completo — só rótulo curto se existir branch explícita no job */
  branchHint: string | null;
  /** Persistência Git da corrida (quando disponível no daemon) */
  git?: RunGitSummaryDto | null;
  /** Status bruto do job na fila (para regras de acções) */
  jobStatus?: string;
  /** Chave `workflow.*` para rótulo honesto na lista (P1c) */
  operationalStatusKey?: string | null;
  retryable?: boolean;
};

export type RuntimeEventDto = {
  id: string;
  /** ISO 8601 para ordenação / timeline */
  tsIso: string;
  /** Relógio curto (pt-PT) */
  ts: string;
  channel: "orchestrator" | "runtime" | "policy" | "integrity";
  message: string;
  severity: "info" | "warn" | "error";
  type: string;
  jobId: string | null;
  runId: string | null;
  /** Fase narrativa quando derivável (ex. phase_started) */
  phaseHint: string | null;
  /** Dados brutos do daemon (checkpoint operacional) */
  payload?: Record<string, unknown> | null;
  /** Metadados de observabilidade (ex.: client-audit vs artifact-backed) */
  metadata?: {
    source?: string;
    derivedFrom?: string;
    notArtifactBacked?: boolean;
    requestId?: string;
    [key: string]: unknown;
  };
};

/** Payload bruto /projects */
export type ApiProjectRow = {
  projectId: string;
  projectRoot?: string;
  displayName: string;
  jobCounts?: Record<string, number>;
  lastSeenAt?: string | null;
};

/** Job resumido da API (summarizeJob). */
export type ApiJobSummary = {
  id: string;
  status: string;
  projectId?: string | null;
  taskArg?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  runId?: string | null;
  retryable?: boolean;
  activityTitle?: string | null;
  archived?: boolean;
  metadata?: Record<string, unknown> | null;
  branchHint?: string | null;
  git?: RunGitSummaryDto | null;
};

export type ApiRuntimeEventRow = {
  id: string;
  jobId?: string | null;
  runId?: string | null;
  type: string;
  timestamp: string;
  projectId?: string | null;
  data?: Record<string, unknown>;
};

export type ObservabilityDaemonLogEntryDto = {
  id: string;
  tsIso: string | null;
  level: string;
  category: string;
  message: string;
  detail: string | null;
  detailTruncated?: boolean;
  detailBytes?: number;
};

export type ObservabilityQueueJobDto = {
  id: string;
  status: string;
  runId: string | null;
  projectId: string | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  retryable: boolean;
  attempts: number | null;
  errorMessage?: string | null;
};

export type RunObservabilityBundleDto = {
  runKey: string;
  outputDirBasename: string | null;
  queueJob: ObservabilityQueueJobDto | null;
  daemonLogEntries: ObservabilityDaemonLogEntryDto[];
};
