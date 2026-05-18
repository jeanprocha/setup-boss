"use client";

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pedido original — bloco “prompt da missão” (mock: fundo lavanda + ícone + mono). */
export function ActivityTaskInputBody({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md px-4 py-3.5",
        "bg-[color-mix(in_oklch,var(--sidebar-primary)_11%,var(--background))]",
        "dark:bg-[color-mix(in_oklch,var(--sidebar-primary)_16%,var(--background))]",
        className,
      )}
      aria-label="Pedido original da atividade"
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          "bg-[color-mix(in_oklch,var(--sidebar-primary)_20%,var(--background))]",
          "dark:bg-[color-mix(in_oklch,var(--sidebar-primary)_26%,var(--background))]",
        )}
        aria-hidden
      >
        <MessageSquare
          className="size-4 stroke-[1.75] text-sidebar-primary"
          aria-hidden
        />
      </div>
      <p className="min-w-0 flex-1 whitespace-pre-wrap pt-0.5 font-mono text-[13px] leading-relaxed text-foreground">
        {trimmed}
      </p>
    </div>
  );
}
