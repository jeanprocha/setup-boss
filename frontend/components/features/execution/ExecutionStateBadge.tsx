"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";

const CONFIG: Record<
  ExecutionLifecyclePhase,
  { label: string; className: string; Icon: LucideIcon; spin?: boolean }
> = {
  execution_pending: {
    label: "Execução pendente",
    className: "border-border bg-muted/30 text-muted-foreground",
    Icon: PauseCircle,
  },
  execution_running: {
    label: "Em execução",
    className: "border-sb-running/40 bg-sb-running/10 text-sb-running",
    Icon: Loader2,
    spin: true,
  },
  review_running: {
    label: "Review activo",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    Icon: ShieldCheck,
  },
  correction_running: {
    label: "Correcção activa",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-100",
    Icon: RefreshCw,
    spin: true,
  },
  retry_running: {
    label: "Retry em curso",
    className: "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
    Icon: RotateCcw,
    spin: true,
  },
  rollback_running: {
    label: "Rollback",
    className: "border-orange-500/40 bg-orange-500/10 text-orange-100",
    Icon: RotateCcw,
  },
  recovery_running: {
    label: "Recuperação",
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
    Icon: ShieldCheck,
  },
  execution_blocked: {
    label: "Execução bloqueada",
    className: "border-sb-warning/45 bg-sb-warning/10 text-sb-warning",
    Icon: AlertTriangle,
  },
  execution_failed: {
    label: "Execução falhou",
    className: "border-sb-failed/45 bg-sb-failed/10 text-sb-failed",
    Icon: XCircle,
  },
  execution_completed: {
    label: "Execução concluída",
    className: "border-sb-success/40 bg-sb-success/10 text-sb-success",
    Icon: CheckCircle2,
  },
};

export function ExecutionStateBadge({
  phase,
  className,
}: {
  phase: ExecutionLifecyclePhase;
  className?: string;
}) {
  const { label, className: tone, Icon, spin } = CONFIG[phase];
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
        tone,
        className,
      )}
    >
      <Icon
        className={cn("size-3 shrink-0", spin && "animate-spin")}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
