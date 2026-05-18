"use client";

import { memo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  ExecutionTimelineCheckpoint,
  ExecutionTimelineCheckpointStatus,
} from "@/lib/runtime/ux/derive-execution-timeline";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  Circle,
  Loader2,
  Minus,
  X,
} from "lucide-react";

const STATUS_STYLES: Record<
  ExecutionTimelineCheckpointStatus,
  { row: string; icon: string; Icon: typeof Check }
> = {
  completed: {
    row: "text-foreground",
    icon: "text-emerald-700 dark:text-emerald-400",
    Icon: Check,
  },
  active: {
    row: "text-foreground font-medium",
    icon: "text-sb-running",
    Icon: Loader2,
  },
  waiting: {
    row: "text-foreground",
    icon: "text-amber-700 dark:text-amber-400",
    Icon: AlertTriangle,
  },
  failed: {
    row: "text-sb-failed",
    icon: "text-sb-failed",
    Icon: X,
  },
  pending: {
    row: "text-muted-foreground",
    icon: "text-muted-foreground/50",
    Icon: Circle,
  },
  skipped: {
    row: "text-muted-foreground",
    icon: "text-muted-foreground",
    Icon: Minus,
  },
};

function CheckpointRow({
  cp,
  prepareBranchSlot,
}: {
  cp: ExecutionTimelineCheckpoint;
  prepareBranchSlot?: ReactNode;
}) {
  const styles = STATUS_STYLES[cp.status];
  const Icon = styles.Icon;
  const spin = cp.status === "active";

  return (
    <li className={cn("flex gap-2.5 py-0.5", styles.row)}>
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          styles.icon,
          spin && "animate-spin",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
          <span className="text-[12px] leading-snug">{cp.label}</span>
          {cp.timestamp ? (
            <time
              className="text-[10px] text-muted-foreground tabular-nums"
              dateTime={cp.timestamp}
            >
              {formatShortTime(cp.timestamp)}
            </time>
          ) : null}
        </div>
        {cp.message ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {cp.message}
          </p>
        ) : null}
        {cp.showPrepareBranchCta && prepareBranchSlot ? (
          <div className="mt-1.5">{prepareBranchSlot}</div>
        ) : null}
      </div>
    </li>
  );
}

function formatShortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type ExecutionTimelineViewProps = {
  checkpoints: readonly ExecutionTimelineCheckpoint[];
  className?: string;
  /** Mostra o rótulo «Progresso da corrida» (ocultar se a aba já se chama Progresso). */
  showSectionTitle?: boolean;
  onPrepareBranch?: () => void;
  prepareBranchPending?: boolean;
};

function ExecutionTimelineViewInner({
  checkpoints,
  className,
  showSectionTitle = true,
  onPrepareBranch,
  prepareBranchPending = false,
}: ExecutionTimelineViewProps) {
  if (!checkpoints.length) return null;

  return (
    <nav
      aria-label="Timeline operacional"
      className={cn(
        "mb-3 rounded-md border border-border/60 bg-muted/15 px-3 py-2",
        className,
      )}
    >
      {showSectionTitle ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Progresso da corrida
        </p>
      ) : null}
      <ol className="space-y-1">
        {checkpoints.map((cp) => (
          <CheckpointRow
            key={cp.id}
            cp={cp}
            prepareBranchSlot={
              cp.showPrepareBranchCta && onPrepareBranch ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={prepareBranchPending}
                  onClick={onPrepareBranch}
                >
                  {prepareBranchPending ? (
                    <Loader2 className="mr-1 size-3 animate-spin" />
                  ) : null}
                  Preparar branch
                </Button>
              ) : undefined
            }
          />
        ))}
      </ol>
    </nav>
  );
}

export const ExecutionTimelineView = memo(ExecutionTimelineViewInner);
