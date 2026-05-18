"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ConversationEntry,
  type ConversationEntryTone,
} from "@/components/features/conversation-stream";
import type { ExecutionStepSurfaceStatus } from "@/lib/runtime/execution/execution-timeline-card-types";
import type { OperationalStepStatus } from "@/lib/runtime/execution/operational-step-status";
import type { ExecutionStepId } from "@/lib/runtime/execution/execution-step-catalog";
import type { SemanticWorkflowPhaseId } from "@/lib/runtime/execution/semantic-workflow-phase-id";
import { getExecutionStepDefinition } from "@/lib/runtime/execution/execution-step-catalog";
import { executionStepIcon } from "@/lib/runtime/execution/execution-step-icons";
import type { ExecutionTimelineVisualTier } from "@/lib/runtime/execution/execution-timeline-visual-tier";
import { translateOperationalStepStatus } from "@/lib/runtime/translation/runtime-translation-layer";

export type { ExecutionStepSurfaceStatus } from "@/lib/runtime/execution/execution-timeline-card-types";

function resolveEntryTone(
  status: ExecutionStepSurfaceStatus,
  operationalStatus: OperationalStepStatus,
): ConversationEntryTone {
  if (status === "done") return "done";
  if (
    status === "blocked" &&
    (operationalStatus === "failed" || operationalStatus === "cancelled")
  ) {
    return "failed";
  }
  if (status === "blocked") return "blocked";
  if (
    status === "active" &&
    (operationalStatus === "waiting_input" ||
      operationalStatus === "waiting_user")
  ) {
    return "waiting";
  }
  if (status === "active") return "active";
  return "default";
}

export function ExecutionStepBlock({
  id,
  stepId,
  stepTitle,
  status,
  operationalStatus,
  visualTier,
  children,
  className,
  checkpointSeverity,
  expandable = false,
  defaultExpanded = true,
  summaryLine,
  timestamp,
  expandedSlot,
  persistentFooter,
  semanticPhaseId,
  copyText,
  hideStatus = false,
  highlighted = false,
}: {
  id: string;
  stepId: ExecutionStepId;
  stepTitle: string;
  status: ExecutionStepSurfaceStatus;
  operationalStatus: OperationalStepStatus;
  semanticPhaseId?: SemanticWorkflowPhaseId;
  visualTier: ExecutionTimelineVisualTier;
  children: ReactNode;
  className?: string;
  checkpointSeverity?: "info" | "success" | "warning" | "error" | null;
  expandable?: boolean;
  defaultExpanded?: boolean;
  summaryLine?: ReactNode;
  timestamp?: ReactNode;
  expandedSlot?: ReactNode;
  persistentFooter?: ReactNode;
  copyText?: string;
  hideStatus?: boolean;
  highlighted?: boolean;
}) {
  const def = getExecutionStepDefinition(stepId);
  const Icon = def ? executionStepIcon(def.icon) : null;
  const tone = resolveEntryTone(status, operationalStatus);

  return (
    <ConversationEntry
      id={id}
      anchorId={id}
      title={stepTitle}
      leading={
        Icon ? (
          <Icon
            className={cn(
              "size-4 shrink-0",
              visualTier === "system" && "size-3.5 opacity-75",
            )}
            aria-hidden
          />
        ) : null
      }
      status={
        hideStatus ? undefined : (
          <StepHint
            status={status}
            operationalStatus={operationalStatus}
            semanticPhaseId={semanticPhaseId}
            checkpointSeverity={checkpointSeverity}
          />
        )
      }
      metadata={persistentFooter}
      summaryLine={summaryLine}
      timestamp={timestamp}
      expandable={expandable}
      defaultExpanded={defaultExpanded}
      expandedContent={expandedSlot}
      copyText={copyText}
      tone={tone}
      highlighted={highlighted}
      className={className}
    >
      {children}
    </ConversationEntry>
  );
}

function StepHint({
  status,
  operationalStatus,
  semanticPhaseId,
  checkpointSeverity,
}: {
  status: ExecutionStepSurfaceStatus;
  operationalStatus: OperationalStepStatus;
  semanticPhaseId?: SemanticWorkflowPhaseId;
  checkpointSeverity?: "info" | "success" | "warning" | "error" | null;
}) {
  const phaseLabel =
    semanticPhaseId === "refined_plan"
      ? "Plano refinado"
      : semanticPhaseId === "clarification_spec"
        ? "Clarificação"
        : semanticPhaseId === "strategy"
          ? "Estratégia"
          : semanticPhaseId === "execution"
            ? "Execução"
            : undefined;

  let label = translateOperationalStepStatus(operationalStatus, {
    semanticPhaseLabel: phaseLabel,
  }).badge;

  if (status === "done") label = "Concluído";
  if (
    status === "blocked" &&
    operationalStatus !== "failed" &&
    operationalStatus !== "cancelled"
  )
    label = translateOperationalStepStatus("blocked").badge;
  if (
    semanticPhaseId === "strategy" &&
    (operationalStatus === "waiting_user" || operationalStatus === "waiting_input")
  ) {
    label = "AGUARDA SI";
  } else if (
    status === "pending" &&
    operationalStatus !== "waiting_user" &&
    operationalStatus !== "waiting_input"
  ) {
    label = "Pendente";
  }
  if (
    semanticPhaseId === "refined_plan" &&
    operationalStatus === "blocked" &&
    status === "blocked"
  ) {
    label = "Revisão necessária";
  }
  if (status === "active" && checkpointSeverity === "warning") label = "Atenção";
  if (status === "active" && checkpointSeverity === "error") label = "Erro";
  if (operationalStatus === "failed" && status === "blocked") label = "Falhou";
  if (operationalStatus === "cancelled" && status === "blocked")
    label = "Cancelado";

  const cls = "cs-fg";

  const pulseDot =
    (operationalStatus === "running" || operationalStatus === "active") &&
    status === "active" ? (
      <span
        className="size-1.5 shrink-0 rounded-full bg-sky-500/85"
        aria-hidden
      />
    ) : (operationalStatus === "waiting_input" ||
        operationalStatus === "waiting_user") &&
      status === "active" ? (
      <span className="size-1.5 shrink-0 rounded-full bg-amber-500/90" />
    ) : null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {pulseDot}
      <span
        className={cn("cs-text-caption font-medium uppercase tracking-wide", cls)}
      >
        {label}
      </span>
    </span>
  );
}
