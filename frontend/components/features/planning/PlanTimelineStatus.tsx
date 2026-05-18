"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PlanTimelineStatus({
  blockId,
  children,
  variant = "default",
}: {
  blockId?: string;
  children: ReactNode;
  variant?: "default" | "error";
}) {
  return (
    <p
      id={blockId ? `plan-timeline-block-${blockId}` : undefined}
      className={cn(
        "plan-approval-timeline__status flex items-center gap-2 text-[12px] leading-snug",
        variant === "error" ? "text-destructive" : "text-muted-foreground",
      )}
      role="status"
    >
      {variant === "default" ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
      ) : null}
      {children}
    </p>
  );
}
