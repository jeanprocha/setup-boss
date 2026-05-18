import type {
  ObservabilityDaemonLogEntryDto,
  RuntimeEventDto,
} from "@/lib/api/runtime-types";
import { formatDurationShort } from "@/lib/runtime/observability/observability-event-helpers";
import {
  classifyRuntimeLogTier,
  daemonEntryToNormalizedInput,
  runtimeEventToNormalizedInput,
  runtimeLogDedupeKey,
  strategyActivityLabel,
} from "@/lib/runtime/observability/normalize-runtime-log-for-ui";

export type OperationalTimelineSeverity = "info" | "warn" | "error" | "success";

export type OperationalTimelineVisualState =
  | "success"
  | "running"
  | "warning"
  | "error"
  | "waiting_user"
  | "completed";

export type OperationalTimelineSource =
  | "sse"
  | "runtime"
  | "daemon"
  | "ui"
  | "observability";

export type OperationalTimelineItem = {
  id: string;
  timestamp: string;
  title: string;
  subtitle: string | null;
  severity: OperationalTimelineSeverity;
  visualState: OperationalTimelineVisualState;
  source: OperationalTimelineSource;
  relatedPhase: string | null;
  isUserAction: boolean;
  isTerminal: boolean;
};

export type OperationalTimelinePhaseGroup = {
  phase: string;
  label: string;
  items: OperationalTimelineItem[];
};

export type RunOperationalTimeline = {
  items: OperationalTimelineItem[];
  groups: OperationalTimelinePhaseGroup[];
  currentStatus: OperationalTimelineVisualState;
  currentStatusLabel: string;
  lastProgressAt: string | null;
  lastProgressLabel: string | null;
};

const PHASE_ORDER = [
  "intake",
  "clarification",
  "strategy",
  "execution",
  "review",
  "correction",
  "recovery",
  "other",
] as const;

type PhaseBucket = (typeof PHASE_ORDER)[number];

const TERMINAL_TYPES = /completed|conclu|success|failed|cancelled|ready_for_execution|strategy_ready|phase2_ready/i;
const WAITING_TYPES = /waiting_user|waiting_approval|waiting_clarification|human_action|requires_user/i;
const USER_ACTION_TYPES = /approv|submit|answer|user_action|clarification_approve/i;

function inferPhaseBucket(
  type: string,
  phaseHint: string | null,
): PhaseBucket {
  const p = String(phaseHint || "").toLowerCase();
  const t = type.toLowerCase();
  if (p.includes("intake") || /intake|run_created|job_enqueued/.test(t)) return "intake";
  if (p.includes("clarif") || /clarif/.test(t)) return "clarification";
  if (p.includes("strateg") || /strategy|decomposition|complexity/.test(t)) return "strategy";
  if (p.includes("execut") || /execution|subtask|handoff/.test(t)) return "execution";
  if (p.includes("review") || /review/.test(t)) return "review";
  if (p.includes("correct") || /correction/.test(t)) return "correction";
  if (p.includes("recover") || /recovery|integrity/.test(t)) return "recovery";
  return "other";
}

function phaseGroupLabel(phase: PhaseBucket): string {
  switch (phase) {
    case "intake":
      return "Intake";
    case "clarification":
      return "Clarificação";
    case "strategy":
      return "Estratégia";
    case "execution":
      return "Execução";
    case "review":
      return "Revisão";
    case "correction":
      return "Correcção";
    case "recovery":
      return "Recuperação";
    default:
      return "Outros";
  }
}

const OPERATIONAL_EXACT_TYPES = new Set([
  "intake_completed",
  "run_created",
  "job_enqueued",
  "clarification_approve",
  "clarification_approved",
  "strategy_started",
  "strategy_completed",
  "strategy_failed",
  "strategy_requested",
  "strategy_auto_started_after_approval",
  "execution_started",
  "execution_progress",
  "execution_completed",
  "execution_failed",
  "review_started",
  "review_completed",
  "correction_started",
  "phase_started",
  "phase_completed",
  "phase_failed",
  "phase2_ready_for_execution",
  "waiting_user_action",
  "job_completed",
  "job_failed",
]);

const OPERATIONAL_TYPE_PATTERN =
  /intake_|clarif|strategy_|execution_|review_|correction_|waiting_user|human_action|job_(completed|failed|cancelled)|phase_/i;

export function isOperationalTimelineCandidate(
  input: ReturnType<typeof runtimeEventToNormalizedInput>,
): boolean {
  const type = String(input.type || input.message || "").toLowerCase();
  if (OPERATIONAL_EXACT_TYPES.has(type)) return true;
  if (OPERATIONAL_TYPE_PATTERN.test(type)) return true;
  if (input.severity === "error" || input.severity === "warn") return true;
  const tier = classifyRuntimeLogTier(input);
  return tier === "important" || tier === "progress";
}

function resolveSource(
  ev: RuntimeEventDto,
  fromDaemon: boolean,
): OperationalTimelineSource {
  if (fromDaemon) return "daemon";
  const src = ev.metadata?.source;
  if (src === "client-audit" || ev.id.startsWith("ui-")) return "ui";
  if (src === "sse" || src === "live") return "sse";
  if (ev.channel === "orchestrator") return "runtime";
  return "observability";
}

