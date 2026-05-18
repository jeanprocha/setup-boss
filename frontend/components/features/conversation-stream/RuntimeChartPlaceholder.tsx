"use client";

import { memo } from "react";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Slot reservado para Recharts / lightweight-charts no stream operacional. */
export const RuntimeChartPlaceholder = memo(function RuntimeChartPlaceholder({
  title = "Métricas de runtime",
  hint = "Gráficos (timeline, tokens, retries) serão renderizados aqui.",
  className,
}: {
  title?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cs-bg cs-fg flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--cs-border)] px-3 py-4 text-center",
        className,
      )}
      role="img"
      aria-label={title}
    >
      <BarChart3 className="cs-fg size-4" aria-hidden />
      <p className="cs-text-caption font-medium uppercase tracking-wide">
        {title}
      </p>
      <p className="cs-text-caption cs-fg-muted max-w-xs leading-snug">
        {hint}
      </p>
    </div>
  );
});
