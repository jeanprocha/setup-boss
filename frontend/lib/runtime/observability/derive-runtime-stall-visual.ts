import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { isLowSignalEventType } from "@/lib/runtime/observability/observability-event-helpers";
import {
  classifyRuntimeLogTier,
  runtimeEventToNormalizedInput,
} from "@/lib/runtime/observability/normalize-runtime-log-for-ui";

/** Derivação visual apenas — não persiste estado de run. */
export type RuntimeStallVisualLevel = "normal" | "warning" | "stalled" | "critical";

export const STALL_WARNING_MS = 60_000;
export const STALL_STALLED_MS = 5 * 60_000;
export const STALL_CRITICAL_MS = 10 * 60_000;

const NOISE_STALL_TYPES = new Set([
  "scheduler_tick",
  "maintenance_queue_pruned",
  "maintenance_events_pruned",
  "worker_idle",
  "worker_busy",
  "strategy_waiting_user_action",
]);

const MEANINGFUL_EXACT_TYPES = new Set([
  "strategy_started",
  "strategy_completed",
  "execution_started",
  "execution_progress",
  "execution_completed",
  "correction_started",
  "review_started",
  "review_completed",
  "runtime.strategy_started",
  "runtime.strategy_completed",
  "strategy_auto_started_after_approval",
  "strategy_requested",
  "clarification_approve",
  "clarification_approved",
  "phase2_ready_for_execution",
]);

const MEANINGFUL_PATTERN = [
  /^phase_started$/i,
  /^phase_completed$/i,
  /^phase_failed$/i,
  /^runtime\.emit\./i,
];

const STRATEGY_READY_PHASES = new Set([
  "strategy_ready",
  "ready_for_execution",
]);

const TERMINAL_RUN_STATES = new Set([
  "success",
  "failed",
  "recovered",
]);

const TERMINAL_EXECUTION_PHASES = new Set([
  "execution_completed",
  "execution_failed",
]);

export type DeriveRuntimeStallVisualInput = {
  events: readonly RuntimeEventDto[];
  nowMs: number;
  /** Etapa em curso (strategy ou execution) — sem isto não há stall visual. */
  activelyProcessing: boolean;
  runtimePhase?: string | null;
  runState?: string | null;
  strategyReady?: boolean;
  terminal?: boolean;
  workerIdleNoJob?: boolean;
  runningJobsCount?: number | null;
  currentJobId?: string | null;
  currentRunId?: string | null;
  runKey?: string | null;
  workerState?: "idle" | "busy" | "unknown" | null;
  /** Timestamp extra quando runtimePhase muda fora dos eventos (hook). */
  phaseBumpAtMs?: number | null;
  daemonRunning?: boolean | null;
  daemonAlive?: boolean | null;
  executionLifecyclePhase?: string | null;
};

export type RuntimeStallVisual = {
  level: RuntimeStallVisualLevel;
  message: string | null;
  lastMeaningfulEventAt: number | null;
  msSinceLastMeaningful: number | null;
  suppressed: boolean;
};

export function isNoiseStallEvent(ev: RuntimeEventDto): boolean {
  const type = String(ev.type || ev.message || "").toLowerCase();
  if (MEANINGFUL_EXACT_TYPES.has(type)) return false;
  if (NOISE_STALL_TYPES.has(type)) return true;
  if (isLowSignalEventType(type)) return true;
  const tier = classifyRuntimeLogTier(runtimeEventToNormalizedInput(ev));
  return tier === "noise" || tier === "technical";
}

