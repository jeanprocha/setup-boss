"use client";

import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const RuntimeTable = memo(function RuntimeTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("cs-table-scroll -mx-0.5 overflow-x-auto", className)}>
      <table className="cs-table cs-text-body w-full min-w-[280px] border-collapse text-left">
        {children}
      </table>
    </div>
  );
});
