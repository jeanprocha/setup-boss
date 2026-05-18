import type {
  ObservabilityDaemonLogEntryDto,
  RuntimeEventDto,
} from "../../api/runtime-types.ts";
import {
  classifyRuntimeEventVisibility,
  isHiddenRawEventType,
} from "../ux/classify-runtime-event-visibility.ts";
import { normalizeRuntimeEvent } from "../ux/normalize-runtime-event.ts";
import type { RuntimeLogEntryViewModel } from "./runtime-log-entry-view-model.ts";

/** Sub-eventos de estratégia/execução que permanecem só na vista técnica. */
const PROGRESS_SUBSTEP_DENY =
  /strategy_(context_prepared|plan_loaded|decomposition_|llm_|artifacts_|complexity_|ai_strategy|execution_order|shared_runtime|handoff)|runtime\.strategy_|decomposition_|complexity_analysis|execution_order|shared_runtime|handoff|phase_started$/i;

/** Marcos operacionais explícitos (todas as fases). */
const OPERATIONAL_MILESTONE_ALLOW =
  /run_created|intake_|spec_|questions_generated|answers_submitted|task_plan|plan_refined|refinement_|clarification_|approval|approv|git_branch|versioning|strategy_(requested|started|completed|failed|auto)|phase2_ready|execution_(triggered|started|completed|failed|blocked|ready|auto)|execution_start_blocked|operational_review|operational_finalization|review_|correction_|workspace_run\.(started|advanced|waiting|completed|failed|error|git)|governance\.ia|waiting_user|blocked|dirty|uncommitted|knowledge/i;

function readEventType(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  if (typeof o.type === "string") return o.type.toLowerCase();
  if (typeof o.eventType === "string") return o.eventType.toLowerCase();
  if (typeof o.message === "string") return o.message.toLowerCase();
  return "";
}

function isRelevantSeverity(entry: RuntimeLogEntryViewModel): boolean {
  return (
    entry.level === "error" ||
    entry.level === "warn" ||
    entry.displayLevel === "ERROR" ||
    entry.displayLevel === "WARN"
  );
}

function isBlockerOrFailureCopy(entry: RuntimeLogEntryViewModel): boolean {
  const blob =
    `${entry.stepTitle} ${entry.shortMessage} ${readEventType(entry.rawEvent)}`.toLowerCase();
  return /fail|erro|block|bloque|reject|dirty|uncommitted|ausente|missing|mismatch|required|pendente/.test(
    blob,
  );
}

function isDaemonOperational(d: ObservabilityDaemonLogEntryDto): boolean {
  const type = String(d.message || "").toLowerCase();
  if (!type) return false;
  if (isHiddenRawEventType(type)) return false;
  if (/^runtime\.(emit|projects|output_dir)/i.test(type)) return false;
  if (/^scheduler_|^maintenance_|^worker_|^job_(claimed|available|scheduled)/i.test(type)) {
    return false;
  }
  if (d.level === "ERROR" || d.level === "WARN") return true;
  if (OPERATIONAL_MILESTONE_ALLOW.test(type)) return true;
  if (/block|fail|dirty|branch|clarif|strategy|execut|review|finaliz/i.test(type)) {
    return true;
  }
  return false;
}

function isRuntimeEventOperational(ev: RuntimeEventDto): boolean {
  const ux = normalizeRuntimeEvent(ev);
  const visibility = classifyRuntimeEventVisibility(ux);
  if (visibility === "hidden" || visibility === "technical") return false;

  const type = String(ev.type || ev.message || "").toLowerCase();
  if (isHiddenRawEventType(type)) return false;

  if (ev.severity === "error" || ev.severity === "warn") return true;
  const failBlob = `${ux.title} ${ux.message} ${type}`.toLowerCase();
  if (/fail|erro|block|bloque|reject|dirty|uncommitted|ausente|mismatch|required/.test(failBlob)) {
    return true;
  }

  if (OPERATIONAL_MILESTONE_ALLOW.test(type)) {
    if (PROGRESS_SUBSTEP_DENY.test(type) && ev.severity === "info") return false;
    return true;
  }

  if (visibility === "operational") {
    if (PROGRESS_SUBSTEP_DENY.test(type) && ev.severity === "info") return false;
    return true;
  }

  return false;
}

/**
 * Decide se uma linha deve aparecer em «Logs do runtime» (vista operacional).
 * Não remove dados do backend — só filtro de UI.
 */
export function isOperationalRuntimeLogEntry(
  entry: RuntimeLogEntryViewModel,
): boolean {
  if (entry.source === "ui" || entry.category === "validation" || entry.category === "execution") {
    return true;
  }
  if (isRelevantSeverity(entry) || isBlockerOrFailureCopy(entry)) return true;

  if (entry.uiTier === "noise") return false;

  const raw = entry.rawEvent;
  if (raw && typeof raw === "object" && "code" in raw && "traceId" in raw) {
    return true;
  }

  if (entry.source === "daemon") {
    return isDaemonOperational(raw as ObservabilityDaemonLogEntryDto);
  }

  if (entry.source === "event") {
    return isRuntimeEventOperational(raw as RuntimeEventDto);
  }

  if (entry.uiTier === "technical") return false;

  const type = readEventType(raw);
  if (isHiddenRawEventType(type)) return false;
  if (OPERATIONAL_MILESTONE_ALLOW.test(type)) {
    if (PROGRESS_SUBSTEP_DENY.test(type)) return isRelevantSeverity(entry);
    return true;
  }

  return entry.uiTier === "important";
}

export function filterOperationalRuntimeLogEntries(
  entries: readonly RuntimeLogEntryViewModel[],
): RuntimeLogEntryViewModel[] {
  return entries.filter(isOperationalRuntimeLogEntry);
}
