"use client";



import {

  CheckCircle2,

  CircleHelp,

  Clock,

  Hand,

  Info,

  Loader2,

  Sparkles,

  XCircle,

  type LucideIcon,

} from "lucide-react";

import { cn } from "@/lib/utils";

import type { ClarificationRuntimePhase } from "@/lib/runtime/clarification/clarification-types";

import { translateClarificationRuntimePhase } from "@/lib/runtime/translation/runtime-translation-layer";



const ICON_BY_KIND: Record<

  ReturnType<typeof translateClarificationRuntimePhase>["kind"],

  LucideIcon

> = {

  processing: Loader2,

  waiting_user: Hand,

  completed: CheckCircle2,

  blocked: Info,

  failed: XCircle,

  paused: Clock,

};



const TONE_BY_KIND: Record<

  ReturnType<typeof translateClarificationRuntimePhase>["kind"],

  string

> = {

  processing:

    "border-violet-600/40 bg-violet-500/12 font-semibold text-violet-950 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100",

  waiting_user:

    "border-amber-600/42 bg-amber-500/14 font-semibold text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",

  completed:

    "border-emerald-600/45 bg-emerald-500/14 font-semibold text-emerald-950 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-50",

  blocked:

    "border-border/40 bg-muted/35 font-medium text-muted-foreground dark:border-border/35 dark:bg-muted/25",

  failed:

    "border-sb-failed/45 bg-sb-failed/12 font-semibold text-red-950 dark:text-sb-failed",

  paused:

    "border-cyan-600/40 bg-cyan-500/12 font-semibold text-cyan-950 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-100",

};



export function ClarificationStateBadge({

  phase,

  className,

}: {

  phase: ClarificationRuntimePhase;

  className?: string;

}) {

  const p = translateClarificationRuntimePhase(phase);

  const Icon =

    phase === "clarification_required" || phase === "clarification_empty"

      ? CircleHelp

      : phase === "refinement_ready"

        ? Sparkles

        : ICON_BY_KIND[p.kind];

  const spin = p.kind === "processing";



  return (

    <span

      className={cn(

        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[10px] font-medium tracking-tight",

        TONE_BY_KIND[p.kind],

        className,

      )}

      title={p.description}

    >

      <Icon

        className={cn("size-3 shrink-0", spin && "animate-spin")}

        aria-hidden

      />

      <span className="truncate">{p.badge}</span>

    </span>

  );

}

