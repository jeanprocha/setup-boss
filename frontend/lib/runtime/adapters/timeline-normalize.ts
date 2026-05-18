import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import {
  mapRawPhaseToLifecycleId,
  lifecyclePhaseLabel,
} from "@/lib/runtime/adapters/runtime-labels";

export type TimelineGroupKind = "phase" | "burst";

export type TimelineItemVm = {
  id: string;
  tsIso: string;
  ts: string;
  title: string;
  subtitle: string | null;
  severity: RuntimeEventDto["severity"];
  channel: RuntimeEventDto["channel"];
  phaseTransition: string | null;
  /** mesmo segundo / tipo — agrupamento leve */
  groupKind: TimelineGroupKind;
  groupKey: string;
};

function phaseTransitionLabel(ev: RuntimeEventDto): string | null {
  const t = ev.type.toLowerCase();
  if (!t.includes("phase")) return null;
  if (ev.phaseHint) {
    const id = mapRawPhaseToLifecycleId(ev.phaseHint);
    return lifecyclePhaseLabel(id);
  }
  return null;
}

function burstKey(ev: RuntimeEventDto): string {
  const sec = ev.tsIso.slice(0, 19);
  return `${sec}|${ev.type}|${ev.severity}`;
}

/** Timeline resumida — exclui audit client-side e ruído operacional fino. */
export function filterOperationalTimelineEvents(
  events: RuntimeEventDto[],
): RuntimeEventDto[] {
  return events.filter((ev) => {
    if (ev.metadata?.notArtifactBacked === true) return false;
    const t = ev.type.toLowerCase();
    if (t.startsWith("intake_")) return t === "intake_completed";
    if (
      t === "scheduler_tick" ||
      t === "worker_idle" ||
      t === "worker_busy" ||
      t === "worker_started" ||
      t === "daemon_recovery_completed"
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Ordena por tempo, atribui chave de agrupamento leve (mesmo segundo + tipo).
 */
export function normalizeTimelineItems(
  events: RuntimeEventDto[],
): TimelineItemVm[] {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
  );

  const counts = new Map<string, number>();
  for (const ev of sorted) {
    const k = burstKey(ev);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return sorted.map((ev) => {
    const k = burstKey(ev);
    const n = counts.get(k) ?? 1;
    const groupKind: TimelineGroupKind = n > 2 ? "burst" : "phase";
    return {
      id: ev.id,
      tsIso: ev.tsIso,
      ts: ev.ts,
      title: ev.message,
      subtitle: ev.type,
      severity: ev.severity,
      channel: ev.channel,
      phaseTransition: phaseTransitionLabel(ev),
      groupKind,
      groupKey: k,
    };
  });
}
