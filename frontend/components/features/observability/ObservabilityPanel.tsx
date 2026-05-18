"use client";

import { memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RuntimeObservabilityLogs } from "@/components/features/observability/RuntimeObservabilityLogs";
import { RuntimeObservabilityTechnical } from "@/components/features/observability/RuntimeObservabilityTechnical";
import {
  useMissionLayoutStore,
  type ObservabilitySubTab,
} from "@/stores/mission-layout-store";
import { useI18n } from "@/lib/i18n/use-i18n";
import { OBSERVABILITY_PANEL_ROOT_CLASS } from "@/lib/runtime/observability/observability-panel-styles";

const OBSERVE_SUB_TABS: ObservabilitySubTab[] = ["runtime_logs", "technical"];

function isObserveSubTab(v: string): v is ObservabilitySubTab {
  return (OBSERVE_SUB_TABS as string[]).includes(v);
}

function ObservabilityPanelInner() {
  const { t } = useI18n();
  const observeSubTab = useMissionLayoutStore((s) => s.observeSubTab);
  const setObserveSubTab = useMissionLayoutStore((s) => s.setObserveSubTab);

  return (
    <Tabs
      value={observeSubTab}
      onValueChange={(v) => {
        if (isObserveSubTab(v)) setObserveSubTab(v);
      }}
      className={`${OBSERVABILITY_PANEL_ROOT_CLASS} gap-0`}
    >
      <TabsList
        variant="line"
        className="h-9 w-full shrink-0 justify-stretch gap-0.5 rounded-none border-b border-sidebar-border/90 bg-transparent px-1.5 pb-px pt-1"
      >
        <TabsTrigger
          value="runtime_logs"
          className="min-w-0 flex-1 rounded-md px-1 text-[8px] font-medium uppercase tracking-[0.05em] text-muted-foreground data-active:bg-sidebar-accent/40 data-active:text-sidebar-foreground data-active:shadow-none"
        >
          {t("timeline.logsTab")}
        </TabsTrigger>
        <TabsTrigger
          value="technical"
          className="min-w-0 flex-1 rounded-md px-1 text-[8px] font-medium uppercase tracking-[0.05em] text-muted-foreground data-active:bg-sidebar-accent/40 data-active:text-sidebar-foreground data-active:shadow-none"
        >
          {t("timeline.technicalTab")}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="runtime_logs"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        {observeSubTab === "runtime_logs" ? <RuntimeObservabilityLogs /> : null}
      </TabsContent>
      <TabsContent
        value="technical"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        {observeSubTab === "technical" ? (
          <>
            <p className="shrink-0 px-2 py-1 text-[9px] text-muted-foreground">
              {t("observability.debugConsoleHint")}
            </p>
            <RuntimeObservabilityTechnical />
          </>
        ) : null}
      </TabsContent>
    </Tabs>
  );
}

export const ObservabilityPanel = memo(ObservabilityPanelInner);
