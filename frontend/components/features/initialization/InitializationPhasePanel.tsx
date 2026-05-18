"use client";

import { useMemo, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Ban,
  AlertCircle,
} from "lucide-react";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  deriveInitializationOperationalStatus,
  labelInitializationOperationalStatus,
  type InitializationOperationalStatus,
} from "@/lib/runtime/operational/initialization-operational-state";
import { operationalPhaseLabelForUi } from "@/lib/runtime/operational/operational-ux-selectors";
import { OperationalStepOneHeader } from "@/components/features/operational/OperationalStepOneHeader";
import { operationalStepOneSubtitleForPhase } from "@/lib/runtime/operational/operational-step-one-ui";
import { TaskComposer } from "@/components/features/intake/TaskComposer";
import { TaskSubmissionCard } from "@/components/features/intake/TaskSubmissionCard";
import { GovernanceStatusCard } from "@/components/features/governance/GovernanceStatusCard";
import { InitialSpecBlock } from "@/components/features/initialization/InitialSpecBlock";
import { useProjectGovernance } from "@/hooks/use-project-governance";
import { useProjectRegistry } from "@/hooks/use-project-registry";
import { composeAwaitingInitialSubmit } from "@/lib/runtime/intake/compose-governance-gate";
import { useIntakeStore } from "@/stores/intake-store";
import type { CreateRunResultDto } from "@/lib/runtime/intake/intake-types";
import { cn } from "@/lib/utils";

/** Checklist visível só após o submit inicial. */
const POST_SUBMIT_FLOW_STEPS: InitializationOperationalStatus[] = [
  "validating_ia",
  "loading_context",
  "ia_found",
  "generating_spec",
  "spec_ready",
];

function StepIcon({
  current,
  passed,
}: {
  current: boolean;
  passed: boolean;
}) {
  if (current) {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  if (passed) {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

function InitializationStepRail({
  current,
}: {
  current: InitializationOperationalStatus;
}) {
  const currentIdx = POST_SUBMIT_FLOW_STEPS.indexOf(current);

  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {POST_SUBMIT_FLOW_STEPS.map((stepId, idx) => {
        const passed = currentIdx > idx || current === "spec_ready";
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
            <span>{labelInitializationOperationalStatus(stepId)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function InitializationPhasePanel({
  projectId,
  runId,
  operationalUx,
  composeOnly,
  createResult,
  submissionBusy = false,
}: {
  projectId: string | null;
  runId: string | null;
  operationalUx: RunOperationalUxContract;
  composeOnly: boolean;
  createResult?: CreateRunResultDto | null;
  submissionBusy?: boolean;
}) {
  const registry = useProjectRegistry();
  const intakeUiPhase = useIntakeStore((s) => s.uiPhase);
  const preSubmitCompose = composeAwaitingInitialSubmit(composeOnly, intakeUiPhase);
  const governanceQ = useProjectGovernance(
    composeOnly &&
      !preSubmitCompose &&
      projectId &&
      registry.projectValid
      ? projectId
      : null,
  );

  const status = useMemo(
    () =>
      deriveInitializationOperationalStatus({
        contract: operationalUx,
        composeOnly,
        preSubmitCompose,
        governanceLoading: governanceQ.isLoading || governanceQ.isFetching,
        submissionBusy,
      }),
    [
      operationalUx,
      composeOnly,
      preSubmitCompose,
      governanceQ.isLoading,
      governanceQ.isFetching,
      submissionBusy,
    ],
  );

  const phaseLabel = operationalPhaseLabelForUi(operationalUx);
  const statusLabel = preSubmitCompose
    ? "Descreva a atividade"
    : labelInitializationOperationalStatus(status);
  const iaBlocked = status === "ia_missing";

  const showComposer =
    composeOnly &&
    !iaBlocked &&
    status !== "spec_ready" &&
    !submissionBusy;

  const showSpec = status === "spec_ready" && Boolean(runId);

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-4 py-2"
      aria-label={phaseLabel}
    >
      <OperationalStepOneHeader
        subtitle={operationalStepOneSubtitleForPhase(operationalUx.uxPhase, {
          preSubmitCompose,
        })}
        hideSectionHeading={preSubmitCompose}
        attentionMessage={iaBlocked ? statusLabel : null}
      >
        {!preSubmitCompose && !iaBlocked ? (
          <InitializationStepRail current={status} />
        ) : null}
      </OperationalStepOneHeader>

      {!preSubmitCompose && iaBlocked ? (
        <p className="flex items-center gap-2 text-[11px] text-destructive/90">
          <Ban className="size-3.5" />
          {statusLabel}
        </p>
      ) : null}

      {iaBlocked && projectId ? (
        <InitPanelShell variant="blocked">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-foreground">
                Contexto IA não encontrado
              </p>
              <p className="text-[11px] text-muted-foreground">
                Configure a pasta <span className="font-mono">.IA</span> no projeto
                antes de iniciar uma atividade.
              </p>
              <GovernanceStatusCard projectId={projectId} compact />
            </div>
          </div>
        </InitPanelShell>
      ) : null}

      {showComposer && projectId ? (
        <div className="space-y-4">
          <TaskComposer projectId={projectId} embedded operationalMode />
          {createResult ? <TaskSubmissionCard result={createResult} /> : null}
        </div>
      ) : null}

      {!composeOnly && submissionBusy ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          A processar pedido e preparar contexto…
        </p>
      ) : null}

      {!composeOnly && status === "generating_spec" ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          A gerar SPEC inicial a partir da atividade…
        </p>
      ) : null}

      {showSpec ? (
        <InitialSpecBlock projectId={projectId} runId={runId} />
      ) : null}
    </section>
  );
}

function InitPanelShell({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "blocked";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 shadow-sm",
        variant === "blocked"
          ? "border-destructive/35 bg-destructive/5"
          : "border-border/70 bg-card/80",
      )}
    >
      {children}
    </div>
  );
}
