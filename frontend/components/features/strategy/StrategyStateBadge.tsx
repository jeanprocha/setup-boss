"use client";



import {

  AlertTriangle,

  CheckCircle2,

  CircleDashed,

  Hand,

  Loader2,

  ShieldCheck,

  Sparkles,

  XCircle,

  type LucideIcon,

} from "lucide-react";

import { cn } from "@/lib/utils";

import type { StrategyRuntimePhase } from "@/lib/runtime/strategy/strategy-types";

import { translateStrategyRuntimePhase } from "@/lib/runtime/translation/runtime-translation-layer";



const ICON_BY_KIND: Record<

  ReturnType<typeof translateStrategyRuntimePhase>["kind"],

  LucideIcon

> = {

  processing: Loader2,

  waiting_user: Hand,

  completed: ShieldCheck,

  blocked: AlertTriangle,

  failed: XCircle,

  paused: CircleDashed,

};



const TONE_BY_KIND: Record<

  ReturnType<typeof translateStrategyRuntimePhase>["kind"],

  string

> = {

  processing: "border-violet-500/40 bg-violet-500/10 text-violet-100",

  waiting_user: "border-indigo-500/40 bg-indigo-500/10 text-indigo-100",

  completed: "border-sb-success/40 bg-sb-success/10 text-sb-success",

  blocked: "border-amber-500/40 bg-amber-500/10 text-amber-200",

  failed: "border-sb-failed/40 bg-sb-failed/10 text-sb-failed",

  paused: "border-border bg-muted/30 text-muted-foreground",

};



export function StrategyStateBadge({

  phase,

  className,

}: {

  phase: StrategyRuntimePhase;

  className?: string;

}) {

  const p = translateStrategyRuntimePhase(phase);

  const Icon = ICON_BY_KIND[p.kind];

  const spin = p.kind === "processing";



  return (

    <span

      className={cn(

        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[10px] font-semibold tracking-wide",

        TONE_BY_KIND[p.kind],

        className,

      )}

      title={p.description}

    >

      <Icon

        className={cn("size-3 shrink-0", spin && "animate-spin")}

        aria-hidden

      />

      <span className="truncate normal-case">{p.badge}</span>

    </span>

  );

}

