"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/primitives/StatusBadge";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import { runSummaryStatusLabel } from "@/lib/runtime/adapters/runtime-labels";
import { cn } from "@/lib/utils";

export type RuntimeCardRunProps = {
  variant: "run";
  run: RunSummaryDto;
  selected: boolean;
  onSelect: () => void;
};

export type RuntimeCardStreamProps = {
  variant: "stream-event";
  eventKey: string;
  cardKind: string;
  title: string;
  detail?: string;
  timestamp: string;
  state?: RuntimeUiState;
};

export type RuntimeCardProps = RuntimeCardRunProps | RuntimeCardStreamProps;

export function RuntimeCard(props: RuntimeCardProps) {
  if (props.variant === "run") {
    const { run, selected, onSelect } = props;
    return (
      <Card
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "cursor-pointer border-border/40 bg-card transition-[box-shadow,background-color,border-color,opacity] hover:border-border/55 hover:shadow-[0_2px_12px_-4px_color-mix(in_oklch,var(--foreground)_10%,transparent)] dark:border-border/35 dark:bg-card dark:hover:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.45)]",
          !selected &&
            "opacity-[0.78] saturate-75 dark:opacity-[0.82]",
          selected &&
            "border-2 border-[rgb(var(--v-theme-primary))] opacity-100 shadow-[0_2px_14px_-6px_rgba(var(--v-theme-primary),0.3)] ring-2 ring-[rgb(var(--v-theme-primary))]/35 saturate-100 dark:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.45)]",
        )}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium leading-tight text-sb-card-foreground">
              {run.label}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {run.id} · {run.phase}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/90">
              {run.branchHint ?? "—"}
            </p>
          </div>
          <StatusBadge state={run.state} label={runSummaryStatusLabel(run)} />
        </CardHeader>
        <CardContent className="pt-0 text-[10px] text-muted-foreground">
          Início {run.startedAtLabel ?? "—"}
        </CardContent>
      </Card>
    );
  }

  const { cardKind, title, detail, timestamp, state } = props;
  return (
    <Card
      className={cn(
        "border-border/55 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-card/85 dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
        state === "failed" && "border-l-2 border-l-sb-failed/60",
        state === "warning" && "border-l-2 border-l-sb-warning/50",
        (state === "running" ||
          state === "retrying" ||
          state === "correcting") &&
          "border-l-2 border-l-sb-running/45",
      )}
    >
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {cardKind} · {timestamp}
          </p>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-sb-card-foreground">
            {title}
          </p>
          {detail ? (
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {detail}
            </p>
          ) : null}
        </div>
        {state ? <StatusBadge state={state} /> : null}
      </CardHeader>
    </Card>
  );
}
