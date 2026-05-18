"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunSummary } from "@/hooks/use-run-summary";
import { buildRuntimeActivityFeed } from "@/lib/runtime/ux/build-runtime-activity-feed";
import type { RuntimeActivityFeedItem } from "@/lib/runtime/ux/build-runtime-activity-feed";
import { normalizeRuntimeUxEvents } from "@/lib/runtime/ux/normalize-runtime-event";
import {
  RUNTIME_LOGS_PANEL_INSET_CLASS,
  RUNTIME_LOGS_SCROLL_CLASS,
} from "@/components/features/observability/RuntimeObservabilityLogs";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useRuntimeConnectionStore } from "@/stores/runtime-connection-store";
import { useRuntimeSseStore } from "@/stores/runtime-sse-store";
import { useI18n } from "@/lib/i18n/use-i18n";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  XCircle,
} from "lucide-react";

const MAX_EXPAND_JSON_CHARS = 8_000;
const NEW_RUN_QUIET_MS = 90_000;

function FeedIcon({ kind }: { kind: RuntimeActivityFeedItem["icon"] }) {
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
    case "running":
      return (
        <Loader2 className={cn(cls, "animate-spin text-sb-running")} />
      );
    default:
      return <Minus className={cn(cls, "text-muted-foreground")} />;
  }
}

function formatTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatExpandPayload(raw: unknown): string {
  try {
    const text = JSON.stringify(raw, null, 2);
    if (text.length <= MAX_EXPAND_JSON_CHARS) return text;
    return `${text.slice(0, MAX_EXPAND_JSON_CHARS)}\n… (truncado)`;
  } catch {
    return String(raw);
  }
}

const ActivityFeedRow = memo(function ActivityFeedRow({
  item,
}: {
  item: RuntimeActivityFeedItem;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="group/feed rounded-sm py-1 pl-0.5 pr-1 hover:bg-muted/30 dark:hover:bg-sidebar-accent/40">
      <div className="grid grid-cols-[1.25rem_0.875rem_minmax(0,1fr)] items-center gap-x-2">
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/40"
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
        <FeedIcon kind={item.icon} />
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[11px] font-medium leading-snug text-foreground">
              {item.macroPhaseLabel ? (
                <span className="mr-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {item.macroPhaseLabel}
                </span>
              ) : null}
              {item.title}
            </p>
            <time
              className="shrink-0 text-[9px] tabular-nums text-muted-foreground"
              dateTime={item.timestamp}
            >
              {formatTime(item.timestamp)}
            </time>
          </div>
          {item.message ? (
            <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">
              {item.message}
            </p>
          ) : null}
        </div>
      </div>
      {open ? (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[9px] leading-relaxed text-muted-foreground">
          {formatExpandPayload(item.raw)}
        </pre>
      ) : null}
    </div>
  );
});

function resolveActivityFeedEmptyMessage(input: {
  offline: boolean;
  sseDisconnected: boolean;
  runCreatedAt: string | null | undefined;
  waitingUser: boolean;
  t: (key: string) => string;
}): string {
  if (input.offline) return input.t("observability.activityFeedEmptyOffline");
  if (input.sseDisconnected) return input.t("observability.activityFeedEmptySse");
  const created = input.runCreatedAt ? Date.parse(input.runCreatedAt) : NaN;
  if (Number.isFinite(created) && Date.now() - created < NEW_RUN_QUIET_MS) {
    return input.t("observability.activityFeedEmptyNewRun");
  }
  if (input.waitingUser) {
    return input.t("observability.activityFeedEmptyQuiet");
  }
  return input.t("observability.activityFeedEmpty");
}

function RuntimeActivityFeedInner() {
  const { t } = useI18n();
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);
  const { events } = useRunEvents(projectId, selectedRunId);
  const summary = useRunSummary(projectId, selectedRunId);
  const connection = useRuntimeConnectionStore((s) => s.connection);
  const ssePhase = useRuntimeSseStore((s) => s.phase);

  const items = useMemo(() => {
    const uxEvents = normalizeRuntimeUxEvents(events);
    return buildRuntimeActivityFeed(uxEvents);
  }, [events]);

  const firstEventAt = events[0]?.tsIso ?? events[0]?.timestamp ?? null;

  const emptyMessage = useMemo(
    () =>
      resolveActivityFeedEmptyMessage({
        offline: connection.dataSource === "offline" || !connection.reachable,
        sseDisconnected:
          ssePhase === "disconnected" ||
          ssePhase === "reconnecting" ||
          (ssePhase !== "connected" && ssePhase !== "idle"),
        runCreatedAt: firstEventAt,
        waitingUser:
          summary?.operationalStatusKey?.includes("waiting") === true ||
          summary?.phase?.includes("waiting") === true ||
          (summary?.state?.startsWith("waiting") ?? false),
        t,
      }),
    [connection, ssePhase, firstEventAt, summary, t],
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevLen = useRef(0);

  useEffect(() => {
    const grew = items.length > prevLen.current;
    prevLen.current = items.length;
    if (!grew) return;
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [items.length]);

  const noActiveRun = newActivityFlow || !selectedRunId;

  return (
    <div className={RUNTIME_LOGS_PANEL_INSET_CLASS}>
      <p className="mb-1 px-0.5 text-[9px] text-muted-foreground">
        {t("observability.activityFeedHint")}
      </p>
      <div ref={scrollRef} className={RUNTIME_LOGS_SCROLL_CLASS}>
        {noActiveRun ? (
          <p className="p-4 text-[10px] text-muted-foreground">
            {t("timeline.noRunLogsHint")}
          </p>
        ) : items.length === 0 ? (
          <p className="p-4 text-[10px] leading-relaxed text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <ActivityFeedRow key={item.id} item={item} />
            ))}
          </div>
        )}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>
    </div>
  );
}

export const RuntimeActivityFeed = memo(RuntimeActivityFeedInner);
