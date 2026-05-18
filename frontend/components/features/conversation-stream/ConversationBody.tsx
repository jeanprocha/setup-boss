"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConversationBody({
  children,
  summaryLine,
  timestamp,
  className,
}: {
  children?: ReactNode;
  summaryLine?: ReactNode;
  timestamp?: ReactNode;
  className?: string;
}) {
  const hasLead = Boolean(summaryLine || timestamp);
  return (
    <div className={cn("cs-entry-body min-w-0 space-y-2", className)}>
      {hasLead ? (
        <div className="space-y-0.5">
          {summaryLine ? (
            <p className="cs-text-lead leading-snug">
              {summaryLine}
            </p>
          ) : null}
          {timestamp ? (
            <p className="cs-text-caption cs-text-comment tracking-tight">
              {timestamp}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
