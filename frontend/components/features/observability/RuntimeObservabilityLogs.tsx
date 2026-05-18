"use client";

import { RuntimeConsoleLogRow } from "@/components/features/observability/RuntimeConsoleLogRow";
import { RuntimeLogsToolbar } from "@/components/features/observability/RuntimeLogsToolbar";
import { useRunEvents } from "@/hooks/use-run-events";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useRunObservabilityBundle } from "@/hooks/use-run-observability-bundle";
import { usePreRunDiagnostics } from "@/hooks/use-pre-run-diagnostics";
import { runtimeLogDedupeKey } from "@/lib/runtime/observability/normalize-runtime-log-for-ui";
import {
  RUNTIME_LOG_CATEGORY_OPTS,
  loadRuntimeLogCategoryFilters,
  saveRuntimeLogCategoryFilters,
} from "@/lib/runtime/observability/runtime-logs-category-filter-storage";
import {
  buildRuntimeLogEntryFromDaemon,
  buildRuntimeLogEntryFromEvent,
  buildRuntimeLogEntryFromPreRun,
  buildRuntimeLogEntryFromUiDiagnostic,
  groupRepeatedRuntimeLogEntries,
  preRunDiagnosticDedupeKey,
  type RuntimeLogEntryViewModel,
} from "@/lib/runtime/observability/runtime-log-entry-view-model";
import { filterOperationalRuntimeLogEntries } from "@/lib/runtime/observability/filter-runtime-log-operational";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { useUiDiagnosticsStore } from "@/stores/ui-diagnostics-store";
import { useRuntimeObservabilityLogsStore } from "@/stores/runtime-observability-logs-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OBSERVABILITY_FONT_CLASS } from "@/lib/runtime/observability/observability-panel-styles";
import { useI18n } from "@/lib/i18n/use-i18n";

const ALL_LEVELS = new Set(["SUCCESS", "INFO", "WARN", "ERROR", "DEBUG"]);
const CAT_SET = new Set<string>(RUNTIME_LOG_CATEGORY_OPTS);

/** Container scrollável da lista de logs (testável / consistente). */
export const RUNTIME_LOGS_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-y-auto pr-1";

/** Lista flush no painel — sem card/borda (console edge-to-edge). */
export const RUNTIME_LOGS_PANEL_SURFACE_CLASS = "min-h-0 flex-1";

/** Lista de linhas de log — espaçamento vertical sem divisores. */
export const RUNTIME_LOGS_LIST_CLASS = "flex flex-col gap-1";

export const RUNTIME_LOGS_PANEL_INSET_CLASS = `flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 pb-0 pt-0 text-sidebar-foreground ${OBSERVABILITY_FONT_CLASS}`;

export type RuntimeObservabilityLogsViewMode = "operational" | "full";

export type RuntimeObservabilityLogsProps = {
  /** operational = timeline humana; full = todos os eventos (debug). */
  viewMode?: RuntimeObservabilityLogsViewMode;
  /** Oculta toolbar de categorias/pesquisa (painel técnico embutido). */
  compactToolbar?: boolean;
};

function normalizeFilterCategory(cat: string): string {
  if (CAT_SET.has(cat)) return cat;
  return "runtime";
}

function matchesFilters(
  entry: RuntimeLogEntryViewModel,
  opts: {
    cats: Set<string>;
    search: string;
    hiddenIds: Set<string>;
  },
): boolean {
  if (opts.hiddenIds.has(entry.id)) return false;
  if (!ALL_LEVELS.has(entry.displayLevel)) return false;
  const bucket = normalizeFilterCategory(entry.category);
  if (!opts.cats.has(bucket)) return false;
  const q = opts.search.trim().toLowerCase();
  if (!q) return true;
  const blob =
    `${entry.stepTitle}\n${entry.shortMessage}\n${entry.details?.json ?? ""}\n${entry.runHint ?? ""}\n${entry.category}`.toLowerCase();
  return blob.includes(q);
}

