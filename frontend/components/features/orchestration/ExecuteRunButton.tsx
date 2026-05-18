"use client";

import { Button } from "@/components/ui/button";
import type { ExecuteAvailability } from "@/lib/runtime/orchestration/orchestration-types";
import { orchestrationGuardMessage } from "@/lib/runtime/orchestration/orchestration-state";
import { cn } from "@/lib/utils";
import { Loader2, Play } from "lucide-react";

export function ExecuteRunButton({
  onExecute,
  isPending,
  availability,
  className,
}: {
  onExecute: () => void;
  isPending: boolean;
  availability: ExecuteAvailability;
  className?: string;
}) {
  const disabled = isPending || !availability.canExecute;
  const hint =
    availability.message ??
    orchestrationGuardMessage(availability.reason) ??
    null;

  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 border-sb-running/35 bg-sb-running/5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-sb-running hover:bg-sb-running/15"
        disabled={disabled}
        onClick={onExecute}
        title={hint ?? undefined}
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : (
          <Play className="size-3" aria-hidden />
        )}
        Execute Run
      </Button>
      {hint && !availability.canExecute ? (
        <p className="max-w-xs text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
