"use client";

import { Surface } from "@/components/primitives/Surface";
import type { OrchestrationBootstrapDto } from "@/lib/runtime/orchestration/orchestration-types";
import { OrchestrationStateBadge } from "@/components/features/orchestration/OrchestrationStateBadge";

export function ExecutionBootstrapCard({
  bootstrap,
}: {
  bootstrap: OrchestrationBootstrapDto;
}) {
  return (
    <Surface className="border-sb-running/25 bg-sb-running/5 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground/90">
          Bootstrap de execução
        </p>
        <OrchestrationStateBadge
          executionState={bootstrap.executionState}
          orchestrationState={bootstrap.orchestrationState}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <div>
          <dt className="uppercase tracking-wide opacity-70">Job</dt>
          <dd className="font-mono text-foreground/85">
            {bootstrap.jobId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide opacity-70">Worker</dt>
          <dd className="font-mono text-foreground/85">
            {bootstrap.workerId ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide opacity-70">Fase</dt>
          <dd className="text-foreground/85">{bootstrap.currentPhase ?? "—"}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide opacity-70">Início</dt>
          <dd className="text-foreground/85">
            {bootstrap.startedAt
              ? new Date(bootstrap.startedAt).toLocaleTimeString("pt-PT")
              : "—"}
          </dd>
        </div>
      </dl>
    </Surface>
  );
}