function mapSeverity(ev: RuntimeEventDto): OperationalTimelineSeverity {
  if (ev.severity === "error") return "error";
  if (ev.severity === "warn") return "warn";
  const t = String(ev.type || "").toLowerCase();
  if (/completed|approved|ready|success|conclu/.test(t)) return "success";
  return "info";
}

function mapVisualState(
  ev: RuntimeEventDto,
  severity: OperationalTimelineSeverity,
): OperationalTimelineVisualState {
  const t = String(ev.type || ev.message || "").toLowerCase();
  if (WAITING_TYPES.test(t) || /waiting_clarification|waiting_approval/.test(t)) {
    return "waiting_user";
  }
  if (severity === "error" || /failed|error|reject/.test(t)) return "error";
  if (severity === "warn") return "warning";
  if (
    TERMINAL_TYPES.test(t) &&
    (/completed|conclu|success|ready_for_execution|strategy_ready/.test(t) ||
      /job_completed|execution_completed|run_completed/.test(t))
  ) {
    return "completed";
  }
  if (/completed|approved|ready|conclu/.test(t)) return "success";
  if (/started|progress|requested|decomposition|llm_/.test(t)) return "running";
  return "running";
}

function isTerminalEvent(ev: RuntimeEventDto): boolean {
  const t = String(ev.type || ev.message || "").toLowerCase();
  if (/failed|cancelled|error/.test(t) || ev.severity === "error") return true;
  return /completed|conclu|success|ready_for_execution|strategy_ready|job_completed|execution_completed|phase2_ready/.test(
    t,
  );
}

function titleForEvent(ev: RuntimeEventDto): string {
  const type = String(ev.type || "").toLowerCase();
  if (/intake_completed|run_created|job_enqueued/.test(type)) {
    if (type.includes("intake")) return "Run criado (intake)";
    if (type.includes("job_enqueued")) return "Job enfileirado";
    return "Run iniciado";
  }
  if (/waiting_user|waiting_approval|human_action/.test(type)) {
    return "Acção humana necessária";
  }
  if (/clarification_approve/.test(type)) return "Plano aprovado";
  if (/clarification_submitted|answers_submitted/.test(type)) {
    return "Respostas de clarificação enviadas";
  }
  if (/phase2_ready|ready_for_execution/.test(type)) {
    return "Pronto para estratégia";
  }
  if (/strategy_completed|strategy_ready/.test(type)) {
    return "Estratégia concluída";
  }
  if (/job_completed|run_completed/.test(type)) return "Run concluído";
  if (/execution_started/.test(type)) return "Execução iniciada";
  if (/execution_progress/.test(type)) return "Progresso da execução";
  if (/execution_completed/.test(type)) return "Execução concluída";
  if (/review_started/.test(type)) return "Revisão iniciada";
  if (/review_completed/.test(type)) return "Revisão concluída";
  if (/correction_started/.test(type)) return "Correcção iniciada";
  if (/strategy_failed|execution_failed|job_failed|phase_failed/.test(type)) {
    return "Falha na etapa";
  }
  const label = strategyActivityLabel(ev.type || ev.message);
  if (label !== "Evento do runtime") return label;
  const msg = String(ev.message || "").trim();
  if (msg.length > 0 && msg.length <= 80) return msg;
  return label;
}

function subtitleForEvent(ev: RuntimeEventDto): string | null {
  const detail =
    ev.payload && typeof ev.payload === "object"
      ? (ev.payload as { summary?: string; label?: string }).summary ||
        (ev.payload as { label?: string }).label
      : null;
  if (detail && String(detail).trim()) return String(detail).trim().slice(0, 120);
  const msg = String(ev.message || "").trim();
  const type = String(ev.type || "").toLowerCase();
  if (msg && msg.toLowerCase() !== type && msg.length <= 120) return msg;
  return null;
}

function runtimeEventToItem(
  ev: RuntimeEventDto,
  fromDaemon: boolean,
): OperationalTimelineItem | null {
  const input = runtimeEventToNormalizedInput(ev);
  if (!isOperationalTimelineCandidate(input)) return null;

  const type = String(ev.type || ev.message || "").toLowerCase();
  const severity = mapSeverity(ev);
  const visualState = mapVisualState(ev, severity);
  const relatedPhase =
    ev.phaseHint ?? inferPhaseBucket(type, ev.phaseHint);

  return {
    id: runtimeLogDedupeKey({
      id: ev.id,
      tsIso: ev.tsIso,
      channel: ev.channel,
      message: ev.type || ev.message,
      runId: ev.runId,
    }),
    timestamp: ev.tsIso,
    title: titleForEvent(ev),
    subtitle: subtitleForEvent(ev),
    severity,
    visualState,
    source: resolveSource(ev, fromDaemon),
    relatedPhase,
    isUserAction: USER_ACTION_TYPES.test(type) || Boolean(ev.metadata?.source === "client-audit"),
    isTerminal: isTerminalEvent(ev),
  };
}

