"use client";

import type { MaterializedMiniActivityDto } from "@/lib/runtime/execution/execution-types";
import { selectMaterializedMiniActivities } from "@/lib/runtime/operational/execution-operational-state";
import { ExecutionMiniActivityTimelineStep } from "@/components/features/execution/ExecutionMiniActivityTimelineStep";

function orderingModeLabel(mode: string | undefined): string {
  if (mode === "staged") return "Por etapas";
  if (mode === "parallel") return "Paralelizável";
  return "Sequencial";
}

export function ExecutionMiniActivityTimeline({
  miniActivities,
  activeMiniActivityId,
  orderingMode,
}: {
  miniActivities: MaterializedMiniActivityDto[];
  activeMiniActivityId: string | null;
  orderingMode?: string;
}) {
  const ordered = selectMaterializedMiniActivities(miniActivities);

  return (
    <section
      className="rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm"
      aria-label="Esteira de execução por mini-tarefa"
    >
      <header className="execution-mini-timeline__header">
        <h3 className="execution-mini-timeline__title">
          Esteira de execução
        </h3>
        <span className="execution-mini-timeline__mode">
          {orderingModeLabel(orderingMode)}
        </span>
      </header>

      <ol className="execution-mini-timeline">
        {ordered.map((ma) => (
          <ExecutionMiniActivityTimelineStep
            key={ma.miniActivityId}
            ma={ma}
            all={ordered}
            activeMiniActivityId={activeMiniActivityId}
          />
        ))}
      </ol>
    </section>
  );
}
