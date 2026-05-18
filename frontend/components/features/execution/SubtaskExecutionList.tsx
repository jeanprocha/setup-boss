"use client";

import { SubtaskExecutionCard } from "@/components/features/execution/SubtaskExecutionCard";
import type { ExecutionSubtaskDto } from "@/lib/runtime/execution/execution-types";

export function SubtaskExecutionList({
  subtasks,
  activeId,
}: {
  subtasks: ExecutionSubtaskDto[];
  activeId: string | null;
}) {
  if (!subtasks.length) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Sem subtasks de execução registadas.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {subtasks.map((st) => (
        <li key={st.id}>
          <SubtaskExecutionCard subtask={st} isActive={st.id === activeId} />
        </li>
      ))}
    </ul>
  );
}
