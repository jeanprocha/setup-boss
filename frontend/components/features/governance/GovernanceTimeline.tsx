"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  timelineStatusClass,
  type GovernanceTimelineStage,
} from "@/lib/runtime/governance/ia-governance-ux";
import { cn } from "@/lib/utils";

function StageRow({ stage }: { stage: GovernanceTimelineStage }) {
  const [open, setOpen] = useState(
    stage.status === "fail" || stage.status === "warn",
  );
  const hasDetails = stage.details && Object.keys(stage.details).length > 0;

  return (
    <div className="rounded border border-border/35 bg-muted/10">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
        onClick={() => hasDetails && setOpen((v) => !v)}
        disabled={!hasDetails}
      >
        {hasDetails ? (
          open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block size-3 shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-[10px] font-medium">{stage.label}</span>
        <span
          className={cn(
            "shrink-0 font-mono text-[9px] uppercase",
            timelineStatusClass(stage.status),
          )}
        >
          {stage.status}
        </span>
        {stage.durationMs != null ? (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
            {stage.durationMs}ms
          </span>
        ) : null}
      </button>
      {stage.message ? (
        <p className="border-t border-border/25 px-2 py-1 text-[10px] text-muted-foreground">
          {stage.message}
        </p>
      ) : null}
      {open && hasDetails ? (
        <pre className="max-h-32 overflow-auto border-t border-border/25 p-2 font-mono text-[9px] text-foreground/80">
          {JSON.stringify(stage.details, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function GovernanceTimeline({
  stages,
  className,
}: {
  stages: GovernanceTimelineStage[];
  className?: string;
}) {
  if (!stages.length) return null;
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-medium text-foreground/80">
        Git → Seed → Version → Structure → Drift → Policy
      </p>
      {stages.map((stage) => (
        <StageRow key={stage.id} stage={stage} />
      ))}
    </div>
  );
}
