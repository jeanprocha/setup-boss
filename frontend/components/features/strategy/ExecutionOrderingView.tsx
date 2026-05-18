"use client";

import { Badge } from "@/components/ui/badge";
import type { ExecutionOrderingDto } from "@/lib/runtime/strategy/strategy-types";
import { ArrowRight, ListOrdered } from "lucide-react";

const statusTone = {
  ready: "border-emerald-500/35 text-emerald-100",
  pending: "border-border/60 text-muted-foreground",
  blocked: "border-amber-500/40 text-amber-100",
} as const;

export function ExecutionOrderingView({
  ordering,
}: {
  ordering: ExecutionOrderingDto;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ListOrdered className="size-3.5 text-cyan-300/80" aria-hidden />
        <span className="text-xs font-semibold text-muted-foreground">
          Ordem de execução
        </span>
        <Badge variant="outline" className="font-mono text-[10px]">
          {ordering.orderingMode}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          ready {ordering.readyIds.length}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          pending {ordering.pendingIds.length}
        </Badge>
      </div>

      <ol className="space-y-1">
        {ordering.sequence.map((step) => (
          <li
            key={`${step.position}-${step.subtaskId}`}
            className={`flex items-center gap-2 rounded-sm border px-2 py-1 text-[11px] ${statusTone[step.status]}`}
          >
            <span className="font-mono text-[10px] text-muted-foreground">
              {step.position}.
            </span>
            <span className="min-w-0 flex-1 truncate font-mono">
              {step.title}
            </span>
            {step.dependsOn.length > 0 ? (
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                ← {step.dependsOn.join(",")}
              </span>
            ) : null}
            <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
              {step.status}
            </Badge>
          </li>
        ))}
      </ol>

      {ordering.blockingDependencies.length > 0 ? (
        <div className="rounded-sm border border-border/50 bg-background/20 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Dependências blocking
          </p>
          <ul className="mt-1 space-y-0.5">
            {ordering.blockingDependencies.slice(0, 6).map((dep) => (
              <li
                key={dep.label}
                className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground"
              >
                <span>{dep.from}</span>
                <ArrowRight className="size-3" aria-hidden />
                <span>{dep.to}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
