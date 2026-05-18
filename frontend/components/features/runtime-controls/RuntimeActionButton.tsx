"use client";

import { Button } from "@/components/ui/button";
import type { ActionAvailability } from "@/lib/runtime/actions/runtime-action-types";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

export function RuntimeActionButton({
  label,
  icon: Icon,
  availability,
  isPending,
  onClick,
  variant = "outline",
}: {
  label: string;
  icon: LucideIcon;
  availability: ActionAvailability;
  isPending: boolean;
  onClick: () => void;
  variant?: "outline" | "ghost" | "destructive";
}) {
  const disabled =
    isPending ||
    (!availability.available && !availability.unsupported);
  const title =
    availability.disabledReason ||
    (availability.unsupported ? "Não suportado nesta fase" : label);

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={cn(
        "h-7 gap-1 px-2 font-mono text-[10px] uppercase tracking-wide",
        availability.unsupported && "opacity-50",
      )}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-3" aria-hidden />
      )}
      {label}
    </Button>
  );
}
