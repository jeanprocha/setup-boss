"use client";

import { Button } from "@/components/ui/button";
import { useIntakeStore } from "@/stores/intake-store";
import { History } from "lucide-react";

export function RecentTaskHints({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  const hints = useIntakeStore((s) => s.recentTaskHints);
  if (!hints.length) return null;

  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <History className="size-3" />
        Recentes
      </p>
      <div className="flex flex-wrap gap-1">
        {hints.map((h) => (
          <Button
            key={h}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-auto max-w-full truncate px-2 py-0.5 text-left text-[10px] font-normal"
            onClick={() => onPick(h)}
            title={h}
          >
            {h.slice(0, 48)}
            {h.length > 48 ? "…" : ""}
          </Button>
        ))}
      </div>
      </div>
  );
}
