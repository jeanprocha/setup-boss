"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { ClarificationBundleDto } from "@/lib/runtime/clarification/clarification-types";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { CreateRunResultDto } from "@/lib/runtime/intake/intake-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { deriveOperationalPhaseStackEntries } from "@/lib/runtime/operational/operational-phase-stack";
import { shouldShowApprovalPhasePanel } from "@/lib/runtime/operational/approval-operational-state";
import { shouldShowExecutionPhasePanel } from "@/lib/runtime/operational/execution-operational-state";
import { shouldShowReviewPhasePanel } from "@/lib/runtime/operational/review-operational-state";
import { shouldShowFinalizationPhasePanel } from "@/lib/runtime/operational/finalization-operational-state";
import { shouldShowVersioningPhasePanel } from "@/lib/runtime/operational/versioning-operational-state";
import { InitializationPhasePanel } from "@/components/features/initialization/InitializationPhasePanel";
import { PlanningPhasePanel } from "@/components/features/planning/PlanningPhasePanel";
import { ApprovalPhasePanel } from "@/components/features/planning/ApprovalPhasePanel";
import { VersioningPhasePanel } from "@/components/features/planning/VersioningPhasePanel";
import { ExecutionPhasePanel } from "@/components/features/planning/ExecutionPhasePanel";
import { ReviewPhasePanel } from "@/components/features/planning/ReviewPhasePanel";
import { FinalizationPhasePanel } from "@/components/features/planning/FinalizationPhasePanel";
import { OperationalPhaseSection } from "@/components/features/run-detail/OperationalPhaseSection";
import type {
  OperationalReviewHitlDto,
} from "@/lib/runtime/operational/operational-review-types";
import type { ExecutionLifecyclePhase } from "@/lib/runtime/execution/execution-types";
import { useI18n } from "@/lib/i18n/use-i18n";

export function OperationalPhaseStack({
  projectId,
  runId,
  summary,
  operationalUx,
  submissionBusy,
  createResult,
  operationalPanelInput,
  reviewHitl,
  finalizationHitl,
  executionLifecyclePhase,
  workspaceExecutionPanel,
}: {
  projectId: string | null;
  runId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
  submissionBusy?: boolean;
  createResult?: CreateRunResultDto | null;
  operationalPanelInput: {
    executionApplies: boolean;
    isInitializationPhase: boolean;
    clarificationApplies: boolean;
    bundle: ClarificationBundleDto | null | undefined;
    operationalUx: RunOperationalUxContract;
  };
  reviewHitl: OperationalReviewHitlDto | null | undefined;
  finalizationHitl: OperationalReviewHitlDto | null | undefined;
  executionLifecyclePhase: ExecutionLifecyclePhase | null;
  /** Substitui o painel de execução single-repo quando o workspace está operacional. */
  workspaceExecutionPanel?: ReactNode | null;
}) {
  const { t } = useI18n();
  const entries = useMemo(
    () => deriveOperationalPhaseStackEntries(operationalUx),
    [operationalUx],
  );

  const activeSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [operationalUx.uxPhase]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 py-2">
      {entries.map((entry) => {
        let panel: ReactNode = null;

        switch (entry.phase) {
          case "initialization":
            panel = (
              <InitializationPhasePanel
                projectId={projectId}
                runId={runId}
                operationalUx={operationalUx}
                composeOnly={false}
                createResult={createResult}
                submissionBusy={submissionBusy}
              />
            );
            break;
          case "planning":
            panel = (
              <PlanningPhasePanel
                projectId={projectId}
                summary={summary}
                operationalUx={operationalUx}
                executionApplies={operationalPanelInput.executionApplies}
                isInitializationPhase={
                  operationalPanelInput.isInitializationPhase
                }
                stackMode={entry.mode}
              />
            );
            break;
          case "approval":
            if (
              shouldShowApprovalPhasePanel(operationalPanelInput) ||
              entry.mode === "history"
            ) {
              panel = (
                <ApprovalPhasePanel
                  projectId={projectId}
                  summary={summary}
                  operationalUx={operationalUx}
                  phasePresentation="stack"
                />
              );
            }
            break;
          case "versioning":
            if (
              shouldShowVersioningPhasePanel({
                ...operationalPanelInput,
                summary,
              }) ||
              entry.mode === "history"
            ) {
              panel = (
                <VersioningPhasePanel
                  projectId={projectId}
                  summary={summary}
                  operationalUx={operationalUx}
                />
              );
            }
            break;
          case "execution":
            if (workspaceExecutionPanel && entry.mode === "active") {
              panel = workspaceExecutionPanel;
            } else if (
              shouldShowExecutionPhasePanel({
                isInitializationPhase:
                  operationalPanelInput.isInitializationPhase,
                bundle: operationalPanelInput.bundle,
                summary,
                executionLifecyclePhase,
                reviewHitl,
              }) ||
              entry.mode === "history"
            ) {
              panel = (
                <ExecutionPhasePanel
                  projectId={projectId}
                  summary={summary}
                  operationalUx={operationalUx}
                />
              );
            }
            break;
          case "review":
            if (
              shouldShowReviewPhasePanel({
                isInitializationPhase:
                  operationalPanelInput.isInitializationPhase,
                bundle: operationalPanelInput.bundle,
                summary,
                executionLifecyclePhase,
                hitl: reviewHitl,
              }) ||
              entry.mode === "history"
            ) {
              panel = (
                <ReviewPhasePanel
                  projectId={projectId}
                  summary={summary}
                  operationalUx={operationalUx}
                />
              );
            }
            break;
          case "finalization":
            if (
              shouldShowFinalizationPhasePanel({
                isInitializationPhase:
                  operationalPanelInput.isInitializationPhase,
                bundle: operationalPanelInput.bundle,
                summary,
                executionLifecyclePhase,
                reviewHitl,
                finalizationHitl,
              }) ||
              entry.mode === "history"
            ) {
              panel = (
                <FinalizationPhasePanel
                  projectId={projectId}
                  summary={summary}
                  operationalUx={operationalUx}
                />
              );
            }
            break;
          default:
            break;
        }

        if (!panel) return null;

        return (
          <div
            key={entry.phase}
            ref={entry.mode === "active" ? activeSectionRef : undefined}
          >
            <OperationalPhaseSection phaseTitle={entry.title} mode={entry.mode}>
              {panel}
            </OperationalPhaseSection>
          </div>
        );
      })}
      {workspaceExecutionPanel &&
      !entries.some((e) => e.phase === "execution" && e.mode === "active") ? (
        <OperationalPhaseSection
          phaseTitle={t("workspaceRun.executionPhaseTitle")}
          mode="active"
        >
          {workspaceExecutionPanel}
        </OperationalPhaseSection>
      ) : null}
    </div>
  );
}
