"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SB_RUNTIME_NAV_EVENT,
  type RuntimeNavigateDetail,
} from "@/lib/runtime/navigation/runtime-action-navigation";

export function TimelineCardHeader({
  title,
  aside,
  toolbar,
  leading,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  toolbar?: ReactNode;
  /** Ícone ou marcador à esquerda do título (modo cockpit / escaneável). */
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-1.5 flex flex-wrap items-start justify-between gap-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {leading ? (
          <div className="mt-px shrink-0 text-sky-700 opacity-90 dark:text-sky-300">
            {leading}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">{title}</div>
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-1.5">{aside}</div> : null}
      {toolbar ? <div className="w-full shrink-0">{toolbar}</div> : null}
    </header>
  );
}

export function TimelineCardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 text-[12px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Área reservada: logs, markdown, diffs, métricas (fases futuras). */
export function TimelineCardExpanded({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-2.5 space-y-2 rounded-md border border-border/35 bg-muted/10 px-2 py-2 text-[11px] text-muted-foreground shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]",
        className,
      )}
    >
      {children ?? (
        <p className="leading-snug">
          Área reservada para logs, diffs, reasoning e métricas — ainda não
          ligada ao runtime nesta fase.
        </p>
      )}
    </div>
  );
}

type TimelineCardProps = {
  children: ReactNode;
  /** Id do cartão na timeline (`exec-semantic-*`) para expandir via navegação. */
  anchorId?: string;
  /** Conteúdo sempre visível (ex.: chips), mesmo quando colapsado. */
  persistentFooter?: ReactNode;
  /** Quando true, inicia colapsado e mostra resumo + slot expandido. */
  expandable?: boolean;
  defaultExpanded?: boolean;
  summaryLine?: ReactNode;
  timestamp?: ReactNode;
  header: ReactNode;
  expandedSlot?: ReactNode;
  /** Densidade só visual (hero / operacional / sistema). */
  visualDensity?: "hero" | "operational" | "system";
};

export function TimelineCard({
  anchorId,
  expandable = false,
  defaultExpanded = true,
  summaryLine,
  timestamp,
  header,
  expandedSlot,
  persistentFooter,
  children,
  visualDensity = "operational",
}: TimelineCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!anchorId || !expandable) return;
    const onNavigate = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeNavigateDetail>).detail;
      if (detail?.scrollAnchorId === anchorId && detail.expand) {
        setExpanded(true);
      }
    };
    window.addEventListener(SB_RUNTIME_NAV_EVENT, onNavigate);
    return () => window.removeEventListener(SB_RUNTIME_NAV_EVENT, onNavigate);
  }, [anchorId, expandable]);

  const showBody = !expandable || expanded;
  const showCollapsedPreview = expandable && !expanded;

  const summaryClamp = visualDensity === "system" ? "line-clamp-2" : "line-clamp-3";
  const summaryText =
    visualDensity === "hero"
      ? "text-[12px] font-medium leading-snug text-foreground/92"
      : visualDensity === "system"
        ? "text-[10.5px] leading-snug text-muted-foreground/95"
        : "text-[11px] leading-snug text-foreground/88";

  return (
    <>
      {header}
      {persistentFooter ? (
        <div
          className={cn(
            "mb-1.5 flex flex-wrap gap-1",
            visualDensity === "hero" && "gap-1.5",
          )}
        >
          {persistentFooter}
        </div>
      ) : null}
      {showCollapsedPreview ? (
        <div className="mb-1.5 space-y-0.5 text-muted-foreground">
          {summaryLine ? (
            <p className={cn(summaryClamp, summaryText)}>{summaryLine}</p>
          ) : null}
          {timestamp ? (
            <p className="font-mono text-[9px] tracking-tight text-muted-foreground/70">
              {timestamp}
            </p>
          ) : null}
        </div>
      ) : null}
      {showBody ? (
        <>
          <TimelineCardBody
            className={cn(
              visualDensity === "system" && "text-[11px] leading-snug",
              visualDensity === "hero" && "text-[12px] leading-snug",
            )}
          >
            {summaryLine || timestamp ? (
              <div
                className={cn(
                  "mb-1.5 space-y-0.5 border-b border-border/20 pb-1.5",
                  visualDensity === "hero" ? "text-[12px]" : "text-[11px]",
                )}
              >
                {summaryLine ? (
                  <p className={cn("leading-snug", summaryText)}>{summaryLine}</p>
                ) : null}
                {timestamp ? (
                  <p className="font-mono text-[9px] text-muted-foreground/75">
                    {timestamp}
                  </p>
                ) : null}
              </div>
            ) : null}
            {children}
          </TimelineCardBody>
          {expandable && expanded ? (
            <TimelineCardExpanded>{expandedSlot}</TimelineCardExpanded>
          ) : null}
        </>
      ) : null}
      {expandable ? (
        <div className="mt-1.5 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform duration-200 ease-out",
                expanded ? "rotate-180" : "rotate-0",
              )}
            />
            {expanded ? "Recolher" : "Expandir"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
