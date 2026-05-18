"use client";

import { memo } from "react";
import { RuntimeObservabilityLogs } from "@/components/features/observability/RuntimeObservabilityLogs";
import { RuntimeObservabilityTechnical } from "@/components/features/observability/RuntimeObservabilityTechnical";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n/use-i18n";

/**
 * Legado: consola com sub-tabs. Preferir `ObservabilityPanel` (3 abas planas).
 */
function TechnicalDebugConsoleInner() {
  const { t } = useI18n();

  return (
    <Tabs
      defaultValue="logs"
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <TabsList
        variant="line"
        className="h-9 w-full shrink-0 justify-stretch gap-0.5 rounded-none border-b border-sidebar-border/90 bg-transparent px-1.5 pb-px pt-1"
      >
        <TabsTrigger
          value="logs"
          className="min-w-0 flex-1 rounded-md px-1.5 text-[8px] font-medium uppercase tracking-[0.06em] text-muted-foreground data-active:bg-sidebar-accent/40 data-active:text-sidebar-foreground data-active:shadow-none"
        >
          {t("timeline.logsTab")}
        </TabsTrigger>
        <TabsTrigger
          value="technical"
          className="min-w-0 flex-1 rounded-md px-1.5 text-[8px] font-medium uppercase tracking-[0.06em] text-muted-foreground data-active:bg-sidebar-accent/40 data-active:text-sidebar-foreground data-active:shadow-none"
        >
          {t("timeline.technicalTab")}
        </TabsTrigger>
      </TabsList>
      <p className="shrink-0 px-2 py-1 text-[9px] text-muted-foreground">
        {t("observability.debugConsoleHint")}
      </p>
      <TabsContent
        value="logs"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        <RuntimeObservabilityLogs />
      </TabsContent>
      <TabsContent
        value="technical"
        className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
      >
        <RuntimeObservabilityTechnical />
      </TabsContent>
    </Tabs>
  );
}

export const TechnicalDebugConsole = memo(TechnicalDebugConsoleInner);
