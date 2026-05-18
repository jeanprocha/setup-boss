"use client";

import { OPERATIONAL_STEP_ONE_TITLE } from "@/lib/runtime/operational/operational-step-one-ui";
import { cn } from "@/lib/utils";

export function OperationalStepOneMainTitle({ className }: { className?: string }) {
  return (
    <h2
      className={cn(
        "text-2xl font-bold tracking-tight text-foreground",
        className,
      )}
    >
      {OPERATIONAL_STEP_ONE_TITLE}
    </h2>
  );
}
