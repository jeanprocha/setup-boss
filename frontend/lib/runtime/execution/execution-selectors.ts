import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type {
  ExecutionBundleDto,
  ExecutionCorrelationLink,
  ExecutionProgressDto,
  ExecutionSubtaskDto,
} from "@/lib/runtime/execution/execution-types";

const EXECUTION_EVENT_TYPES = new Set([
  "execution_started",
  "execution_triggered",
  "subtask_queued",
  "subtask_running",
  "review_started",
  "review_rejected",
  "review_completed",
  "correction_started",
  "correction_completed",
  "retry_started",
  "recovery_completed",
  "execution_recovered",
  "execution_completed",
  "execution_failed",
  "job_completed",
  "job_failed",
]);

export function computeProgressFromSubtasks(
  subtasks: ExecutionSubtaskDto[],
): ExecutionProgressDto {
  let completed = 0;
  let active = 0;
  let blocked = 0;
  let failed = 0;
  let pending = 0;

  for (const st of subtasks) {
    if (st.state === "completed" || st.state === "recovered") completed += 1;
    else if (
      st.state === "running" ||
      st.state === "reviewing" ||
      st.state === "correcting" ||
      st.state === "retrying"
    )
      active += 1;
    else if (st.state === "blocked") blocked += 1;
    else if (st.state === "failed") failed += 1;
    else pending += 1;
  }

  return {
    completed,
    active,
    blocked,
    failed,
    pending,
    total: subtasks.length,
  };
}

export function mergeProgress(
  fromApi: ExecutionProgressDto,
  subtasks: ExecutionSubtaskDto[],
): ExecutionProgressDto {
  if (fromApi.total > 0 && fromApi.completed + fromApi.pending > 0) {
    return fromApi;
  }
  return computeProgressFromSubtasks(subtasks);
}

export function selectActiveSubtask(
  bundle: ExecutionBundleDto,
): ExecutionSubtaskDto | null {
  const id = bundle.summary.lifecycle.currentSubtaskId;
  if (id) {
    const found = bundle.subtasks.find((s) => s.id === id);
    if (found) return found;
  }
  return (
    bundle.subtasks.find((s) =>
      ["running", "reviewing", "correcting", "retrying"].includes(s.state),
    ) ?? null
  );
}

export function selectOrderedSubtasks(
  subtasks: ExecutionSubtaskDto[],
): ExecutionSubtaskDto[] {
  return [...subtasks].sort((a, b) => a.order - b.order);
}

export function buildExecutionCorrelationLinks(
  bundle: ExecutionBundleDto | null,
  hasEvidence: boolean,
  hasDiagnostics: boolean,
): ExecutionCorrelationLink[] {
  const available = Boolean(bundle && bundle.summary.source !== "unsupported");
  return [
    {
      target: "timeline",
      label: "Timeline",
      available,
      hint: available ? "Eventos de execução na timeline" : null,
    },
    {
      target: "stream",
      label: "Stream",
      available,
      hint: available ? "Auditoria runtime + execução" : null,
    },
    {
      target: "diagnostics",
      label: "Diagnósticos",
      available: available && hasDiagnostics,
      hint: hasDiagnostics ? "Falhas e bloqueios" : "Indisponível offline",
    },
    {
      target: "artifacts",
      label: "Artefactos",
      available: available && hasEvidence,
      hint: hasEvidence ? "Patches e relatórios" : "Sem evidence carregada",
    },
    {
      target: "integrity",
      label: "Integridade",
      available,
      hint: "Sinal de fecho pós-execução",
    },
    {
      target: "strategy",
      label: "Estratégia",
      available,
      hint: "Ordem e subtasks planeadas",
    },
  ];
}

export function filterExecutionEvents(
  events: RuntimeEventDto[],
): RuntimeEventDto[] {
  return events.filter((e) => {
    const t = e.type.toLowerCase();
    if (EXECUTION_EVENT_TYPES.has(t)) return true;
    if (e.phaseHint === "execution") return true;
    if (t.includes("subtask") || t.includes("correction") || t.includes("retry"))
      return true;
    return false;
  });
}

export function formatDurationMs(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}
