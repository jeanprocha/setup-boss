"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  derivePlanningOperationalPlanStatus,
  labelPlanningOperationalPlanStatus,
  type PlanningOperationalPlanStatus,
} from "@/lib/runtime/operational/planning-operational-plan-state";
import { translateOperationalPlan } from "@/lib/runtime/operational/translate-operational-plan";
import { operationalPhaseLabelForUi } from "@/lib/runtime/operational/operational-ux-selectors";
import { OperationalPlanDocument } from "@/components/features/planning/OperationalPlanDocument";
import { useClarification } from "@/hooks/use-clarification";
import { useStrategy } from "@/hooks/use-strategy";
import { LoadingState } from "@/components/primitives/LoadingState";
import { cn } from "@/lib/utils";
import { isRunReadModelConflictReason } from "@/lib/runtime/run-read-model-http";
import { PlanningPhaseHeader } from "@/components/features/planning/PlanningPhaseHeader";
import { useRunTaskInput } from "@/hooks/use-run-task-input";

const STATUS_RAIL: PlanningOperationalPlanStatus[] = [
  "generating_plan",
  "presenting_plan",
  "plan_final_generated",
];

const POLL_STATUSES = new Set<PlanningOperationalPlanStatus>(["generating_plan"]);

function StepIcon({ current, passed }: { current: boolean; passed: boolean }) {
  if (passed) {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (current) {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

function PlanStatusRail({ current }: { current: PlanningOperationalPlanStatus }) {
  const idx = STATUS_RAIL.indexOf(current);
  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {STATUS_RAIL.map((stepId, stepIdx) => {
        const passed =
          idx > stepIdx || current === "plan_final_generated";
        const isCurrent = stepId === current;
        return (
          <li
            key={stepId}
            className={cn(
              "flex items-center gap-2 text-[11px]",
              isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
              passed && !isCurrent && "text-foreground/75",
            )}
          >
            <StepIcon current={isCurrent} passed={passed} />
            <span>{labelPlanningOperationalPlanStatus(stepId)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PlanningOperationalPlanPanel({
  projectId,
  summary,
  operationalUx,
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
}) {
  const runKey = summary.runId ?? summary.id;
  const taskInput = useRunTaskInput(projectId, runKey);
  const clarification = useClarification(runKey, summary.phase, summary.state);
  const strategy = useStrategy(runKey, summary.phase, summary.state);

  const bundle = clarification.bundle;

  const status = useMemo(
    () =>
      derivePlanningOperationalPlanStatus({
        contract: operationalUx,
        clarification: bundle ?? null,
        strategy: strategy.bundle,
        strategyApplies: strategy.applies,
        clarificationLoading: clarification.isPending,
        clarificationFetching: clarification.isFetching,
        strategyLoading: strategy.isPending,
        strategyFetching: strategy.isFetching,
      }),
    [
      operationalUx,
      bundle,
      strategy.bundle,
      strategy.applies,
      clarification.isPending,
      clarification.isFetching,
      strategy.isPending,
      strategy.isFetching,
    ],
  );

  const plan = useMemo(
    () =>
      bundle
        ? translateOperationalPlan({
            clarification: bundle,
            strategy: strategy.bundle,
          })
        : null,
    [bundle, strategy.bundle],
  );

  const readModelConflict = isRunReadModelConflictReason(
    bundle?.unsupportedReason,
  );

  const shouldPoll =
    POLL_STATUSES.has(status) && clarification.applies && !readModelConflict;

  useEffect(() => {
    if (!shouldPoll || !runKey) return;
    const id = window.setInterval(() => {
      void clarification.refetch();
      if (strategy.applies) void strategy.refetch();
    }, 4000);
    return () => window.clearInterval(id);
  }, [
    shouldPoll,
    runKey,
    clarification.refetch,
    clarification.applies,
    strategy.refetch,
    strategy.applies,
  ]);

  const phaseLabel = operationalPhaseLabelForUi(operationalUx);
  const statusLabel = labelPlanningOperationalPlanStatus(status);

  if (clarification.isPending && !bundle) {
    return (
      <section className="mx-auto w-full max-w-2xl py-8">
        <LoadingState />
      </section>
    );
  }

  if (!bundle || bundle.source === "unsupported") {
    const conflictHint = bundle?.unsupportedReason?.replace(
      /^\[read-model-conflito\]\s*/,
      "",
    );
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3 py-4">
        <PlanningPhaseHeader
          taskInput={taskInput}
          operationalUx={operationalUx}
        />
        <p className="text-[11px] text-muted-foreground">
          {conflictHint ??
            "A preparar o plano operacional. Aguarde ou atualize a página."}
        </p>
      </section>
    );
  }

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-4 py-2"
      aria-label={phaseLabel}
    >
      <PlanningPhaseHeader
        taskInput={taskInput}
        operationalUx={operationalUx}
        planSection={
          <div className="space-y-4">
            <PlanStatusRail current={status} />

            {status === "generating_plan" ? (
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {statusLabel}
              </p>
            ) : null}

            {status === "plan_final_generated" ? (
              <CompleteBanner>
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Plano final gerado. A seguir, valide o plano na fase de Aprovação.
                </span>
              </CompleteBanner>
            ) : null}

            {plan?.hasContent ? (
              <OperationalPlanDocument plan={plan} detailed />
            ) : status !== "generating_plan" ? (
              <p className="text-[11px] text-muted-foreground">
                O plano ainda não tem conteúdo apresentável. A geração pode estar em
                curso.
              </p>
            ) : null}
          </div>
        }
      />
    </section>
  );
}

function CompleteBanner({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12px] leading-relaxed text-emerald-800/90 dark:text-emerald-200/90">
      {children}
    </p>
  );
}
