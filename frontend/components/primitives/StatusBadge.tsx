"use client";

import { cn } from "@/lib/utils";
import type { RuntimeUiState } from "@/lib/runtime/runtime-ui-types";
import { runtimeStateLabels } from "@/lib/runtime/runtime-ui-types";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Hand,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";

const tone: Record<
  RuntimeUiState,
  { className: string; Icon: typeof Loader2 }
> = {
  running: {
    className: "border-sb-running/40 bg-sb-running/15 text-sb-running",
    Icon: Loader2,
  },
  waiting_clarification_questions: {
    className:
      "border-amber-500/40 bg-amber-500/[0.11] text-amber-950 dark:text-amber-100",
    Icon: AlertTriangle,
  },
  waiting_clarification_answers: {
    className:
      "border-cyan-600/35 bg-cyan-500/[0.10] text-cyan-950 dark:text-cyan-100",
    Icon: Hand,
  },
  waiting_approval: {
    className:
      "border-amber-500/38 bg-amber-500/[0.10] text-amber-950 dark:text-amber-100",
    Icon: Hand,
  },
  blocked: {
    className: "border-sb-blocked/45 bg-sb-blocked/15 text-sb-blocked",
    Icon: Ban,
  },
  failed: {
    className: "border-sb-failed/45 bg-sb-failed/15 text-sb-failed",
    Icon: XCircle,
  },
  correcting: {
    className: "border-sb-correcting/45 bg-sb-correcting/15 text-sb-correcting",
    Icon: Wrench,
  },
  retrying: {
    className: "border-sb-retrying/45 bg-sb-retrying/15 text-sb-retrying",
    Icon: RefreshCw,
  },
  recovered: {
    className: "border-sb-recovered/45 bg-sb-recovered/15 text-sb-recovered",
    Icon: ShieldCheck,
  },
  success: {
    className: "border-sb-success/45 bg-sb-success/15 text-sb-success",
    Icon: CheckCircle2,
  },
  warning: {
    className: "border-sb-warning/45 bg-sb-warning/15 text-sb-warning",
    Icon: AlertTriangle,
  },
};

export function StatusBadge({
  state,
  label,
  className,
}: {
  state: RuntimeUiState;
  /** Rótulo honesto (ex. workflow.*) — substitui runtimeStateLabels quando presente */
  label?: string | null;
  className?: string;
}) {
  const { className: toneClass, Icon } = tone[state];
  const spin = state === "running" || state === "retrying";
  const text =
    typeof label === "string" && label.trim() ? label.trim() : runtimeStateLabels[state];

  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[11px] font-medium tracking-tight backdrop-blur-[2px]",
        toneClass,
        className,
      )}
    >
      <Icon
        className={cn("size-3 shrink-0", spin && "animate-spin")}
        aria-hidden
      />
      <span className="truncate">{text}</span>
    </span>
  );
}
