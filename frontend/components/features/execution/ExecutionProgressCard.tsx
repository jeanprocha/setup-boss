"use client";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/primitives/Surface";
import { ExecutionProgressStrip } from "@/components/features/execution/ExecutionProgressStrip";
import type {
  ExecutionProgressDto,
  ExecutionSubtaskDto,
} from "@/lib/runtime/execution/execution-types";
import { executionHealthLabel } from "@/lib/runtime/execution/execution-state";

export function ExecutionProgressCard({
  label,
  health,
  progress,
  activeSubtask,
  degraded,
  stallMessage,
  stallLevel,
}: {
  label: string;
  health: "healthy" | "degraded" | "partial" | "unavailable";
  progress: ExecutionProgressDto;
  activeSubtask: ExecutionSubtaskDto | null;
  degraded?: boolean;
  stallMessage?: string | null;
  stallLevel?: "normal" | "warning" | "stalled" | "critical";
}) {
  return (
    <Surface variant="strip" className="space-y-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">{label}</p>
        <Badge
          variant="outline"
          className={
            degraded
              ? "border-amber-500/40 text-amber-100"
              : "border-emerald-500/35 text-emerald-100"
          }
        >
          {executionHealthLabel(health)}
        </Badge>
      </div>
      {activeSubtask ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          activa · #{activeSubtask.order} {activeSubtask.title}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">Sem subtask activa</p>
      )}
      <ExecutionProgressStrip progress={progress} />
      {stallMessage ? (
        <p
          className={
            stallLevel === "stalled" || stallLevel === "critical"
              ? "text-[10px] font-medium leading-relaxed text-amber-800 dark:text-amber-100/90"
              : "text-[10px] leading-relaxed text-muted-foreground"
          }
        >
          {stallMessage}
        </p>
      ) : null}
    </Surface>
  );
}
