"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { TimelineItemVm } from "@/lib/runtime/adapters/timeline-normalize";
import {
  runtimeChannelLabel,
  runtimeSeverityLabel,
  severityDotClass,
  severityTextClass,
} from "@/lib/runtime/adapters/runtime-labels";
import { cn } from "@/lib/utils";
import { GitBranch, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";

export function RuntimeTimeline({
  items,
  currentPhaseLabel,
}: {
  items: TimelineItemVm[];
  currentPhaseLabel: string;
}) {
  const { t } = useI18n();
  if (!items.length) {
    return (
      <EmptyState
        icon={Timer}
        title={t("timeline.emptyEventsTitle")}
        hint={t("timeline.emptyEventsHint")}
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  return (
    <ScrollArea className="max-h-[min(52vh,420px)] min-h-[180px]">
      <div className="sticky top-0 z-10 mb-2 flex flex-col gap-0.5 border-b border-border/65 bg-card px-2 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:bg-card/90 dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/88">
            Timeline
          </span>
          <Badge variant="secondary" className="max-w-[14rem] truncate text-[10px]">
            <GitBranch className="mr-1 size-3 shrink-0" aria-hidden />
            {currentPhaseLabel}
          </Badge>
        </div>
        <span className="text-[10px] leading-snug text-muted-foreground">
          Resumo operacional — eventos filtrados (sem audit client-side nem ruído fino).
        </span>
      </div>
      <div className="relative pl-3 pr-2 pb-4">
        <div
          className="absolute bottom-0 left-[7px] top-2 w-px bg-border/80"
          aria-hidden
        />
        <ul className="space-y-0">
          {items.map((it, idx) => {
            const showBurst =
              it.groupKind === "burst" &&
              (idx === 0 || items[idx - 1]?.groupKey !== it.groupKey);
            const burstEnd =
              it.groupKind === "burst" &&
              (idx === items.length - 1 ||
                items[idx + 1]?.groupKey !== it.groupKey);

            return (
              <li key={it.id} className="relative">
                {showBurst ? (
                  <div className="mb-1 mt-2 pl-4 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    Rajada operacional
                  </div>
                ) : null}
                <div className="flex gap-2 py-1.5">
                  <span
                    className={cn(
                      "relative left-0 top-2 size-2.5 shrink-0 rounded-full border border-background ring-2",
                      severityDotClass(it.severity),
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 pl-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[10px] leading-none text-muted-foreground">
                      <span>{it.ts}</span>
                      <span className="text-foreground/80">
                        {runtimeChannelLabel(it.channel)}
                      </span>
                      <span className={severityTextClass(it.severity)}>
                        {runtimeSeverityLabel(it.severity)}
                      </span>
                      {it.phaseTransition ? (
                        <Badge
                          variant="outline"
                          className="h-4 border-cyan-600/40 px-1 text-[9px] font-medium text-cyan-950 dark:border-cyan-500/35 dark:text-cyan-100"
                        >
                          {it.phaseTransition}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium leading-snug text-foreground/95">
                      {it.title}
                    </p>
                    {it.subtitle ? (
                      <p className="mt-0.5 font-mono text-[10px] text-foreground/72 dark:text-muted-foreground">
                        {it.subtitle}
                      </p>
                    ) : null}
                  </div>
                </div>
                {burstEnd ? (
                  <div className="mb-2 ml-4 h-px bg-border/50" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </ScrollArea>
  );
}
