"use client";

import type { MouseEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatWorkspaceArtifactsPanel } from "@/components/features/evidence/ChatWorkspaceArtifactsPanel";
import { ObservabilityPanel } from "@/components/features/observability/ObservabilityPanel";
import { useRightPanelWidth } from "@/hooks/use-right-panel-width";
import { useMissionLayoutStore } from "@/stores/mission-layout-store";
import { cn } from "@/lib/utils";
import { FileStack, RadioTower } from "lucide-react";
import { useI18n } from "@/lib/i18n/use-i18n";
import { RUNTIME_PANEL_IDS } from "@/lib/runtime/navigation/runtime-action-target";
import { OBSERVABILITY_PANEL_ROOT_CLASS } from "@/lib/runtime/observability/observability-panel-styles";

export function RightTimelinePanel() {
  const { t } = useI18n();
  const rightPanelTab = useMissionLayoutStore((s) => s.rightPanelTab);
  const setRightPanelTab = useMissionLayoutStore((s) => s.setRightPanelTab);

  const { widthPx, setWidthPx, resetWidth } = useRightPanelWidth();

  const onResizeMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startW = widthPx;
    const startX = e.clientX;
    document.body.style.cursor = "col-resize";
    const onMove = (ev: globalThis.MouseEvent) => {
      const dx = ev.clientX - startX;
      setWidthPx(startW - dx);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="relative flex max-w-full shrink-0 md:max-w-[min(100%,560px)]"
      style={{ width: widthPx }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        title={t("timeline.resizePanel")}
        onMouseDown={onResizeMouseDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          resetWidth();
        }}
        className="absolute left-0 top-0 z-20 h-full w-1 shrink-0 cursor-col-resize select-none hover:bg-sky-500/20"
      />
      <aside
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground",
        )}
      >
        <Tabs
          value={rightPanelTab}
          onValueChange={(v) => {
            if (v === "chat_files" || v === "observe") setRightPanelTab(v);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex h-11 shrink-0 items-end border-b border-sidebar-border/90 bg-sidebar-accent/10 px-1.5 pb-px pt-1">
            <TabsList
              variant="line"
              className="h-9 w-full justify-stretch gap-0.5 rounded-none border-0 bg-transparent p-0"
            >
              <TabsTrigger
                value="chat_files"
                className="min-w-0 flex-1 gap-1.5 rounded-md px-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground data-active:bg-sidebar-accent/40 data-active:text-sidebar-foreground data-active:shadow-none"
              >
                <FileStack className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate" title={t("timeline.chatArtifactsTab")}>
                  {t("timeline.chatArtifactsTab")}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="observe"
                className="min-w-0 flex-1 gap-1.5 rounded-md px-1 text-[9px] font-semibold uppercase leading-tight tracking-[0.05em] data-active:bg-sidebar-accent/55 data-active:text-sidebar-foreground data-active:shadow-sm"
              >
                <RadioTower className="size-3.5 shrink-0 text-sky-700 dark:text-sky-300" />
                <span
                  className="line-clamp-2 text-center"
                  title={t("timeline.observeTabTooltip")}
                >
                  {t("timeline.observeTab")}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value="chat_files"
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            {rightPanelTab === "chat_files" ? (
              <ChatWorkspaceArtifactsPanel />
            ) : null}
          </TabsContent>
          <TabsContent
            value="observe"
            className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            {rightPanelTab === "observe" ? (
              <div
                id={RUNTIME_PANEL_IDS.observability}
                className={OBSERVABILITY_PANEL_ROOT_CLASS}
              >
                <ObservabilityPanel />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}
