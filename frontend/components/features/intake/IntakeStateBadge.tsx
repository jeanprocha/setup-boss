"use client";

import {
  CircleHelp,
  Loader2,
  Play,
  Rocket,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntakeUiPhase } from "@/lib/runtime/intake/intake-types";
import {
  intakePhaseLabel,
  intakePhaseTone,
} from "@/lib/runtime/intake/intake-state";

const ICONS: Record<IntakeUiPhase, LucideIcon> = {
  idle: Play,
  creating_run: Loader2,
  intake_running: Rocket,
  clarification_required: CircleHelp,
  clarification_ready: CircleHelp,
  strategy_pending: Rocket,
  failed: TriangleAlert,
};

const TONE_CLASS: Record<string, string> = {
  neutral: "border-border/60 bg-muted/20 text-muted-foreground",
  info: "border-sb-running/40 bg-sb-running/10 text-sb-running",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  success: "border-sb-success/40 bg-sb-success/10 text-sb-success",
  error: "border-sb-failed/45 bg-sb-failed/15 text-sb-failed",
};

export function IntakeStateBadge({ phase }: { phase: IntakeUiPhase }) {
  const tone = intakePhaseTone(phase);
  const Icon = ICONS[phase];
  const spin = phase === "creating_run" || phase === "intake_running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        TONE_CLASS[tone],
      )}
    >
      <Icon className={cn("size-3", spin && "animate-spin")} />
      {intakePhaseLabel(phase)}
    </span>
  );
}