export function isMeaningfulStallProgressEvent(ev: RuntimeEventDto): boolean {
  const type = String(ev.type || "").toLowerCase();
  const msg = String(ev.message || "").toLowerCase();

  if (ev.severity === "error" || ev.severity === "warn") return true;

  if (MEANINGFUL_EXACT_TYPES.has(type)) return true;
  if (isNoiseStallEvent(ev)) return false;
  if (MEANINGFUL_PATTERN.some((re) => re.test(type) || re.test(msg))) return true;

  if (/strategy_(started|completed|failed)/i.test(type)) return true;
  if (/execution_(started|progress|completed)/i.test(type)) return true;
  if (/correction_started|review_started|review_completed/i.test(type)) return true;

  const prevPhase = (ev.payload as { previousPhase?: string } | null)?.previousPhase;
  const nextPhase = (ev.payload as { phase?: string } | null)?.phase ?? ev.phaseHint;
  if (prevPhase != null && nextPhase != null && prevPhase !== nextPhase) return true;

  return false;
}

export function computeLastMeaningfulEventAt(
  events: readonly RuntimeEventDto[],
  phaseBumpAtMs?: number | null,
): number | null {
  let best: number | null = null;

  for (const ev of events) {
    if (!isMeaningfulStallProgressEvent(ev)) continue;
    const t = Date.parse(ev.tsIso);
    if (!Number.isFinite(t)) continue;
    if (best == null || t > best) best = t;
  }

  if (phaseBumpAtMs != null && Number.isFinite(phaseBumpAtMs)) {
    if (best == null || phaseBumpAtMs > best) best = phaseBumpAtMs;
  }

  return best;
}

export function isStrategyReadyPhase(runtimePhase: string | null | undefined): boolean {
  const p = String(runtimePhase || "").toLowerCase();
  return STRATEGY_READY_PHASES.has(p);
}

export function isTerminalRunContext(input: {
  terminal?: boolean;
  runState?: string | null;
  runtimePhase?: string | null;
  executionLifecyclePhase?: string | null;
}): boolean {
  if (input.terminal === true) return true;
  const s = String(input.runState || "").toLowerCase();
  if (TERMINAL_RUN_STATES.has(s)) return true;
  const ep = String(input.executionLifecyclePhase || "").toLowerCase();
  if (TERMINAL_EXECUTION_PHASES.has(ep)) return true;
  return false;
}

export function isWorkerIdleForRun(input: {
  workerIdleNoJob?: boolean;
  workerState?: "idle" | "busy" | "unknown" | null;
  runningJobsCount?: number | null;
  currentJobId?: string | null;
  runKey?: string | null;
}): boolean {
  if (input.workerIdleNoJob === true) return true;
  if (input.workerState === "idle") {
    const count = input.runningJobsCount;
    if (count == null || count <= 0) {
      if (!input.currentJobId) return true;
    }
  }
  const count = input.runningJobsCount;
  if (count != null && Number.isFinite(count) && count <= 0) {
    const job = input.currentJobId;
    const runKey = input.runKey;
    if (!job) return true;
    if (runKey && String(job) !== String(runKey)) return true;
  }
  return false;
}

export function isRunWorkerMismatch(input: {
  currentRunId?: string | null;
  runKey?: string | null;
  workerState?: "idle" | "busy" | "unknown" | null;
}): boolean {
  const runKey = input.runKey;
  const currentRunId = input.currentRunId;
  if (!runKey || !currentRunId) return false;
  if (input.workerState !== "busy") return false;
  return String(currentRunId) !== String(runKey);
}

export function shouldSuppressStallVisual(
  input: Pick<
    DeriveRuntimeStallVisualInput,
    | "activelyProcessing"
    | "strategyReady"
    | "terminal"
    | "runState"
    | "runtimePhase"
    | "workerIdleNoJob"
    | "runningJobsCount"
    | "currentJobId"
    | "currentRunId"
    | "workerState"
    | "runKey"
    | "executionLifecyclePhase"
  >,
): boolean {
  if (!input.activelyProcessing) return true;
  if (
    isRunWorkerMismatch({
      currentRunId: input.currentRunId,
      runKey: input.runKey,
      workerState: input.workerState,
    })
  ) {
    return true;
  }
  if (input.strategyReady === true) return true;
  if (isStrategyReadyPhase(input.runtimePhase)) return true;
  if (
    isTerminalRunContext({
      terminal: input.terminal,
      runState: input.runState,
      runtimePhase: input.runtimePhase,
      executionLifecyclePhase: input.executionLifecyclePhase,
    })
  ) {
    return true;
  }
  if (
    isWorkerIdleForRun({
      workerIdleNoJob: input.workerIdleNoJob,
      workerState: input.workerState,
      runningJobsCount: input.runningJobsCount,
      currentJobId: input.currentJobId,
      runKey: input.runKey,
    })
  ) {
    return true;
  }
  return false;
}

