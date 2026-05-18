"use client";

import type { StepNavItem } from "@/stores/mission-shell-store";
import { ExecutionStepItem } from "@/components/features/execution-timeline/ExecutionStepItem";
import { useI18n } from "@/lib/i18n/use-i18n";

export function ExecutionTimeline({
  steps,
  highlightedIndex,
  onStepClick,
}: {
  steps: readonly StepNavItem[];
  highlightedIndex: number;
  onStepClick: (scrollTargetId: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("timeline.executionNavAria")}>
      <ol className="m-0 list-none divide-y divide-neutral-200/80 p-0">
        {steps.map((s, i) => (
          <ExecutionStepItem
            key={s.navKey}
            item={s}
            active={i === highlightedIndex}
            onActivate={() => onStepClick(s.scrollTargetId)}
          />
        ))}
      </ol>
    </nav>
  );
}
