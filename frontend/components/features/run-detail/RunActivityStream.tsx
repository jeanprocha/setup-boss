"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { RuntimeEventDto } from "@/lib/api/runtime-types";
import {
  runtimeChannelLabel,
  runtimeSeverityLabel,
  severityDotClass,
  severityTextClass,
} from "@/lib/runtime/adapters/runtime-labels";
import { cn } from "@/lib/utils";
import { CloudOff, Radio, SatelliteDish } from "lucide-react";

function eventOriginMeta(ev: RuntimeEventDto): {
  label: string;
  badgeClass: string;
} {
  const src = ev.metadata?.source;
  if (src === "client-audit" || ev.metadata?.notArtifactBacked === true) {
    return {
      label: "client",
      badgeClass:
        "border-violet-600/35 bg-violet-500/12 font-medium text-violet-950 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-100",
    };
  }
  if (ev.metadata?.derivedFrom) {
    return {
      label: "inferred",
      badgeClass:
        "border-sky-600/35 bg-sky-500/12 font-medium text-sky-950 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-100",
    };
  }
  return {
    label: "runtime",
    badgeClass:
      "border-border/60 bg-muted/40 font-medium text-foreground dark:bg-background/40 dark:text-muted-foreground",
  };
}

const channelStyle = {
  orchestrator:
    "font-semibold text-cyan-950 dark:text-cyan-300/90",
  runtime: "font-semibold text-sky-950 dark:text-sky-200/90",
  policy: "font-semibold text-violet-950 dark:text-violet-200/90",
  integrity: "font-semibold text-emerald-950 dark:text-emerald-300/90",
} as const;

export function RunActivityStream({
  events,
  source,
  isFetching,
  reachable,
  degraded,
  ssePhase = "idle",
}: {
  events: RuntimeEventDto[];
  source: "runtime" | "offline";
  isFetching: boolean;
  reachable: boolean;
  degraded: boolean;
  ssePhase?: string;
}) {
  const mode = !reachable
    ? "offline"
    : ssePhase === "connected"
      ? "live+sse"
      : source === "runtime"
        ? "live"
        : "ref";

  const showDegraded = degraded && reachable;

  return (
    <details className="group flex min-h-0 min-w-0 flex-col border-t border-border/70 bg-card/35 pt-2 lg:border-l lg:border-t-0 lg:pt-0 open:flex-1 dark:bg-muted/15">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <SectionHeader
          title="Event stream técnico"
          description="Lista completa + tipos — útil para diagnóstico; não substitui o fluxo principal."
          action={
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Badge
                variant="outline"
                className="border-amber-600/45 bg-amber-500/12 font-mono text-[9px] uppercase font-semibold text-amber-950 dark:border-amber-500/35 dark:bg-transparent dark:text-amber-100"
              >
                debug
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px] uppercase">
                SSE
              </Badge>
              <Badge variant="outline" className="font-mono text-[9px] uppercase">
                {isFetching ? "sync" : mode}
              </Badge>
              <Badge
                variant="secondary"
                className="text-[9px] font-normal text-muted-foreground group-open:hidden"
              >
                Expandir
              </Badge>
              <Badge
                variant="secondary"
                className="hidden text-[9px] font-normal text-muted-foreground group-open:inline-flex"
              >
                Colapsar
              </Badge>
            </div>
          }
        />
      </summary>
      {!reachable ? (
        <div className="mx-3 mb-2 rounded-md border border-amber-600/40 bg-amber-500/12 px-2 py-1.5 text-[11px] font-medium text-amber-950 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-50">
          <span className="inline-flex items-center gap-1 font-medium">
            <CloudOff className="size-3.5" aria-hidden />
            Runtime indisponível — sem eventos em tempo real.
          </span>
        </div>
      ) : null}
      {showDegraded ? (
        <div className="mx-3 mb-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/5 dark:text-amber-50">
          Modo degradado: fila ou subsistema com anomalia — dados podem estar
          incompletos.
        </div>
      ) : null}
      <ScrollArea className="min-h-[min(40vh,320px)] flex-1 lg:min-h-[min(48vh,380px)]">
        <div className="px-3 py-2">
          {!events.length ? (
            <EmptyState
              icon={SatelliteDish}
              title="Sem eventos para esta corrida"
              hint={
                reachable
                  ? "A API não devolveu eventos ligados a este job/run na janela actual."
                  : "Ligue o daemon para eventos reais."
              }
              className="py-8"
            />
          ) : (
            <div className="relative pl-3">
              <div
                className="absolute bottom-0 left-[7px] top-1 w-px bg-border/80"
                aria-hidden
              />
              <ul className="space-y-2">
                {[...events]
                  .sort(
                    (a, b) =>
                      new Date(b.tsIso).getTime() - new Date(a.tsIso).getTime(),
                  )
                  .map((ev) => {
                    const origin = eventOriginMeta(ev);
                    return (
                      <li key={ev.id} className="relative pl-4">
                        <span
                          className={cn(
                            "absolute left-0 top-2 size-2 rounded-full ring-2 ring-background",
                            severityDotClass(ev.severity),
                          )}
                          aria-hidden
                        />
                        <div className="rounded-lg border border-border/60 bg-card px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-card/80 dark:shadow-none">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1.5 py-0 font-mono text-[8px] uppercase",
                                origin.badgeClass,
                              )}
                            >
                              {origin.label}
                            </Badge>
                            <span
                              className={cn(
                                "font-mono text-[9px] uppercase",
                                channelStyle[ev.channel],
                              )}
                            >
                              {runtimeChannelLabel(ev.channel)}
                            </span>
                            <span className="font-mono text-[9px] text-muted-foreground">
                              {ev.ts}
                            </span>
                            <span
                              className={cn(
                                "text-[9px] font-medium uppercase",
                                severityTextClass(ev.severity),
                              )}
                            >
                              {runtimeSeverityLabel(ev.severity)}
                            </span>
                            <span className="font-mono text-[9px] font-medium text-foreground/72 dark:text-muted-foreground">
                              {ev.type}
                            </span>
                            {ssePhase === "connected" ? (
                              <Radio
                                className="size-3 text-emerald-400/80"
                                aria-label="SSE activo"
                              />
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12px] leading-snug text-foreground/90">
                            {ev.message}
                          </p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </details>
  );
}
