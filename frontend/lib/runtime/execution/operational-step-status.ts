/**
 * Estados oficiais da timeline operacional (UI).
 * Não confundir com `RuntimeUiState` (contrato do runtime).
 */

export const OPERATIONAL_STEP_STATUSES = [
  "pending",
  "active",
  "running",
  "completed",
  "failed",
  "blocked",
  "waiting_input",
  "waiting_user",
  "paused",
  "cancelled",
] as const;

export type OperationalStepStatus =
  (typeof OPERATIONAL_STEP_STATUSES)[number];

export function isOperationalStepStatus(
  v: string,
): v is OperationalStepStatus {
  return (OPERATIONAL_STEP_STATUSES as readonly string[]).includes(v);
}

/** Ordem parcial para comparação de “avanço” (heurística de UI). */
const STATUS_ORDER: Record<OperationalStepStatus, number> = {
  pending: 0,
  waiting_input: 1,
  waiting_user: 1,
  paused: 2,
  active: 3,
  running: 4,
  blocked: 5,
  failed: 6,
  cancelled: 7,
  completed: 8,
};

export function operationalStatusRank(s: OperationalStepStatus): number {
  return STATUS_ORDER[s] ?? 0;
}

import {
  humanOperationalStepBadgeLabel,
  translateOperationalStepStatus,
} from "@/lib/runtime/translation/runtime-translation-layer";

export function operationalStepStatusLabel(
  s: OperationalStepStatus,
  ctx?: { semanticPhaseLabel?: string },
): string {
  return translateOperationalStepStatus(s, ctx).badge;
}

/** @deprecated use {@link operationalStepStatusLabel} — mantido para imports legados */
export const OPERATIONAL_STEP_STATUS_LABELS: Record<
  OperationalStepStatus,
  string
> = {
  pending: humanOperationalStepBadgeLabel("pending"),
  active: humanOperationalStepBadgeLabel("active"),
  running: humanOperationalStepBadgeLabel("running"),
  completed: humanOperationalStepBadgeLabel("completed"),
  failed: humanOperationalStepBadgeLabel("failed"),
  blocked: humanOperationalStepBadgeLabel("blocked"),
  waiting_input: humanOperationalStepBadgeLabel("waiting_input"),
  waiting_user: humanOperationalStepBadgeLabel("waiting_user"),
  paused: humanOperationalStepBadgeLabel("paused"),
  cancelled: humanOperationalStepBadgeLabel("cancelled"),
};

/** Classes Tailwind para badge compacto na sidebar. */
export function operationalStepStatusBadgeClass(
  s: OperationalStepStatus,
): string {
  switch (s) {
    case "completed":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
    case "running":
    case "active":
      return "border-sky-500/40 bg-sky-500/10 text-sky-950 dark:text-sky-100";
    case "failed":
    case "cancelled":
      return "border-sb-failed/45 bg-sb-failed/10 text-sb-failed";
    case "blocked":
      return "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    case "waiting_input":
    case "waiting_user":
      return "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100";
    case "paused":
      return "border-border bg-muted/40 text-muted-foreground";
    default:
      return "border-border/60 bg-muted/25 text-muted-foreground";
  }
}

export function isTerminalOperationalStatus(
  s: OperationalStepStatus,
): boolean {
  return s === "completed" || s === "failed" || s === "cancelled";
}

/** Step da esteira que requer ação humana ou verificação. */
export function stepNeedsUserAttention(
  s: OperationalStepStatus,
): boolean {
  return (
    s === "waiting_input" ||
    s === "waiting_user" ||
    s === "blocked" ||
    s === "failed"
  );
}
