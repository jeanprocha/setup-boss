import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import { translateRuntimeUiState } from "@/lib/runtime/translation/runtime-translation-layer";
import { translate } from "@/lib/i18n/translate";
import { messageCatalog } from "@/locales/registry";
import { useMissionLocaleStore } from "@/stores/mission-locale-store";

/** Ordem fixa do lifecycle operacional (sem DAG). */
export const LIFECYCLE_PHASE_IDS = [
  "intake",
  "clarification",
  "strategy",
  "execution",
  "review",
  "correction",
  "rollback",
  "integrity",
  "completed",
] as const;

export type LifecyclePhaseId = (typeof LIFECYCLE_PHASE_IDS)[number];

function tCatalog(key: string): string {
  const loc = useMissionLocaleStore.getState().locale;
  return translate(messageCatalog[loc], key);
}

export function lifecyclePhaseLabel(id: LifecyclePhaseId): string {
  const out = tCatalog(`phases.${id}`);
  return out === `phases.${id}` ? id : out;
}

/** Normaliza rótulos de fase vindos da API ou mock para um passo do lifecycle. */
export function mapRawPhaseToLifecycleId(raw: string | null | undefined): LifecyclePhaseId {
  const p = String(raw || "")
    .trim()
    .toLowerCase();
  if (!p) return "intake";
  if (p === "clarify" || p === "clarification") return "clarification";
  if (p === "queue" || p === "pending" || p === "intake") return "intake";
  if (p === "strategy") return "strategy";
  if (p === "execution" || p === "running") return "execution";
  if (p === "review" || p === "waiting_approval") return "review";
  if (p === "correction" || p === "correcting") return "correction";
  if (p === "rollback") return "rollback";
  if (p === "integrity" || p === "stabilization") return "integrity";
  if (
    p === "done" ||
    p === "completed" ||
    p === "success" ||
    p === "failed" ||
    p === "cancelled"
  ) {
    return "completed";
  }
  return "execution";
}

export type IntegrityUiState = "ok" | "degraded" | "failed" | "unknown";

export function integrityStateLabel(s: IntegrityUiState): string {
  const out = tCatalog(`integrity.${s}`);
  return out === `integrity.${s}` ? s : out;
}

export function integrityBadgeClass(s: IntegrityUiState): string {
  if (s === "ok")
    return "border-emerald-600/40 bg-emerald-500/12 font-medium text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100";
  if (s === "degraded")
    return "border-amber-600/45 bg-amber-500/12 font-medium text-amber-950 dark:border-amber-500/45 dark:bg-amber-500/10 dark:text-amber-100";
  if (s === "failed") return "border-sb-failed/45 bg-sb-failed/10 text-sb-failed";
  return "border-border bg-muted/30 text-muted-foreground";
}

/** Rótulos curtos para tipos conhecidos do daemon (snake_case), conforme locale. */
export function runtimeEventTypeLabel(type: string): string {
  const t = type.toLowerCase();
  const key = `runtimeEvents.${t}`;
  const out = tCatalog(key);
  if (out !== key) return out;
  return type.replace(/_/g, " ");
}

/** @deprecated use `runtimeEventTypeLabel` */
export const runtimeEventTypeLabelPt = runtimeEventTypeLabel;

export function runtimeSeverityLabel(
  s: RuntimeEventDto["severity"],
): string {
  if (s === "error" || s === "warn") {
    const out = tCatalog(`runtimeSeverity.${s}`);
    if (out !== `runtimeSeverity.${s}`) return out;
  }
  return tCatalog("runtimeSeverity.info");
}

export function runtimeChannelLabel(
  ch: RuntimeEventDto["channel"],
): string {
  const out = tCatalog(`runtimeChannels.${ch}`);
  return out === `runtimeChannels.${ch}` ? ch : out;
}

export function severityDotClass(sev: RuntimeEventDto["severity"]): string {
  if (sev === "error") return "bg-sb-failed ring-sb-failed/40";
  if (sev === "warn") return "bg-sb-warning ring-sb-warning/35";
  return "bg-emerald-400/90 ring-emerald-500/30";
}

export function severityTextClass(sev: RuntimeEventDto["severity"]): string {
  if (sev === "error") return "text-sb-failed";
  if (sev === "warn")
    return "font-semibold text-amber-900 dark:text-sb-warning";
  return "text-muted-foreground";
}

/** Fase de apresentação estável para jobs API (queue, execution, …). */
export function runPhaseDisplayLabel(raw: string): string {
  const id = mapRawPhaseToLifecycleId(raw);
  return lifecyclePhaseLabel(id);
}

export function runtimeStateShortLabel(state: RuntimeUiState): string {
  const human = translateRuntimeUiState(state).badge;
  const out = tCatalog(`runtimeStates.${state}`);
  if (out === `runtimeStates.${state}`) return human;
  return out;
}

/** Rótulo curto na sidebar — prioriza fase operacional da missão sobre job da fila. */
export function runSummaryStatusLabel(summary: {
  state: RuntimeUiState;
  operationalStatusKey?: string | null;
}): string {
  const key = summary.operationalStatusKey?.trim();
  if (key) {
    const wf = tCatalog(`workflow.${key}`);
    if (wf !== `workflow.${key}`) return wf;
  }
  return runtimeStateShortLabel(summary.state);
}
