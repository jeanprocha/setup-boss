"use client";

import { Badge } from "@/components/ui/badge";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalVm } from "@/hooks/use-run-operational";
import { runtimeStateShortLabel } from "@/lib/runtime/adapters/runtime-labels";
import { Activity } from "lucide-react";

export function OperationalFocusCard({
  summary,
  headline,
  operational,
  attentionHint,
  description,
  ctaHint,
  statusBadge,
}: {
  summary: RunSummaryDto;
  headline: string | null;
  operational: RunOperationalVm | null;
  attentionHint: string | null;
  description?: string | null;
  ctaHint?: string | null;
  statusBadge?: string | null;
}) {
  const title = headline || runtimeStateShortLabel(summary.state);
  const badge = statusBadge ?? runtimeStateShortLabel(summary.state);

  return (
    <section
      className="scroll-mt-4 rounded-xl border border-sidebar-primary/22 bg-card px-3.5 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-sidebar-primary/10 dark:bg-card/85 dark:shadow-[0_1px_3px_rgba(0,0,0,0.4)] dark:ring-sidebar-primary/18"
      aria-label="Estado operacional actual"
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <Activity
          className="mt-0.5 size-4 shrink-0 text-sidebar-primary/85"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Estado operacional
            </span>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {badge}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              corrida{" "}
              <span className="font-mono text-foreground/80">
                {(summary.runId ?? summary.id).slice(0, 28)}
                {(summary.runId ?? summary.id).length > 28 ? "…" : ""}
              </span>
            </span>
          </div>
          <p className="text-[14px] font-semibold leading-snug tracking-tight text-foreground">
            {title}
          </p>
          {description ? (
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          {attentionHint ? (
            <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-100/92">
              {attentionHint}
            </p>
          ) : null}
          {ctaHint ? (
            <p className="text-[12px] font-medium leading-relaxed text-foreground/90">
              {ctaHint}
            </p>
          ) : !description && !attentionHint ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Próximo passo nos painéis abaixo (clarificação, estratégia ou execução).
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
