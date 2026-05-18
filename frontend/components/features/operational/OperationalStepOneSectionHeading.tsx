"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Subtítulo de secção dentro da fase 1 (ex.: descrição, definindo o plano). */
export function OperationalStepOneSectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-xs font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </h3>
  );
}
