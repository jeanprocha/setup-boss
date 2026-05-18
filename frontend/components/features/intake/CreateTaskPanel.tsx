"use client";

import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { TaskComposer } from "@/components/features/intake/TaskComposer";
import { TaskSubmissionCard } from "@/components/features/intake/TaskSubmissionCard";
import { useCreateRun } from "@/hooks/use-create-run";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { Plus } from "lucide-react";

export function CreateTaskPanel() {
  const projectId = useMissionShellStore((s) => s.selectedProjectId);
  const create = useCreateRun();
  const result = create.data ?? null;

  return (
    <section className="shrink-0 border-b border-border/60 bg-background/20 px-2 py-2">
      <SectionHeader
        title="Nova operação"
        description="Intake runtime — criar corrida sem terminal."
        action={<Plus className="size-3.5 text-muted-foreground" />}
      />
      <div
        className={cn(
          "mt-2 grid gap-2",
          result && "lg:grid-cols-[1fr_minmax(200px,280px)]",
        )}
      >
        <TaskComposer projectId={projectId} />
        {result ? <TaskSubmissionCard result={result} /> : null}
      </div>
    </section>
  );
}
