"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SubtaskExecutionState } from "@/lib/runtime/execution/execution-types";

const LABELS: Record<SubtaskExecutionState, string> = {
  pending: "Pendente",
  queued: "Em fila",
  running: "A correr",
  reviewing: "Review",
  correcting: "Correcção",
  retrying: "Retry",
  blocked: "Bloqueado",
  failed: "Falhou",
  recovered: "Recuperado",
  completed: "Concluído",
};

const TONE: Record<SubtaskExecutionState, string> = {
  pending: "border-border text-muted-foreground",
  queued: "border-cyan-500/35 text-cyan-100",
  running: "border-sb-running/40 text-sb-running",
  reviewing: "border-amber-500/40 text-amber-100",
  correcting: "border-violet-500/40 text-violet-100",
  retrying: "border-cyan-500/40 text-cyan-100",
  blocked: "border-sb-warning/40 text-sb-warning",
  failed: "border-sb-failed/40 text-sb-failed",
  recovered: "border-emerald-500/35 text-emerald-100",
  completed: "border-sb-success/35 text-sb-success",
};

export function SubtaskStateBadge({
  state,
  className,
}: {
  state: SubtaskExecutionState;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 px-1.5 text-[9px] font-semibold uppercase",
        TONE[state],
        className,
      )}
    >
      {LABELS[state]}
    </Badge>
  );
}
