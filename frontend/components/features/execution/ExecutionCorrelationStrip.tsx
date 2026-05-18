"use client";

import { Badge } from "@/components/ui/badge";
import type { ExecutionCorrelationLink } from "@/lib/runtime/execution/execution-types";
import { cn } from "@/lib/utils";

export function ExecutionCorrelationStrip({
  links,
  onNavigate,
}: {
  links: ExecutionCorrelationLink[];
  onNavigate?: (target: ExecutionCorrelationLink["target"]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((link) => {
        const clickable = link.available && Boolean(onNavigate);
        return (
          <Badge
            key={link.target}
            variant="outline"
            title={link.hint ?? undefined}
            className={cn(
              "text-[10px]",
              !link.available && "opacity-45",
              clickable && "cursor-pointer hover:bg-muted/50",
            )}
            onClick={() => {
              if (!clickable) return;
              onNavigate?.(link.target);
            }}
          >
            {link.label}
          </Badge>
        );
      })}
    </div>
  );
}
