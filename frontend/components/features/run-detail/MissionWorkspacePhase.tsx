"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MissionWorkspacePhaseStatus } from "@/lib/runtime/mission/mission-workflow-stages";

export type { MissionWorkspacePhaseStatus } from "@/lib/runtime/mission/mission-workflow-stages";

const STATUS_STYLE: Record<MissionWorkspacePhaseStatus, string> = {
  ACTIVE:
    "border-sidebar-primary/28 bg-sidebar-accent/45 text-foreground dark:border-sidebar-primary/35 dark:bg-sidebar-accent/35",
  COMPLETED:
    "border-border/35 bg-muted/30 text-muted-foreground dark:bg-muted/18",
  WAITING:
    "border-sb-warning/22 bg-sb-warning/[0.06] text-foreground/85 dark:border-sb-warning/28",
  WAITING_USER_ACTION:
    "border-cyan-500/35 bg-cyan-500/10 text-foreground dark:border-cyan-400/40 dark:bg-cyan-500/12",
  RUNNING:
    "border-sky-500/35 bg-sky-500/10 text-foreground dark:border-sky-400/35 dark:bg-sky-500/10",
  BLOCKED:
    "border-sb-failed/28 bg-sb-failed/[0.07] text-sb-failed",
  FAILED:
    "border-sb-failed/40 bg-sb-failed/12 text-sb-failed",
  PENDING:
    "border-border/30 bg-muted/22 text-muted-foreground dark:bg-muted/12",
  UPCOMING:
    "border-border/25 bg-muted/15 text-muted-foreground/90 dark:bg-muted/10",
};

function badgeLabel(status: MissionWorkspacePhaseStatus): string {
  if (status === "WAITING_USER_ACTION") return "AGUARDA SI";
  if (status === "UPCOMING") return "PRÓXIMA";
  return status;
}

export function MissionWorkspacePhase({
  stepNum,
  title,
  status,
  children,
  className,
  id,
  visualWeight = "default",
}: {
  stepNum: 1 | 2 | 3 | 4;
  title: string;
  status: MissionWorkspacePhaseStatus;
  children: ReactNode;
  className?: string;
  id?: string;
  /** default: cartão normal; hero: etapa activa dominante; muted: etapa concluída compacta */
  visualWeight?: "default" | "hero" | "muted";
}) {
  const hero = visualWeight === "hero";
  const muted = visualWeight === "muted";

  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-6 space-y-2.5 rounded-xl border bg-card p-3.5 shadow-[0_1px_2px_-1px_color-mix(in_oklch,var(--foreground)_8%,transparent)] dark:bg-card dark:shadow-[0_1px_2px_-1px_rgba(0,0,0,0.4)]",
        hero
          ? "border-sidebar-primary/40 p-4 shadow-[0_8px_28px_-12px_color-mix(in_oklch,var(--sidebar-primary)_35%,transparent)] dark:border-sidebar-primary/45 dark:shadow-[0_10px_32px_-14px_rgba(0,0,0,0.55)]"
          : muted
            ? "border-border/25 bg-muted/15 p-2.5 opacity-[0.92] dark:border-border/20 dark:bg-muted/12"
            : "border-border/40 dark:border-border/35",
        className,
      )}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b border-border/30 pb-2.5",
          muted && "border-border/20 pb-1.5",
        )}
      >
        <h2
          className={cn(
            "font-semibold tracking-tight text-foreground",
            hero ? "text-[13px]" : "text-[12px]",
            muted && "text-[11px] text-muted-foreground",
          )}
        >
          Etapa {stepNum} — {title}
        </h2>
        <Badge
          variant="outline"
          className={cn("font-mono text-[9px] uppercase", STATUS_STYLE[status])}
        >
          {badgeLabel(status)}
        </Badge>
      </header>
      <div className={cn("min-w-0", muted && "text-[11px]")}>{children}</div>
    </section>
  );
}
