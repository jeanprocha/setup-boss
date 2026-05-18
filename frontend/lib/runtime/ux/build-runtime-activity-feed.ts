import type { RuntimeUxEvent, RuntimeUxPhase } from "./runtime-ux-types.ts";
import { filterOperationalUxEvents } from "./classify-runtime-event-visibility.ts";
import {
  isExecutionMacroKind,
  mapUxKindToVisualCheckpoint,
} from "./operational-visual-model.ts";
import {
  isTechnicalLookingCopy,
  sanitizeHumanMessage,
  sanitizeHumanTitle,
} from "./humanize-runtime-copy.ts";

export type ActivityFeedIconKind =
  | "success"
  | "warn"
  | "running"
  | "error"
  | "info";

export type RuntimeActivityFeedItem = {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  /** Macro-fase visual (ex.: «Execução» para strategy/review/correction). */
  macroPhaseLabel: string | null;
  icon: ActivityFeedIconKind;
  raw: unknown;
  uxEvent: RuntimeUxEvent;
};

function macroPhaseLabelForEvent(ev: RuntimeUxEvent): string | null {
  const visual = mapUxKindToVisualCheckpoint(ev.kind);
  if (!visual) return null;
  if (isExecutionMacroKind(ev.kind) && ev.kind !== "execution") {
    return "Execução";
  }
  switch (visual) {
    case "intake":
      return "Intake";
    case "clarification":
      return "Clarificação";
    case "refined_plan":
      return "Plano refinado";
    case "versioning":
      return "Versionamento";
    case "execution":
      return "Execução";
    case "completed":
      return "Concluído";
    default:
      return null;
  }
}

function iconForPhase(phase: RuntimeUxPhase): ActivityFeedIconKind {
  switch (phase) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "waiting":
      return "warn";
    case "running":
    case "started":
      return "running";
    default:
      return "info";
  }
}

function dedupeFeedItems(items: RuntimeActivityFeedItem[]): RuntimeActivityFeedItem[] {
  const byKey = new Map<string, RuntimeActivityFeedItem>();
  for (const item of items) {
    const type = String(
      (item.uxEvent.raw as { type?: string })?.type ?? item.title,
    ).toLowerCase();
    const minute = item.timestamp.slice(0, 16);
    const key = `${type}:${minute}`;
    byKey.set(key, item);
  }
  return [...byKey.values()].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
}

/** Constrói itens do feed humano a partir de eventos UX normalizados. */
export function buildRuntimeActivityFeed(
  events: readonly RuntimeUxEvent[],
): RuntimeActivityFeedItem[] {
  const operational = filterOperationalUxEvents(events);
  const items = operational
    .map((ev) => {
      const title = sanitizeHumanTitle(ev.title);
      const message = sanitizeHumanMessage(ev.message);
      if (isTechnicalLookingCopy(title) && !message) return null;
      return {
        id: ev.id,
        timestamp: ev.timestamp,
        title,
        message,
        macroPhaseLabel: macroPhaseLabelForEvent(ev),
        icon: iconForPhase(ev.phase),
        raw: ev.raw,
        uxEvent: ev,
      };
    })
    .filter((row): row is RuntimeActivityFeedItem => row != null);
  return dedupeFeedItems(items).slice(-120);
}
