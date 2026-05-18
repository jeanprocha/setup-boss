"use client";

import type { ExecutionBlockerDto } from "@/lib/runtime/execution/execution-types";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

const severityTone = {
  low: "border-border/60 bg-muted/25 text-muted-foreground",
  medium: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  high: "border-sb-failed/40 bg-sb-failed/10 text-sb-failed",
} as const;

export function BlockerList({ blockers }: { blockers: ExecutionBlockerDto[] }) {
  if (!blockers.length) return null;

  return (
    <ul className="space-y-1">
      {blockers.map((b) => (
        <li
          key={b.id}
          className={cn(
            "flex items-start gap-2 rounded-sm border px-2 py-1 text-[11px]",
            severityTone[b.severity],
          )}
        >
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 leading-snug">
            {b.label}
            {b.source ? (
              <span className="ml-1 font-mono text-[9px] uppercase opacity-70">
                · {b.source}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
