import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  className,
  variant = "default",
  actions,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
  /** `operational` — empty state premium (workspace / IDE) */
  variant?: "default" | "operational";
  actions?: ReactNode;
}) {
  if (variant === "operational") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-card via-card to-muted/25 px-6 py-10 text-center shadow-[0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent),0_24px_48px_-36px_color-mix(in_oklch,rgb(var(--v-theme-primary))_35%,transparent)] dark:border-border/45 dark:from-card dark:via-card/95 dark:to-muted/15 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06),0_28px_56px_-32px_rgba(0,0,0,0.65)]",
          className,
        )}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklch,rgb(var(--v-theme-primary))_22%,transparent)_0%,transparent_68%)] opacity-90"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-12 size-48 rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--foreground)_8%,transparent)_0%,transparent_70%)]"
          aria-hidden
        />
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-[rgb(var(--v-theme-primary))]/20 bg-[rgb(var(--v-theme-primary))]/8 text-[rgb(var(--v-theme-primary))] shadow-inner dark:border-white/10 dark:bg-white/5 dark:text-teal-100">
            <Icon className="size-7 opacity-95" aria-hidden />
          </div>
          <p className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </p>
          {hint ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {hint}
            </p>
          ) : null}
          {actions ? (
            <div className="mt-2 flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-8 text-center",
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground/50" aria-hidden />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint ? (
        <p className="max-w-sm text-xs text-muted-foreground/80">{hint}</p>
      ) : null}
      {actions ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
