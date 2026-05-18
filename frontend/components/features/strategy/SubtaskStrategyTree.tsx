"use client";

import { StatusBadge } from "@/components/primitives/StatusBadge";
import type { StrategySubtaskDto } from "@/lib/runtime/strategy/strategy-types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

const readinessTone = {
  ready: "border-emerald-500/30 bg-emerald-500/5",
  not_ready: "border-border/50 bg-background/20",
  blocked: "border-amber-500/35 bg-amber-500/8",
} as const;

export function SubtaskStrategyTree({
  rows,
}: {
  rows: StrategySubtaskDto[];
}) {
  if (!rows.length) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Sem subtasks planeadas.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {rows.map((st) => (
        <li
          key={st.id}
          className={cn(
            "rounded-sm border px-2 py-1.5",
            readinessTone[st.readiness],
            st.parentId && "ml-4 border-l-2 border-l-violet-500/25",
          )}
        >
          <SubtaskRow subtask={st} />
          {st.dependsOn.length > 0 ? (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              deps: {st.dependsOn.join(", ")}
            </p>
          ) : null}
          {st.blockerLabel ? (
            <p className="mt-0.5 text-[10px] text-amber-200/90">
              {st.blockerLabel}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function SubtaskRow({ subtask }: { subtask: StrategySubtaskDto }) {
  return (
    <div className="flex items-center gap-2">
      <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
        {subtask.title}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        #{subtask.order}
      </span>
      <StatusBadge
        state={
          subtask.readiness === "ready"
            ? "success"
            : subtask.readiness === "blocked"
              ? "blocked"
              : "running"
        }
        className="shrink-0 scale-90"
      />
    </div>
  );
}
