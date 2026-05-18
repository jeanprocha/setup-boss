"use client";

import { Surface } from "@/components/primitives/Surface";
import { SubtaskStateBadge } from "@/components/features/execution/SubtaskStateBadge";
import type { ExecutionSubtaskDto } from "@/lib/runtime/execution/execution-types";
import { formatDurationMs } from "@/lib/runtime/execution/execution-selectors";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export function SubtaskExecutionCard({
  subtask,
  isActive,
}: {
  subtask: ExecutionSubtaskDto;
  isActive?: boolean;
}) {
  return (
    <Surface
      variant="inset"
      className={cn(
        "flex flex-col gap-1.5 px-2.5 py-2",
        isActive && "border-sb-running/35 ring-1 ring-sb-running/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-muted-foreground">#{subtask.order}</span>
            <span className="truncate">{subtask.title}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatDurationMs(subtask.durationMs)}
            {subtask.retryCount > 0 ? ` · retry ${subtask.retryCount}` : ""}
            {subtask.review.status !== "none"
              ? ` · review ${subtask.review.status}`
              : ""}
            {subtask.correction.generation > 0
              ? ` · corr g${subtask.correction.generation}`
              : ""}
          </p>
        </div>
        <SubtaskStateBadge state={subtask.state} />
      </div>
      {subtask.blockerLabel ? (
        <p className="flex items-center gap-1 text-[10px] text-sb-warning">
          <AlertCircle className="size-3 shrink-0" />
          {subtask.blockerLabel}
        </p>
      ) : null}
      {subtask.readiness === "blocked" ? (
        <p className="text-[10px] text-muted-foreground">readiness: bloqueado</p>
      ) : null}
    </Surface>
  );
}
