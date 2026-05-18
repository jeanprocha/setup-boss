"use client";

import type { ReactNode } from "react";
import type { OperationalPhaseStackMode } from "@/lib/runtime/operational/operational-phase-stack";

export function OperationalPhaseSection({
  phaseTitle,
  mode: _mode,
  children,
}: {
  phaseTitle: string;
  mode: OperationalPhaseStackMode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-label={phaseTitle}>
      {children}
    </section>
  );
}
