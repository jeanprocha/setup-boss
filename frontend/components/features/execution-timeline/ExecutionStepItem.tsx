"use client";

import { cn } from "@/lib/utils";
import type { StepNavItem } from "@/stores/mission-shell-store";
import { executionStepIcon } from "@/lib/runtime/execution/execution-step-icons";
import { stepNeedsUserAttention } from "@/lib/runtime/execution/operational-step-status";
import { StepTooltip } from "@/components/features/execution-timeline/StepTooltip";
import { useI18n } from "@/lib/i18n/use-i18n";
import { AlertTriangle } from "lucide-react";

export function ExecutionStepItem({
  item,
  active,
  onActivate,
}: {
  item: StepNavItem;
  active: boolean;
  onActivate: () => void;
}) {
  const { t } = useI18n();
  const Icon = executionStepIcon(item.iconName);
  const needsAttention = stepNeedsUserAttention(item.operationalStatus);

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 border-l-2 py-2 pl-2.5 pr-1 transition-colors duration-150",
          active
            ? "border-neutral-950 bg-neutral-100/90 dark:border-sidebar-foreground/80 dark:bg-sidebar-accent/55"
            : needsAttention
              ? "border-amber-500/70 bg-amber-500/8 hover:bg-amber-500/12 dark:border-amber-400/60 dark:bg-amber-500/10"
              : "border-transparent hover:bg-neutral-50/90 dark:hover:bg-sidebar-accent/20",
        )}
      >
        <button
          type="button"
          onClick={onActivate}
          aria-current={active ? "step" : undefined}
          aria-label={item.title}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-offset-1"
        >
          <Icon
            className={cn(
              "size-3.5 shrink-0 text-neutral-600 dark:text-sidebar-foreground/62",
              active && "text-neutral-950 dark:text-sidebar-foreground",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px] leading-snug",
              active
                ? "font-semibold text-neutral-950 dark:text-sidebar-foreground"
                : "font-medium text-neutral-700 dark:text-sidebar-foreground/82",
              needsAttention && !active && "text-amber-950 dark:text-amber-100",
            )}
          >
            {item.title}
          </span>
          {needsAttention ? (
            <AlertTriangle
              className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
          ) : null}
        </button>
        {needsAttention ? (
          <span className="sr-only">{t("timeline.stepNeedsAttention")}</span>
        ) : null}
        <StepTooltip
          label={item.title}
          description={item.shortDescription}
          className="shrink-0"
        />
      </div>
    </li>
  );
}
