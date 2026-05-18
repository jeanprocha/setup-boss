"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { PanelLeft, ScrollText } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useRuns } from "@/hooks/use-runs";
import { cn } from "@/lib/utils";

function StatusPill({
  label,
  tone,
  title,
}: {
  label: string;
  tone: "good" | "bad" | "warn" | "muted";
  title?: string;
}) {
  const tones = {
    good:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    bad: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-300",
    muted: "border-sidebar-border bg-sidebar-accent/50 text-muted-foreground",
  } as const;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        tones[tone],
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "good" && "bg-emerald-400",
          tone === "bad" && "bg-rose-400",
          tone === "warn" && "bg-amber-300",
          tone === "muted" && "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function AppChrome() {
  const { t } = useI18n();
  const toggleSidebar = useMissionLayoutStore((s) => s.toggleSidebar);
  const toggleRightTimeline = useMissionLayoutStore(
    (s) => s.toggleRightTimeline,
  );
  const selectedProjectId = useMissionShellStore((s) => s.selectedProjectId);

  const rq = useRuns(selectedProjectId);

  const runningCount = useMemo(() => {
    const list = rq.data?.summaries;
    if (!list) return 0;
    return list.filter((r) => r.state === "running").length;
  }, [rq.data?.summaries]);

  const onSettings = () => {
    toggleRightTimeline();
  };

  return (
    <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground">
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
          onClick={toggleSidebar}
          aria-label={t("chrome.toggleSidebarWidth")}
        >
          <PanelLeft className="size-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 bg-sidebar-border" />
        <span
          className="shrink-0 select-none font-semibold tracking-wide text-sidebar-foreground"
          title="Setup Boss"
        >
          SETUP-BOSS
        </span>
      </div>

      <div className="min-w-0 flex-1" />

      {runningCount > 0 ? (
        <>
          <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
            <StatusPill
              label={t("chrome.runningTasks", { count: runningCount })}
              tone="warn"
              title={t("chrome.runningTasksTitle")}
            />
          </div>
          <Separator
            orientation="vertical"
            className="hidden h-6 bg-sidebar-border sm:block"
          />
        </>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:bg-sidebar-accent/30 hover:text-sidebar-foreground"
          aria-label={t("chrome.executionNavPanel")}
          onClick={onSettings}
        >
          <ScrollText className="size-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