export function RuntimeObservabilityLogs({
  viewMode = "operational",
  compactToolbar = false,
}: RuntimeObservabilityLogsProps = {}) {
  const { t } = useI18n();
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const selectedRunId = useMissionShellStore((s) => s.selectedRunId);
  const newActivityFlow = useMissionShellStore((s) => s.newActivityFlow);

  const summary = useRunSummary(projectId, selectedRunId);
  const { events } = useRunEvents(projectId, selectedRunId);
  const runKey = summary?.runId ?? summary?.id ?? selectedRunId;
  const obsQ = useRunObservabilityBundle(runKey);
  const uiDiagnostics = useUiDiagnosticsStore((s) => s.entries);
  const preRunQ = usePreRunDiagnostics(projectId, {
    hasActiveRun: Boolean(selectedRunId?.trim()) && !newActivityFlow,
  });
  const noActiveRun = newActivityFlow || !selectedRunId;

  const [search, setSearch] = useState("");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [cats, setCats] = useState<Set<string>>(() =>
    loadRuntimeLogCategoryFilters(),
  );

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevFilteredLen = useRef(0);

  const ingestDaemon = useRuntimeObservabilityLogsStore((s) => s.ingestDaemonEntries);
  const daemonBucketLen = useRuntimeObservabilityLogsStore((s) =>
    runKey ? (s.buckets.get(runKey)?.order.length ?? 0) : 0,
  );

  useEffect(() => {
    setHiddenIds(new Set());
  }, [runKey]);

  useEffect(() => {
    saveRuntimeLogCategoryFilters(cats);
  }, [cats]);

  useEffect(() => {
    if (noActiveRun || !runKey || !obsQ.data?.daemonLogEntries?.length) return;
    ingestDaemon(runKey, obsQ.data.daemonLogEntries);
  }, [noActiveRun, runKey, obsQ.data?.daemonLogEntries, ingestDaemon]);

  const preRunEvents = useMemo(() => {
    const fromApi = preRunQ.data ?? [];
    const fromUi = uiDiagnostics
      .map((d) => d.preRun)
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    const merged = [...fromApi, ...fromUi];
    const seen = new Set<string>();
    const out = [];
    for (const ev of merged) {
      const key = preRunDiagnosticDedupeKey(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
    return out;
  }, [preRunQ.data, uiDiagnostics]);

  const entries = useMemo(() => {
    const fromEv = noActiveRun
      ? []
      : events.map((ev) => buildRuntimeLogEntryFromEvent(ev));
    const daemonRows =
      !noActiveRun && runKey
        ? useRuntimeObservabilityLogsStore.getState().getDaemonEntries(runKey)
        : [];
    const fromDaemon = daemonRows.map((d) => buildRuntimeLogEntryFromDaemon(d));
    const preRunKeys = new Set(preRunEvents.map(preRunDiagnosticDedupeKey));
    const fromUi = uiDiagnostics
      .filter((d) => {
        if (d.preRun && preRunKeys.has(preRunDiagnosticDedupeKey(d.preRun))) {
          return false;
        }
        if (!runKey || !d.detail) return true;
        try {
          const parsed = JSON.parse(d.detail) as { runId?: string };
          if (parsed.runId) return parsed.runId === runKey;
        } catch {
          /* */
        }
        return true;
      })
      .map((d) =>
        buildRuntimeLogEntryFromUiDiagnostic({
          id: d.id,
          tsIso: d.tsIso,
          level: d.level,
          message: d.message,
          detail: d.detail,
          category: d.category,
        }),
      );
    const fromPreRun = preRunEvents.map(buildRuntimeLogEntryFromPreRun);
    const seen = new Set<string>();
    const all: RuntimeLogEntryViewModel[] = [];
    for (const row of [...fromEv, ...fromDaemon, ...fromUi, ...fromPreRun]) {
      const key = runtimeLogDedupeKey({
        id: row.id,
        tsIso: row.timestamp,
        level: row.displayLevel,
        channel: row.origin,
        category: row.category,
        message: `${row.stepTitle}|${row.shortMessage}`,
        runId: row.runHint,
      });
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(row);
    }
    all.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    return groupRepeatedRuntimeLogEntries(all.slice(-500));
  }, [
    events,
    daemonBucketLen,
    runKey,
    uiDiagnostics,
    preRunEvents,
    noActiveRun,
  ]);

  const scopedEntries = useMemo(() => {
    if (viewMode === "full") return entries;
    return filterOperationalRuntimeLogEntries(entries);
  }, [entries, viewMode]);

  const filtered = useMemo(() => {
    return scopedEntries.filter((row) =>
      matchesFilters(row, { cats, search, hiddenIds }),
    );
  }, [scopedEntries, search, hiddenIds, cats]);

  useEffect(() => {
    const grew = filtered.length > prevFilteredLen.current;
    prevFilteredLen.current = filtered.length;
    if (!grew) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [filtered.length]);

  const onCopy = useCallback(async () => {
    const text = filtered
      .map(
        (r) =>
          `${r.timestamp} [${r.displayLevel}] [${r.category}] ${r.stepTitle} — ${r.shortMessage}${r.details?.json ? `\n${r.details.json}` : ""}`,
      )
      .join("\n---\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* noop */
    }
  }, [filtered]);

  const onClearVisual = useCallback(() => {
    setHiddenIds(new Set(entries.map((r) => r.id)));
  }, [entries]);

  const onCategoriesChange = useCallback((next: Set<string>) => {
    setCats(next);
  }, []);

  const listBody =
    filtered.length === 0 ? (
      <p className="p-4 text-[8px] leading-relaxed text-muted-foreground">
        {noActiveRun
          ? t("timeline.noRunLogsHint")
          : scopedEntries.length === 0
            ? viewMode === "operational"
              ? t("observability.operationalLogsEmpty")
              : t("observability.activityFeedEmpty")
            : t("observability.logsNoLinesForFilter")}
      </p>
    ) : (
      <div className={RUNTIME_LOGS_LIST_CLASS}>
        {filtered.map((entry) => (
          <RuntimeConsoleLogRow key={entry.id} entry={entry} />
        ))}
      </div>
    );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${RUNTIME_LOGS_PANEL_INSET_CLASS}`}
    >
      {!compactToolbar ? (
        <RuntimeLogsToolbar
          search={search}
          onSearchChange={setSearch}
          categories={cats}
          onCategoriesChange={onCategoriesChange}
          onCopy={onCopy}
          onClear={onClearVisual}
        />
      ) : null}

      <div className={`${RUNTIME_LOGS_SCROLL_CLASS} ${RUNTIME_LOGS_PANEL_SURFACE_CLASS}`}>
        {listBody}
        <div ref={bottomRef} className="h-px shrink-0 scroll-mt-1" aria-hidden />
      </div>
    </div>
  );
}
