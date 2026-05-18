"use client";

import { cn } from "@/lib/utils";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import { runtimeEventTypeLabelPt } from "@/lib/runtime/adapters/runtime-labels";

export function ExecutionEventItem({ evt }: { evt: RuntimeEventDto }) {
  const sev =
    evt.severity === "error"
      ? "text-sb-failed"
      : evt.severity === "warn"
        ? "text-amber-900 dark:text-amber-200/90"
        : "text-muted-foreground";
  const typeLabel = runtimeEventTypeLabelPt(evt.type);
  return (
    <div
      className={cn(
        "rounded-md border border-border/40 bg-background/25 px-2 py-1.5 font-mono text-[10px]",
        sev,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-muted-foreground">{evt.ts}</span>
        <span className="text-[9px] font-medium uppercase text-foreground/72 dark:text-muted-foreground/85">
          {typeLabel}
        </span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-foreground/90">
        {evt.message}
      </p>
    </div>
  );
}