function daemonEntryToRuntimeEvent(
  d: ObservabilityDaemonLogEntryDto,
  runKey: string | null,
): RuntimeEventDto | null {
  const input = daemonEntryToNormalizedInput(d);
  if (!isOperationalTimelineCandidate(input)) return null;
  const tsIso = d.tsIso ?? new Date().toISOString();
  const level = String(d.level || "INFO").toUpperCase();
  return {
    id: d.id,
    tsIso,
    ts: new Date(tsIso).toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    channel: "runtime",
    message: d.message,
    severity:
      level === "ERROR" ? "error" : level === "WARN" ? "warn" : "info",
    type: d.message,
    jobId: null,
    runId: runKey,
    phaseHint: null,
    metadata: { source: "daemon-log" },
  };
}

export function mergeOperationalTimelineCandidates(
  events: readonly RuntimeEventDto[],
  daemonEntries: readonly ObservabilityDaemonLogEntryDto[],
  runKey: string | null,
): RuntimeEventDto[] {
  const out: RuntimeEventDto[] = [...events];
  for (const d of daemonEntries) {
    const ev = daemonEntryToRuntimeEvent(d, runKey);
    if (ev) out.push(ev);
  }
  return out;
}

export function dedupeOperationalTimelineItems(
  items: OperationalTimelineItem[],
): OperationalTimelineItem[] {
  const byKey = new Map<string, OperationalTimelineItem>();
  const sorted = [...items].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  for (const item of sorted) {
    const prev = byKey.get(item.id);
    if (!prev) {
      byKey.set(item.id, item);
      continue;
    }
    const prevTs = Date.parse(prev.timestamp);
    const nextTs = Date.parse(item.timestamp);
    if (nextTs >= prevTs) byKey.set(item.id, item);
  }
  return [...byKey.values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
}

function groupByPhase(items: OperationalTimelineItem[]): OperationalTimelinePhaseGroup[] {
  const buckets = new Map<PhaseBucket, OperationalTimelineItem[]>();
  for (const item of items) {
    const key = inferPhaseBucket(
      item.title,
      item.relatedPhase,
    );
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }
  return PHASE_ORDER.filter((p) => buckets.has(p)).map((phase) => ({
    phase,
    label: phaseGroupLabel(phase),
    items: buckets.get(phase)!,
  }));
}

function statusLabel(state: OperationalTimelineVisualState): string {
  switch (state) {
    case "running":
      return "Em progresso";
    case "waiting_user":
      return "Aguarda acção";
    case "warning":
      return "Alerta";
    case "error":
      return "Falhou";
    case "completed":
      return "Concluído";
    case "success":
      return "Etapa concluída";
    default:
      return "A decorrer";
  }
}

function deriveCurrentStatus(
  items: OperationalTimelineItem[],
): OperationalTimelineVisualState {
  if (!items.length) return "success";
  const last = items[items.length - 1];
  if (last.isTerminal) {
    if (last.visualState === "error") return "error";
    if (last.visualState === "completed" || last.visualState === "success") {
      return "completed";
    }
  }
  const hasRunning = items.some((i) => i.visualState === "running");
  if (!hasRunning && last.isTerminal) {
    return last.visualState === "error" ? "error" : "completed";
  }
  return last.visualState;
}

export type DeriveRunOperationalTimelineInput = {
  events: readonly RuntimeEventDto[];
  daemonEntries?: readonly ObservabilityDaemonLogEntryDto[];
  runKey?: string | null;
  nowMs?: number;
};

export function deriveRunOperationalTimeline(
  input: DeriveRunOperationalTimelineInput,
): RunOperationalTimeline {
  const { events, daemonEntries = [], runKey = null, nowMs = Date.now() } = input;

  const merged = mergeOperationalTimelineCandidates(events, daemonEntries, runKey);
  const rawItems: OperationalTimelineItem[] = [];
  for (const ev of merged) {
    const fromDaemon = ev.metadata?.source === "daemon-log";
    const item = runtimeEventToItem(ev, fromDaemon);
    if (item) rawItems.push(item);
  }

  const items = dedupeOperationalTimelineItems(rawItems);
  const groups = groupByPhase(items);
  const currentStatus = deriveCurrentStatus(items);
  const nonTerminal = items.filter((i) => !i.isTerminal);
  const runningItems = items.filter((i) => i.visualState === "running");
  const lastProgress =
    runningItems.length > 0
      ? runningItems[runningItems.length - 1]
      : nonTerminal.length > 0
        ? nonTerminal[nonTerminal.length - 1]
        : items.length
          ? items[items.length - 1]
          : null;
  const lastProgressAt = lastProgress?.timestamp ?? null;
  const lastProgressMs =
    lastProgressAt != null && Number.isFinite(Date.parse(lastProgressAt))
      ? nowMs - Date.parse(lastProgressAt)
      : null;

  return {
    items,
    groups,
    currentStatus,
    currentStatusLabel: statusLabel(currentStatus),
    lastProgressAt,
    lastProgressLabel:
      lastProgressMs != null && lastProgressMs >= 0
        ? `Último progresso há ${formatDurationShort(lastProgressMs)}`
        : null,
  };
}
