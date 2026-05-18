"use client";

import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import type { OperationalFinalizationSummary } from "@/lib/runtime/operational/operational-finalization-types";
import { cn } from "@/lib/utils";

function StateIcon({
  state,
}: {
  state: OperationalFinalizationSummary["checklist"][number]["state"];
}) {
  if (state === "done") {
    return (
      <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (state === "attention" || state === "partial") {
    return (
      <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
    );
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground" />;
}

export function OperationalFinalizationSummaryView({
  summary,
}: {
  summary: OperationalFinalizationSummary;
}) {
  return (
    <div className="space-y-4">
      {summary.activityLabel ? (
        <p className="text-sm font-medium text-foreground">{summary.activityLabel}</p>
      ) : null}

      <ul className="space-y-2.5" aria-label="Resumo final">
        {summary.checklist.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
          >
            <StateIcon state={item.state} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[12px] font-semibold text-foreground">
                  {item.label}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wide",
                    item.state === "done"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : item.state === "attention"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-muted-foreground",
                  )}
                >
                  {item.stateLabelPt}
                </span>
              </div>
              {item.detail ? (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {summary.changedFiles.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Ficheiros alterados</p>
          <ul className="max-h-32 space-y-0.5 overflow-y-auto rounded-md border border-border/50 bg-background/50 px-2.5 py-2">
            {summary.changedFiles.slice(0, 20).map((f) => (
              <li
                key={f}
                className="truncate font-mono text-[10px] text-muted-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.knownPending.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Pendências</p>
          <ul className="list-inside list-disc space-y-0.5 text-[11px] text-muted-foreground">
            {summary.knownPending.slice(0, 8).map((p, i) => (
              <li key={`${i}-${p.slice(0, 24)}`}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        {summary.humanNextStepsNote}
      </p>
    </div>
  );
}
