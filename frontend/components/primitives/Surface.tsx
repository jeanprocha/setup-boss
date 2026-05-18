import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Surface({
  children,
  className,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  variant?: "default" | "inset" | "strip" | "conversation";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/45",
        variant === "default" && "bg-card shadow-[0_1px_2px_-1px_color-mix(in_oklch,var(--foreground)_8%,transparent)] dark:shadow-[0_1px_2px_-1px_rgba(0,0,0,0.45)]",
        variant === "conversation" &&
          "border-border/35 bg-card shadow-[0_1px_2px_-1px_color-mix(in_oklch,var(--foreground)_6%,transparent)] ring-1 ring-foreground/[0.04] dark:bg-card dark:shadow-[0_1px_2px_-1px_rgba(0,0,0,0.4)] dark:ring-white/[0.04]",
        variant === "inset" && "bg-muted/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
        variant === "strip" &&
          "border-l-[3px] border-l-sidebar-primary/55 bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
