"use client";

import { Surface } from "@/components/primitives/Surface";
import { OrchestrationStateBadge } from "@/components/features/orchestration/OrchestrationStateBadge";
import type {
  OrchestrationExecutionState,
  OrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-types";
import { isOrchestrationActive } from "@/lib/runtime/orchestration/orchestration-state";

export function OrchestrationStateCard({
  executionState,
  orchestrationState,
  degraded,
}: {
  executionState: OrchestrationExecutionState;
  orchestrationState: OrchestrationState;
  degraded?: boolean;
}) {
  const active = isOrchestrationActive(orchestrationState);
  return (
    <Surface
      className={
        active
          ? "border-sb-running/30 bg-sb-running/5 p-2"
          : "border-border/60 bg-muted/15 p-2"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Orchestration
          </p>
          <p className="text-[11px] text-foreground/90">
            {active ? "Runtime activo" : "Aguardando trigger"}
          </p>
        </div>
        <OrchestrationStateBadge
          executionState={executionState}
          orchestrationState={orchestrationState}
        />
      </div>
      {degraded ? (
        <p className="mt-1.5 text-[10px] text-amber-200/90">
          Modo degradado — estado preservado; retry quando runtime estiver online.
        </p>
      ) : null}
    </Surface>
  );
}
