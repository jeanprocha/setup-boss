"use client";

import { AlertTriangle, CheckCircle2, HelpCircle, Link2Off, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeRecoveryStatus } from "@/lib/runtime/orchestration/orchestration-types";

const CONFIG: Record<
  Exclude<RuntimeRecoveryStatus, null>,
  { label: string; className: string; Icon: typeof Loader2 }
> = {
  recovered: {
    label: "Recuperado",
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
    Icon: CheckCircle2,
  },
  stale: {
    label: "Runtime stale",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    Icon: AlertTriangle,
  },
  orphaned: {
    label: "Órfão",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-100",
    Icon: Link2Off,
  },
  recovery_pending: {
    label: "Recovery pendente",
    className: "border-cyan-500/35 bg-cyan-500/10 text-cyan-100",
    Icon: Loader2,
  },
  recovery_failed: {
    label: "Recovery falhou",
    className: "border-sb-failed/45 bg-sb-failed/10 text-sb-failed",
    Icon: AlertTriangle,
  },
};

export function RecoveryStatusBadge({
  status,
  hint,
  className,
}: {
  status: RuntimeRecoveryStatus;
  hint?: string | null;
  className?: string;
}) {
  if (!status) return null;
  const { label, className: tone, Icon } = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
        tone,
        className,
      )}
      title={hint ?? undefined}
    >
      <Icon
        className={cn(
          "size-3 shrink-0",
          status === "recovery_pending" && "animate-spin",
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      {!hint ? null : (
        <HelpCircle className="size-3 shrink-0 opacity-60" aria-hidden />
      )}
    </span>
  );
}
