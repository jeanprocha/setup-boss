"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OrchestrationExecutionState,
  OrchestrationState,
} from "@/lib/runtime/orchestration/orchestration-types";

const EXEC_CONFIG: Record<
  OrchestrationExecutionState,
  { label: string; className: string; Icon: LucideIcon; spin?: boolean }
> = {
  ready_for_execution: {
    label: "Pronta",
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
    Icon: Play,
  },
  execution_starting: {
    label: "A iniciar",
    className: "border-sb-running/40 bg-sb-running/10 text-sb-running",
    Icon: Loader2,
    spin: true,
  },
  execution_running: {
    label: "Em execução",
    className: "border-sb-running/40 bg-sb-running/10 text-sb-running",
    Icon: Loader2,
    spin: true,
  },
  execution_reviewing: {
    label: "Review",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    Icon: ShieldCheck,
  },
  execution_correcting: {
    label: "Correcção",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-100",
    Icon: RefreshCw,
    spin: true,
  },
  execution_blocked: {
    label: "Bloqueada",
    className: "border-sb-warning/45 bg-sb-warning/10 text-sb-warning",
    Icon: AlertTriangle,
  },
  execution_failed: {
    label: "Falhou",
    className: "border-sb-failed/45 bg-sb-failed/10 text-sb-failed",
    Icon: XCircle,
  },
  execution_completed: {
    label: "Concluída",
    className: "border-sb-success/40 bg-sb-success/10 text-sb-success",
    Icon: CheckCircle2,
  },
  execution_recovering: {
    label: "Recuperação",
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
    Icon: ShieldCheck,
  },
};

const ORCH_LABELS: Partial<Record<OrchestrationState, string>> = {
  degraded: "Orchestration degradada",
  unavailable: "Orchestration indisponível",
  queued: "Em fila",
};

export function OrchestrationStateBadge({
  executionState,
  orchestrationState,
  className,
}: {
  executionState: OrchestrationExecutionState;
  orchestrationState?: OrchestrationState;
  className?: string;
}) {
  if (orchestrationState === "degraded" || orchestrationState === "unavailable") {
    const label = ORCH_LABELS[orchestrationState] ?? orchestrationState;
    return (
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 text-[10px] font-semibold uppercase tracking-wide text-amber-100",
          className,
        )}
      >
        <PauseCircle className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
    );
  }

  const { label, className: tone, Icon, spin } = EXEC_CONFIG[executionState];
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
        tone,
        className,
      )}
    >
      <Icon className={cn("size-3 shrink-0", spin && "animate-spin")} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
