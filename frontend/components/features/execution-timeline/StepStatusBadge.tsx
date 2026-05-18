"use client";

import { cn } from "@/lib/utils";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import { operationalStepStatusBadgeClass } from "@/lib/runtime/execution/operational-step-status";
import { useI18n } from "@/lib/i18n/use-i18n";

export function StepStatusBadge({
  status,
  className,
}: {
  status: OperationalStepStatus;
  className?: string;
}) {
  const { t } = useI18n();
  const key = `timeline.operationalStatus.${status}`;
  const label = t(key);
  const text = label === key ? status : label;

  return (
    <span
      className={cn(
        "inline-flex max-w-[9rem] truncate rounded-md border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
        operationalStepStatusBadgeClass(status),
        className,
      )}
    >
      {text}
    </span>
  );
}