export const DAEMON_OFFLINE_STALL_MESSAGE =
  "Daemon offline ou sem resposta.";

function stallMessageForLevel(
  level: RuntimeStallVisualLevel,
  msSince: number,
  daemonAlive: boolean | null | undefined,
): string | null {
  if (level === "normal") return null;
  if (daemonAlive === false) return DAEMON_OFFLINE_STALL_MESSAGE;
  const mins = Math.max(1, Math.round(msSince / 60_000));
  if (level === "warning") {
    return `Sem novos eventos há ${mins} min.`;
  }
  if (level === "stalled") {
    return "Esta etapa está demorando mais que o normal.";
  }
  return "Nenhum progresso recente detectado. Verifique o daemon/runtime.";
}

function capStallLevelForWorkerIdle(
  level: RuntimeStallVisualLevel,
  input: Pick<
    DeriveRuntimeStallVisualInput,
    "workerState" | "runningJobsCount" | "currentJobId" | "workerIdleNoJob"
  >,
): RuntimeStallVisualLevel {
  if (level !== "stalled" && level !== "critical") return level;
  if (
    isWorkerIdleForRun({
      workerIdleNoJob: input.workerIdleNoJob,
      workerState: input.workerState,
      runningJobsCount: input.runningJobsCount,
      currentJobId: input.currentJobId,
    })
  ) {
    return "normal";
  }
  return level;
}

export function deriveRuntimeStallVisual(
  input: DeriveRuntimeStallVisualInput,
): RuntimeStallVisual {
  const lastMeaningfulEventAt = computeLastMeaningfulEventAt(
    input.events,
    input.phaseBumpAtMs,
  );
  const msSinceLastMeaningful =
    lastMeaningfulEventAt != null && Number.isFinite(lastMeaningfulEventAt)
      ? input.nowMs - lastMeaningfulEventAt
      : null;

  const suppressed = shouldSuppressStallVisual(input);
  const daemonAlive =
    input.daemonAlive ?? (input.daemonRunning === false ? false : input.daemonRunning);

  if (
    input.activelyProcessing &&
    daemonAlive === false &&
    !suppressed
  ) {
    return {
      level: "critical",
      message: DAEMON_OFFLINE_STALL_MESSAGE,
      lastMeaningfulEventAt,
      msSinceLastMeaningful,
      suppressed: false,
    };
  }

  if (suppressed || msSinceLastMeaningful == null) {
    return {
      level: "normal",
      message: null,
      lastMeaningfulEventAt,
      msSinceLastMeaningful,
      suppressed,
    };
  }

  let level: RuntimeStallVisualLevel = "normal";
  if (msSinceLastMeaningful >= STALL_CRITICAL_MS) {
    level = "critical";
  } else if (msSinceLastMeaningful >= STALL_STALLED_MS) {
    level = "stalled";
  } else if (msSinceLastMeaningful >= STALL_WARNING_MS) {
    level = "warning";
  }

  level = capStallLevelForWorkerIdle(level, input);

  return {
    level,
    message: stallMessageForLevel(level, msSinceLastMeaningful, daemonAlive ?? null),
    lastMeaningfulEventAt,
    msSinceLastMeaningful,
    suppressed,
  };
}
