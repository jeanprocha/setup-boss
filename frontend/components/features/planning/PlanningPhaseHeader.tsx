"use client";

import type { ReactNode } from "react";
import { ActivityTaskInputBody } from "@/components/features/planning/ActivityTaskInputBlock";
import { InitializationSetupMilestones } from "@/components/features/planning/InitializationSetupMilestones";
import { OperationalStepOneMainTitle } from "@/components/features/operational/OperationalStepOneMainTitle";
import { OperationalStepOneSectionHeading } from "@/components/features/operational/OperationalStepOneSectionHeading";
import { OPERATIONAL_STEP_ONE_SUBTITLE } from "@/lib/runtime/operational/operational-step-one-ui";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { cn } from "@/lib/utils";

export function PlanningPhaseHeader({
  taskInput,
  operationalUx,
  subtitle = OPERATIONAL_STEP_ONE_SUBTITLE.definingPlan,
  planSection,
  className,
}: {
  taskInput?: string | null;
  operationalUx?: RunOperationalUxContract;
  subtitle?: string;
  planSection?: ReactNode;
  className?: string;
}) {
  const showDescription =
    Boolean(taskInput?.trim()) || Boolean(operationalUx);

  return (
    <header className={cn("space-y-5 pb-1", className)}>
      <OperationalStepOneMainTitle />
      <div className="space-y-5">
        {showDescription ? (
          <section className="space-y-3" aria-label="Descrição da atividade">
            <OperationalStepOneSectionHeading>
              Descrição da atividade
            </OperationalStepOneSectionHeading>
            {taskInput?.trim() ? (
              <ActivityTaskInputBody text={taskInput} />
            ) : null}
            {operationalUx ? (
              <InitializationSetupMilestones operationalUx={operationalUx} />
            ) : null}
          </section>
        ) : null}
        <section className="space-y-3" aria-label={subtitle}>
          <OperationalStepOneSectionHeading>{subtitle}</OperationalStepOneSectionHeading>
          {planSection}
        </section>
      </div>
    </header>
  );
}
