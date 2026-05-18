"use client";

import { useEffect, useMemo, useState } from "react";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { formatDurationShort } from "@/lib/runtime/observability/observability-event-helpers";
import {
  isMeaningfulStrategyProgressEvent,
  strategyActivityLabel,
} from "@/lib/runtime/observability/normalize-runtime-log-for-ui";
import type { RuntimeStallVisualLevel } from "@/lib/runtime/observability/derive-runtime-stall-visual";
import { deriveRuntimeStallVisual } from "@/lib/runtime/observability/derive-runtime-stall-visual";
import { deriveRuntimeOperationalContext } from "@/lib/runtime/observability/derive-runtime-operational-context";
import { useRuntimeHeartbeatSnapshot } from "@/hooks/use-runtime-heartbeat";

export type StrategyActivityItem = {
  id: string;
  label: string;
  tsIso: string;
  done: boolean;
};

/** @deprecated use RuntimeStallVisualLevel — mantido para compat. */
export type StrategyStallLevel = "none" | RuntimeStallVisualLevel;

export type StrategyPhaseProgress = {
  activities: StrategyActivityItem[];
  elapsedMs: number;
  elapsedLabel: string;
  lastMeaningfulEventAt: number | null;
  msSinceLastMeaningful: number | null;
  stallLevel: RuntimeStallVisualLevel;
  stallMessage: string | null;
  isProcessing: boolean;
};

const SEED_ACTIVITIES: { label: string; match: RegExp }[] = [
  { label: "Plano aprovado", match: /clarif.*approv|approval/i },
  { label: "Estratégia iniciada", match: /strategy_(started|requested|auto_started)/i },
];

function pickStrategyEvents(events: RuntimeEventDto[]): RuntimeEventDto[] {
  return events.filter((ev) => {
    const t = (ev.type || ev.message || "").toLowerCase();
    if (isMeaningfulStrategyProgressEvent(ev)) return true;
    return (
      t.includes("strategy") ||
      t.includes("clarif") ||
      t.includes("phase2_ready") ||
      t.includes("decomposition") ||
      t.includes("complexity")
    );
  });
}

export function useStrategyPhaseProgress(opts: {
  events: RuntimeEventDto[];
  processing: boolean;
  phaseStartedAtIso?: string | null;
  runtimePhase?: string | null;
  strategyReady?: boolean;
  runKey?: string | null;
  runState?: string | null;
}): StrategyPhaseProgress {
  const {
    events,
    processing,
    phaseStartedAtIso,
    runtimePhase,
    strategyReady,
    runKey,
    runState,
  } = opts;
  const [now, setNow] = useState(() => Date.now());
  const { heartbeat } = useRuntimeHeartbeatSnapshot();

  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [processing]);

  return useMemo(() => {
    const scoped = pickStrategyEvents(events).sort(
      (a, b) => Date.parse(a.tsIso) - Date.parse(b.tsIso),
    );

    const seenLabels = new Set<string>();
    const activities: StrategyActivityItem[] = [];

    for (const seed of SEED_ACTIVITIES) {
      const hit = scoped.find((ev) =>
        seed.match.test(ev.type || ev.message || ""),
      );
      if (hit && !seenLabels.has(seed.label)) {
        seenLabels.add(seed.label);
        activities.push({
          id: `seed_${seed.label}`,
          label: seed.label,
          tsIso: hit.tsIso,
          done: true,
        });
      }
    }

    for (const ev of scoped) {
      const label = strategyActivityLabel(ev.type || ev.message);
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      const done =
        /completed|approved|ready|conclu|pront/i.test(ev.type || "") ||
        !processing;
      activities.push({
        id: ev.id,
        label,
        tsIso: ev.tsIso,
        done,
      });
    }

    if (processing) {
      const waitingLabel = "Aguardando próximo evento do runtime…";
      if (!seenLabels.has(waitingLabel)) {
        activities.push({
          id: "waiting_next",
          label: waitingLabel,
          tsIso: new Date().toISOString(),
          done: false,
        });
      }
    }

    const operational = deriveRuntimeOperationalContext({
      heartbeat,
      runKey,
      uiActivelyProcessing: processing,
    });

    const stall = deriveRuntimeStallVisual({
      events,
      nowMs: now,
      activelyProcessing: operational.isRunActivelyProcessing && processing,
      runtimePhase,
      strategyReady,
      runState,
      runKey,
      workerIdleNoJob: operational.workerIdleNoJob,
      runningJobsCount: heartbeat?.runningJobsCount ?? null,
      currentJobId: heartbeat?.currentJobId ?? null,
      currentRunId: heartbeat?.currentRunId ?? null,
      workerState: heartbeat?.workerState ?? operational.workerState,
      daemonAlive: operational.daemonAlive,
    });

    const phaseStart = phaseStartedAtIso
      ? Date.parse(phaseStartedAtIso)
      : activities.length
        ? Date.parse(activities[0].tsIso)
        : now;
    const elapsedMs =
      Number.isFinite(phaseStart) && phaseStart > 0 ? now - phaseStart : 0;

    return {
      activities: activities.slice(-12),
      elapsedMs,
      elapsedLabel: formatDurationShort(elapsedMs),
      lastMeaningfulEventAt: stall.lastMeaningfulEventAt,
      msSinceLastMeaningful: stall.msSinceLastMeaningful,
      stallLevel: stall.level,
      stallMessage: stall.message,
      isProcessing: processing,
    };
  }, [
    events,
    processing,
    phaseStartedAtIso,
    runtimePhase,
    strategyReady,
    runKey,
    runState,
    now,
    heartbeat,
  ]);
}
