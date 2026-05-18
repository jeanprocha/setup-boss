"use client";

import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { MissionOrchestrationSlices } from "@/lib/runtime/mission/mission-workflow-stages";
import {
  deriveProjectRunWorkflowSteps,
  type WorkflowFeedbackStepStatus,
} from "@/lib/runtime/mission/project-run-workflow-feedback";
import { cn } from "@/lib/utils";
import { Check, Circle, Loader2, AlertTriangle } from "lucide-react";

function StepIcon({ status }: { status: WorkflowFeedbackStepStatus }) {
  if (status === "done") {
    return (
      <Check
        className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden
      />
    );
  }
  if (status === "active") {
    return (
      <Loader2
        className="size-3.5 shrink-0 animate-spin text-sidebar-primary"
        aria-hidden
      />
    );
  }
  if (status === "warning") {
    return (
      <AlertTriangle
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-300"
        aria-hidden
      />
    );
  }
  return (
    <Circle className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
  );
}

export function ProjectRunWorkflowStatusStrip({
  summary,
  orch,
  submitAnswersPending = false,
  approvePending = false,
  gitBranchPreparePending = false,
}: {
  summary: RunSummaryDto;
  orch: MissionOrchestrationSlices;
  submitAnswersPending?: boolean;
  approvePending?: boolean;
  gitBranchPreparePending?: boolean;
}) {
  const steps = deriveProjectRunWorkflowSteps({
    summary,
    orch,
    submitAnswersPending,
    approvePending,
    gitBranchPreparePending,
  });

  if (steps.length === 0) return null;

  return (
    <div
      className="mb-3 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/20 px-3 py-2.5 shadow-sm"
      role="status"
      aria-live="polite"
      aria-label="Progresso do fluxo da atividade"
    >
      <StripHeader />
      <ol className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2">
            <StepIcon status={step.status} />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[11px] font-medium leading-snug",
                  step.status === "active"
                    ? "text-foreground"
                    : step.status === "warning"
                      ? "text-amber-800 dark:text-amber-100/95"
                      : "text-foreground/90",
                )}
              >
                {step.label}
              </p>
              {step.detail ? (
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StripHeader() {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      Fluxo da atividade
    </p>
  );
}


