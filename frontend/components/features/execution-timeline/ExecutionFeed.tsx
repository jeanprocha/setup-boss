"use client";

import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export function ExecutionFeed({
  scrollRef,
  children,
  className,
}: {
  scrollRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn(
        "cs-central-column min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain",
        className,
      )}
    >
      <div className="mx-auto max-w-3xl px-3 pb-24 pt-1 md:px-5 md:pb-28">
        {children}
      </div>
    </div>
  );
}
