"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConversationHeader({
  title,
  leading,
  status,
  metadata,
  className,
}: {
  title: ReactNode;
  leading?: ReactNode;
  status?: ReactNode;
  metadata?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {leading ? (
            <div className="cs-entry-header-leading flex shrink-0 items-center justify-center">
              {leading}
            </div>
          ) : null}
          <div className="min-w-0 flex-1">{title}</div>
        </div>
        {status ? (
          <div className="flex shrink-0 items-center">{status}</div>
        ) : null}
      </div>
      {metadata ? (
        <div className="cs-entry-metadata flex flex-wrap gap-x-3 gap-y-0.5">
          {metadata}
        </div>
      ) : null}
    </header>
  );
}
