"use client";

import type { QuestionUiStatus } from "@/lib/runtime/clarification/clarification-types";
import { cn } from "@/lib/utils";

const LABELS: Record<QuestionUiStatus, string> = {
  pending: "Pendente",
  answered: "Respondida",
  approved: "Aprovada",
  rejected: "Rejeitada",
  needs_refinement: "Refinar",
};

const TONE: Record<QuestionUiStatus, string> = {
  pending:
    "border-border/35 bg-muted/40 text-[10px] font-medium text-muted-foreground dark:bg-muted/28",
  answered:
    "border-border/30 bg-muted/35 text-[10px] font-medium text-foreground/75 dark:bg-muted/22",
  approved:
    "border-sb-success/22 bg-sb-success/[0.08] text-[10px] font-medium text-foreground/85 dark:border-sb-success/25",
  rejected:
    "border-sb-failed/30 bg-sb-failed/[0.08] text-[10px] font-medium text-sb-failed",
  needs_refinement:
    "border-sb-warning/22 bg-sb-warning/[0.07] text-[10px] font-medium text-foreground/80 dark:border-sb-warning/25",
};

export function QuestionStatusBadge({ status }: { status: QuestionUiStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 tracking-tight",
        TONE[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
