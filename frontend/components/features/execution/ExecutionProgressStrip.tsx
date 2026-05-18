"use client";

import type { ExecutionProgressDto } from "@/lib/runtime/execution/execution-types";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "completed" as const, label: "Concluídas", tone: "bg-sb-success/80" },
  { key: "active" as const, label: "Activas", tone: "bg-sb-running/80" },
  { key: "blocked" as const, label: "Bloqueadas", tone: "bg-sb-warning/80" },
  { key: "failed" as const, label: "Falhas", tone: "bg-sb-failed/80" },
  { key: "pending" as const, label: "Pendentes", tone: "bg-muted-foreground/40" },
];

export function ExecutionProgressStrip({
  progress,
  className,
}: {
  progress: ExecutionProgressDto;
  className?: string;
}) {
  const total = progress.total || 1;
  const counts = SEGMENTS.map((s) => ({
    ...s,
    count: progress[s.key],
    width: `${Math.round((progress[s.key] / total) * 100)}%`,
  }));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-2 overflow-hidden rounded-full border border-border/60 bg-background/40">
        {counts.map(
          (s) =>
            s.count > 0 && (
              <div
                key={s.key}
                className={cn("h-full transition-all", s.tone)}
                style={{ width: s.width }}
                title={`${s.label}: ${s.count}`}
              />
            ),
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        {counts.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={cn("size-2 rounded-sm", s.tone)} aria-hidden />
            {s.label}{" "}
            <span className="font-mono text-foreground/80">{s.count}</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-foreground/70">
          total {progress.total}
        </span>
      </div>
    </div>
  );
}
