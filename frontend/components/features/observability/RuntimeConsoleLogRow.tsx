"use client";

import { memo, useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cog,
  GitBranch,
  Hourglass,
  Minus,
  XCircle,
} from "lucide-react";
import type {
  RuntimeLogEntryViewModel,
  RuntimeLogIconKind,
} from "@/lib/runtime/observability/runtime-log-entry-view-model";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";

function LogStatusIcon({ kind }: { kind: RuntimeLogIconKind }) {
  const cls = "size-3.5 shrink-0";
  switch (kind) {
    case "success":
      return <Check className={cn(cls, "text-emerald-600 dark:text-emerald-400")} />;
    case "error":
      return <XCircle className={cn(cls, "text-rose-600 dark:text-rose-400")} />;
    case "warn":
      return (
        <AlertTriangle className={cn(cls, "text-amber-600 dark:text-amber-400")} />
      );
    case "waiting":
      return (
        <Hourglass className={cn(cls, "text-sky-600 dark:text-sky-400")} />
      );
    case "git":
      return (
        <GitBranch className={cn(cls, "text-violet-600 dark:text-violet-400")} />
      );
    case "progress":
      return <Cog className={cn(cls, "text-muted-foreground")} />;
    case "debug":
      return <Minus className={cn(cls, "text-violet-500/80")} />;
    default:
      return <Minus className={cn(cls, "text-muted-foreground/70")} />;
  }
}

function rowEmphasisClass(
  tier: RuntimeLogEntryViewModel["uiTier"],
  level: RuntimeLogEntryViewModel["level"],
): string {
  if (level === "error") return "border-l-2 border-l-rose-500/60";
  if (level === "warn" || tier === "important")
    return "border-l-2 border-l-amber-500/40";
  if (tier === "noise") return "opacity-70 group-hover/row:opacity-100";
  if (tier === "technical") return "opacity-85 group-hover/row:opacity-100";
  return "";
}

/** Colunas: chevron | ícone | texto+hora — linha de resumo fixa; detalhe na linha abaixo. */
const LOG_ROW_GRID_CLASS =
  "grid grid-cols-[1.25rem_0.875rem_minmax(0,1fr)] items-center gap-x-2";

export const RuntimeConsoleLogRow = memo(function RuntimeConsoleLogRow({
  entry,
}: {
  entry: RuntimeLogEntryViewModel;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const canExpand = entry.expandable;
  const repeatSuffix =
    entry.groupedCount > 1 ? ` · ×${entry.groupedCount}` : "";
  const lineLabel = `${entry.stepTitle} — ${entry.shortMessage}${repeatSuffix}`;

  return (
    <div
      className={cn(
        "group/row rounded-sm py-1 pl-0.5 pr-1 transition-colors duration-150",
        "hover:bg-muted/30 dark:hover:bg-sidebar-accent/45",
        rowEmphasisClass(entry.uiTier, entry.level),
      )}
    >
      <div className={cn(LOG_ROW_GRID_CLASS, "min-h-5 shrink-0")}>
        <div className="flex size-5 items-center justify-center justify-self-center">
          {canExpand ? (
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-expanded={open}
              aria-label={
                open
                  ? t("observability.logsCollapseRow")
                  : t("observability.logsExpandRow")
              }
              onClick={toggle}
            >
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
        </div>

        <div className="flex items-center justify-self-center">
          <LogStatusIcon kind={entry.icon} />
        </div>

        <div className="flex min-h-5 min-w-0 items-center gap-x-2 overflow-hidden">
          <div
            className="min-w-0 flex-1 truncate text-[8px] leading-none text-foreground"
            title={lineLabel}
          >
            <span className="font-medium">{entry.stepTitle}</span>
            <span className="text-muted-foreground"> — </span>
            <span className="text-foreground/90">
              {entry.shortMessage}
              {repeatSuffix}
            </span>
          </div>
          <time
            dateTime={entry.timestamp}
            className="shrink-0 font-mono text-[8px] leading-none tabular-nums text-muted-foreground"
            title={entry.timestamp}
          >
            {entry.clockLabel}
          </time>
        </div>
      </div>

      {open && entry.details ? (
        <div className={cn(LOG_ROW_GRID_CLASS, "min-w-0 pt-1.5")}>
          <div className="col-start-3 min-w-0 pr-0.5">
            {entry.details.payloadOmittedLabel ? (
              <p className="mb-1.5 text-[8px] leading-none text-muted-foreground">
                {entry.details.payloadOmittedLabel}
              </p>
            ) : null}
            <pre className="max-h-[min(420px,50vh)] overflow-auto rounded border border-sidebar-border/45 bg-sidebar px-2.5 py-2 font-mono text-[8px] leading-relaxed text-foreground/90">
              {entry.details.json}
            </pre>
            {entry.details.truncatedInPanel ? (
              <p className="mt-1 text-[8px] leading-none text-muted-foreground">
                {t("observability.logsDetailTruncated")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});
