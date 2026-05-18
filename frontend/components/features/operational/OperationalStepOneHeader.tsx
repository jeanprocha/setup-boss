"use client";

import type { ReactNode } from "react";
import { OperationalStepOneMainTitle } from "@/components/features/operational/OperationalStepOneMainTitle";
import { OperationalStepOneSectionHeading } from "@/components/features/operational/OperationalStepOneSectionHeading";
import { cn } from "@/lib/utils";

export function OperationalStepOneHeader({
  subtitle,
  hideSectionHeading = false,
  attentionMessage,
  children,
  className,
}: {
  subtitle: string;
  /** Oculta o subtítulo de secção (ex.: label já no corpo do compose). */
  hideSectionHeading?: boolean;
  attentionMessage?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  const showSection = !hideSectionHeading || children;

  return (
    <header className={cn("space-y-5 pb-1", className)}>
      <OperationalStepOneMainTitle />
      {showSection ? (
        <section
          className="space-y-2.5"
          aria-label={hideSectionHeading ? undefined : subtitle}
        >
          {!hideSectionHeading ? (
            <OperationalStepOneSectionHeading>{subtitle}</OperationalStepOneSectionHeading>
          ) : null}
          {children}
        </section>
      ) : null}
      {attentionMessage ? (
        <p
          role="status"
          className={cn(
            "rounded-md border border-amber-500/45 bg-amber-500/12 px-3 py-2",
            "text-sm font-medium text-amber-950 dark:text-amber-100",
          )}
        >
          {attentionMessage}
        </p>
      ) : null}
    </header>
  );
}
