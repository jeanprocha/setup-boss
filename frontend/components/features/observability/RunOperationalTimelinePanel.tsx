"use client";

import { Badge } from "@/components/ui/badge";
import { Surface } from "@/components/primitives/Surface";
import { EmptyState } from "@/components/primitives/EmptyState";
import { useRunOperationalTimeline } from "@/hooks/use-run-operational-timeline";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import type {
  OperationalTimelineItem,
  OperationalTimelineVisualState,
  RunOperationalTimeline,
} from "@/lib/runtime/observability/derive-run-operational-timeline";
import { cn } from "@/lib/utils";
import { Check, Circle, Loader2, AlertTriangle, User, ListTree } from "lucide-react";

function statusTone(state: OperationalTimelineVisualState): string {
  switch (state) {
    case "completed":
    case "success":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100/90";
    case "error":
      return "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-100/90";
    case "warning":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100/90";
    case "waiting_user":
      return "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-100/90";
    case "running":
      return "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100/90";
    default:
      return "border-border/50 bg-muted/15 text-muted-foreground";
  }
}

function ItemIcon({ state }: { state: OperationalTimelineVisualState }) {
  const cls = "size-3.5 shrink-0";
  if (state === "completed" || state === "success") {
    return <Check className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />;
  }
  if (state === "error") {
    return <AlertTriangle className={cn(cls, "text-rose-600 dark:text-rose-400")} />;
  }
  if (state === "warning") {
    return <AlertTriangle className={cn(cls, "text-amber-600 dark:text-amber-400")} />;
  }
  if (state === "waiting_user") {
    return <User className={cn(cls, "text-violet-600 dark:text-violet-400")} />;
  }
  if (state === "running") {
    return <Loader2 className={cn(cls, "animate-spin text-sky-600 dark:text-sky-400")} />;
  }
  return <Circle className={cn(cls, "text-muted-foreground/70")} />;
}

function TimelineItemRow({ item }: { item: OperationalTimelineItem }) {
  return (
    <li>
      <Surface variant="inset" className="flex gap-2 px-2 py-1.5 text-[8px] leading-snug">
        <ItemIcon state={item.visualState} />
        <div className="min-w-0 flex-1">
          <TimelineItemHeader item={item} />
        </div>
      </Surface>
    </li>
  );
}

function TimelineItemHeader({ item }: { item: OperationalTimelineItem }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-1">
        <p className="font-medium text-foreground/95">{item.title}</p>
        <time
          className="shrink-0 font-mono text-[8px] text-muted-foreground"
          dateTime={item.timestamp}
        >
          {new Date(item.timestamp).toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
      </div>
      {item.subtitle ? (
        <p className="mt-0.5 text-[8px] text-muted-foreground">{item.subtitle}</p>
      ) : null}
      <p className="mt-0.5 text-[8px] text-muted-foreground/80">
        {item.source}
        {item.isUserAction ? " · acção utilizador" : null}
      </p>
    </>
  );
}

function OperationalTimelineContent({ timeline }: { timeline: RunOperationalTimeline }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 py-2">
      <Surface variant="strip" className="space-y-1.5 p-2.5">
        <TimelinePanelHeader timeline={timeline} />
      </Surface>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {timeline.groups.map((group) => (
          <section key={group.phase} className="space-y-1">
            <p className="px-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/90">
              {group.label}
            </p>
            <ul className="space-y-1" aria-live="polite">
              {group.items.map((item) => (
                <TimelineItemRow key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function TimelinePanelHeader({ timeline }: { timeline: RunOperationalTimeline }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
          Timeline operacional
        </p>
        <Badge
          variant="outline"
          className={cn("text-[8px] font-medium", statusTone(timeline.currentStatus))}
        >
          {timeline.currentStatusLabel}
        </Badge>
      </div>
      {timeline.lastProgressLabel ? (
        <p className="text-[8px] text-muted-foreground">{timeline.lastProgressLabel}</p>
      ) : null}
    </>
  );
}

export function RunOperationalTimelinePanel() {
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const timeline = useRunOperationalTimeline(projectId, selectedRunId);

  if (!selectedRunId) {
    return (
      <EmptyState
        icon={ListTree}
        title="Sem run seleccionado"
        hint="Seleccione uma actividade para ver a timeline operacional."
        className="border-none bg-transparent py-8"
      />
    );
  }

  if (timeline.isEmpty) {
    return (
      <EmptyState
        icon={ListTree}
        title="Sem eventos operacionais"
        hint="Marcos importantes do run — os logs técnicos continuam na aba Logs."
        className="border-none bg-transparent py-8"
      />
    );
  }

  return <OperationalTimelineContent timeline={timeline} />;
}
