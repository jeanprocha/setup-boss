"use client";

import { cn } from "@/lib/utils";
import type { LifecycleStepVm } from "@/lib/runtime/adapters/lifecycle-model";
import {
  lifecyclePhaseLabel,
  runPhaseDisplayLabel,
} from "@/lib/runtime/adapters/runtime-labels";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useMissionLocaleStore } from "@/stores/mission-locale-store";

function stepRing(status: LifecycleStepVm["status"]) {
  if (status === "done")
    return "border-emerald-500/60 bg-emerald-500/15 text-emerald-100";
  if (status === "blocked")
    return "border-sb-failed/55 bg-sb-failed/12 text-sb-failed";
  if (status === "active")
    return "border-cyan-400/55 bg-cyan-500/15 text-cyan-50";
  return "border-border/70 bg-muted/25 text-muted-foreground";
}

export function RuntimeLifecycleStrip({
  steps,
  currentPhaseRaw,
}: {
  steps: LifecycleStepVm[];
  currentPhaseRaw: string;
}) {
  const { t } = useI18n();
  useMissionLocaleStore((s) => s.locale);
  const sticky = runPhaseDisplayLabel(currentPhaseRaw);

  return (
    <div className="space-y-2">
      <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/90 px-2 py-1.5 backdrop-blur">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("timeline.lifecycleTitle")}
        </span>
        <span className="truncate text-[11px] font-medium text-foreground">
          {t("timeline.currentPhasePrefix")}
          <span className="text-cyan-200/95">{sticky}</span>
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
        {steps.map((s, i) => (
          <div
            key={s.id}
            className="flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1"
          >
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-full border text-[10px] font-semibold",
                stepRing(s.status),
              )}
              title={lifecyclePhaseLabel(s.id)}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                "max-w-[5.5rem] text-center text-[9px] font-medium leading-tight",
                s.status === "pending" && "text-muted-foreground/80",
                s.status !== "pending" && "text-foreground/85",
              )}
            >
              {lifecyclePhaseLabel(s.id)}
            </span>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  s.status === "done" && "bg-emerald-400/80",
                  s.status === "active" && "bg-cyan-400/85",
                  s.status === "blocked" && "bg-sb-failed/80",
                  s.status === "pending" && "bg-transparent",
                )}
                style={{ width: `${Math.round(s.progress * 100)}%` }}
              />
            </div>
            {s.timestampLabel ? (
              <span className="font-mono text-[8px] text-muted-foreground">
                {s.timestampLabel}
              </span>
            ) : (
              <span className="h-3" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
