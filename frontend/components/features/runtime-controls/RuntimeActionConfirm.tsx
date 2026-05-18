"use client";

import { Button } from "@/components/ui/button";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RuntimeActionId } from "@/lib/runtime/actions/runtime-action-types";
import { actionLabel } from "@/lib/runtime/actions/action-availability";
import { runPhaseDisplayLabel } from "@/lib/runtime/adapters/runtime-labels";
import { StatusBadge } from "@/components/primitives/StatusBadge";
import { cn } from "@/lib/utils";

export function RuntimeActionConfirm({
  actionId,
  summary,
  open,
  isPending,
  onConfirm,
  onCancel,
}: {
  actionId: RuntimeActionId;
  summary: RunSummaryDto;
  open: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const destructive = actionId === "cancel-run";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]",
        destructive
          ? "border-red-500/40 bg-red-500/5"
          : "border-cyan-500/30 bg-cyan-500/5",
      )}
      role="status"
    >
      <span className="font-medium text-foreground">
        Confirmar {actionLabel(actionId)}?
      </span>
      <span className="text-muted-foreground">
        {summary.label} · {runPhaseDisplayLabel(summary.phase)} ·
      </span>
      <StatusBadge state={summary.state} />
      <span className="font-mono text-[10px] text-muted-foreground">
        {summary.runId ?? summary.id}
      </span>
      <div className="ml-auto flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={isPending}
          onClick={onCancel}
        >
          Voltar
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "secondary"}
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={isPending}
          onClick={onConfirm}
        >
          Confirmar
        </Button>
      </div>
    </div>
  );
}
