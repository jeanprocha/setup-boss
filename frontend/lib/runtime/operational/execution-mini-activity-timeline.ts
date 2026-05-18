import type {
  MaterializedMiniActivityDto,
  MiniActivityOperationalEventDto,
  MiniActivityOperationalEventType,
} from "../execution/execution-types.ts";

export type MiniActivityVisualState =
  | "pending"
  | "ready"
  | "running"
  | "review"
  | "correction_required"
  | "correcting"
  | "completed"
  | "failed"
  | "blocked";

export type MiniActivityTimelineTier = "active" | "compact" | "upcoming";

export type MiniActivityTimelineHistoryEntry = {
  id: string;
  at: string;
  labelPt: string;
};

const OPERATIONAL_EVENT_LABELS_PT: Record<
  MiniActivityOperationalEventType,
  string
> = {
  review_started: "Entrou em revisão",
  review_approved: "Review aprovado",
  review_rejected: "Review rejeitado",
  review_blocked: "Revisão bloqueada",
  correction_started: "Correção iniciada",
  correction_completed: "Correção concluída",
  correction_failed: "Correção falhou",
  review_retried: "Nova revisão",
};

export function labelOperationalEventType(
  type: MiniActivityOperationalEventType,
): string {
  return OPERATIONAL_EVENT_LABELS_PT[type] ?? "Atualização";
}

/** Estado visual unificado (correção/review têm prioridade sobre status base). */
export function resolveMiniActivityVisualState(
  ma: MaterializedMiniActivityDto,
): MiniActivityVisualState {
  if (ma.status === "failed") return "failed";
  if (ma.status === "blocked_by_dependency") return "blocked";
  if (ma.status === "completed" || ma.status === "skipped") return "completed";
  if (ma.correctionPhase === "correction_running") return "correcting";
  if (
    ma.correctionPhase === "correction_required" ||
    ma.correctionRequired ||
    (ma.status === "review" && ma.reviewStatus === "rejected")
  ) {
    return "correction_required";
  }
  if (ma.status === "review") return "review";
  if (ma.status === "running") return "running";
  if (ma.status === "ready") return "ready";
  return "pending";
}

export const MINI_ACTIVITY_VISUAL_STATE_LABELS_PT: Record<
  MiniActivityVisualState,
  string
> = {
  pending: "Pendente",
  ready: "Pronta",
  running: "Em execução",
  review: "Em revisão",
  correction_required: "Correção necessária",
  correcting: "Corrigindo",
  completed: "Concluída",
  failed: "Falhou",
  blocked: "Bloqueada por dependência",
};

export function labelMiniActivityVisualState(
  state: MiniActivityVisualState,
): string {
  return MINI_ACTIVITY_VISUAL_STATE_LABELS_PT[state];
}

export function deriveMiniActivityTimelineTier(
  ma: MaterializedMiniActivityDto,
  activeMiniActivityId: string | null,
): MiniActivityTimelineTier {
  const visual = resolveMiniActivityVisualState(ma);
  const isPinned = activeMiniActivityId === ma.miniActivityId;

  if (
    isPinned ||
    visual === "running" ||
    visual === "review" ||
    visual === "correcting" ||
    visual === "correction_required"
  ) {
    return "active";
  }

  if (visual === "completed" || visual === "failed") {
    return "compact";
  }

  return "upcoming";
}

function transitionExecutionStartLabel(
  from: string,
  to: string,
): string | null {
  if (to !== "running") return null;
  if (from === "pending" || from === "ready" || from === "review") {
    return "Iniciou execução";
  }
  return null;
}

function dedupeHistory(
  entries: MiniActivityTimelineHistoryEntry[],
): MiniActivityTimelineHistoryEntry[] {
  const seen = new Set<string>();
  const out: MiniActivityTimelineHistoryEntry[] = [];
  for (const e of entries) {
    const key = `${e.at}|${e.labelPt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function buildMiniActivityOperationalHistory(
  ma: MaterializedMiniActivityDto,
): MiniActivityTimelineHistoryEntry[] {
  const entries: MiniActivityTimelineHistoryEntry[] = [];

  for (const t of ma.transitionHistory) {
    const label = transitionExecutionStartLabel(t.from, t.to);
    if (!label) continue;
    entries.push({
      id: `tr-${t.at}-${t.to}`,
      at: t.at,
      labelPt: label,
    });
  }

  for (const e of ma.operationalHistory) {
    entries.push({
      id: `op-${e.at}-${e.type}`,
      at: e.at,
      labelPt: labelOperationalEventType(e.type),
    });
  }

  return dedupeHistory(entries);
}

export function resolveDependencyTitles(
  ma: MaterializedMiniActivityDto,
  all: MaterializedMiniActivityDto[],
): string[] {
  if (!ma.dependsOnMiniActivityIds.length) return [];
  const byId = new Map(all.map((m) => [m.miniActivityId, m]));
  return ma.dependsOnMiniActivityIds
    .map((id) => {
      const dep = byId.get(id);
      return dep ? `#${dep.order} ${dep.title}` : null;
    })
    .filter((x): x is string => x != null);
}

export function badgeToneForVisualState(
  state: MiniActivityVisualState,
): "neutral" | "primary" | "success" | "warning" | "danger" | "review" {
  switch (state) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "blocked":
    case "correction_required":
      return "warning";
    case "correcting":
      return "primary";
    case "review":
      return "review";
    case "running":
      return "primary";
    default:
      return "neutral";
  }
}

export function isMiniActivityExpandableByDefault(
  tier: MiniActivityTimelineTier,
): boolean {
  return tier === "active";
}

export function formatHistoryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function summarizeOperationalEvents(
  events: MiniActivityOperationalEventDto[],
): string | null {
  if (!events.length) return null;
  const last = events[events.length - 1]!;
  return labelOperationalEventType(last.type);
}
