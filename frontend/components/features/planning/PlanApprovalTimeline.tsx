"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";
import { isSupersededPlanVersion } from "@/lib/runtime/operational/plan-active-version";
import {
  labelPlanApprovalTimelineBlock,
  type PlanCommentThreadState,
} from "@/lib/runtime/operational/plan-approval-timeline-types";
import { OperationalPlanDocument } from "@/components/features/planning/OperationalPlanDocument";
import { PlanCommentInput } from "@/components/features/planning/PlanCommentInput";
import { PlanUserCommentBlock } from "@/components/features/planning/PlanUserCommentBlock";
import {
  PlanCommentAnalysisBlock,
  PlanCommentAnalysisProcessing,
} from "@/components/features/planning/PlanCommentAnalysisBlock";
import { PlanAssistantResponseBlock } from "@/components/features/planning/PlanAssistantResponseBlock";
import { PlanAdditionalQuestionsForm } from "@/components/features/planning/PlanAdditionalQuestionsForm";
import { PlanAdditionalAnswersBlock } from "@/components/features/planning/PlanAdditionalAnswersBlock";
import { PlanTimelineStatus } from "@/components/features/planning/PlanTimelineStatus";
import type { ExecutionLevelId } from "@/lib/runtime/operational/operational-plan-execution-level";

function PlanCommentThreadItems({
  thread,
  activePlanVersion,
  submittingAnswers,
  onSubmitAdditionalAnswers,
  planFooter,
  commentInputOpen,
  commentDraft,
  onCommentDraftChange,
  onCommentSubmit,
  onCommentCancel,
  commentSubmitting,
  executionLevel,
  onExecutionLevelChange,
  executionSelectDisabled,
}: {
  thread: PlanCommentThreadState;
  activePlanVersion: number;
  submittingAnswers: boolean;
  onSubmitAdditionalAnswers: (
    commentId: string,
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
  planFooter: ReactNode;
  commentInputOpen: boolean;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: () => void;
  onCommentCancel: () => void;
  commentSubmitting?: boolean;
  executionLevel: ExecutionLevelId;
  onExecutionLevelChange: (level: ExecutionLevelId) => void;
  executionSelectDisabled?: boolean;
}) {
  const { comment, analysisStatus, analysis, analysisError } = thread;
  const processingId = `processing-${comment.id}`;
  const analysisId = `analysis-${comment.id}`;
  const responseId = `response-${comment.id}`;
  const questionsId = `questions-${comment.id}`;
  const answersId = `answers-${comment.id}`;
  const updatedPlanId = `updated-plan-${comment.id}`;
  const generatingPlanId = `generating-plan-${comment.id}`;

  const showQuestionsForm =
    analysisStatus === "done" &&
    analysis?.requiresQuestions &&
    thread.additionalQuestions &&
    !thread.additionalAnswers &&
    !submittingAnswers;

  const updatedPlan = thread.updatedPlan;
  const updatedIsActive =
    updatedPlan != null && updatedPlan.planVersion === activePlanVersion;
  const updatedHistorical =
    updatedPlan != null &&
    isSupersededPlanVersion(updatedPlan.planVersion, activePlanVersion);

  const showGeneratingPlan =
    thread.updatedPlanStatus === "generating" ||
    (analysisStatus === "done" &&
      analysis?.requiresNewPlan &&
      !analysis.requiresQuestions &&
      !updatedPlan &&
      thread.updatedPlanStatus !== "error");

  return (
    <Fragment>
      <li className="plan-approval-timeline__item">
        <PlanUserCommentBlock text={comment.text} blockId={comment.id} />
      </li>

      {analysisStatus === "processing" ? (
        <li className="plan-approval-timeline__item">
          <PlanCommentAnalysisProcessing blockId={processingId} />
        </li>
      ) : null}

      {analysisStatus === "done" && analysis ? (
        <>
          <li className="plan-approval-timeline__item">
            <PlanCommentAnalysisBlock
              analysis={analysis}
              blockId={analysisId}
            />
          </li>
          <li className="plan-approval-timeline__item">
            <PlanAssistantResponseBlock
              blockId={responseId}
              text={analysis.assistantResponse}
            />
          </li>
        </>
      ) : null}

      {showQuestionsForm ? (
        <li className="plan-approval-timeline__item">
          <PlanAdditionalQuestionsForm
            blockId={questionsId}
            questions={thread.additionalQuestions!.questions}
            submitting={submittingAnswers}
            onSubmit={(answers) =>
              onSubmitAdditionalAnswers(comment.id, answers)
            }
          />
        </li>
      ) : null}

      {thread.additionalAnswers ? (
        <li className="plan-approval-timeline__item">
          <PlanAdditionalAnswersBlock
            blockId={answersId}
            answers={thread.additionalAnswers.answers}
          />
        </li>
      ) : null}

      {showGeneratingPlan ? (
        <li className="plan-approval-timeline__item">
          <PlanTimelineStatus blockId={generatingPlanId}>
            A gerar plano atualizado…
          </PlanTimelineStatus>
        </li>
      ) : null}

      {updatedPlan ? (
        <li
          className={`plan-approval-timeline__item plan-approval-timeline__item--plan ${
            updatedIsActive
              ? "plan-approval-timeline__item--plan-active"
              : "plan-approval-timeline__item--plan-historical"
          }`}
        >
          <div id={`plan-timeline-block-${updatedPlanId}`}>
            <OperationalPlanDocument
              plan={updatedPlan.presentation}
              detailed
              appearance="minimal"
              title={labelPlanApprovalTimelineBlock("updated_plan")}
              active={updatedIsActive}
              compact={updatedHistorical}
              historical={updatedHistorical}
              supersededLabel={
                updatedHistorical
                  ? "Substituído por plano atualizado"
                  : undefined
              }
              executionLevel={executionLevel}
              onExecutionLevelChange={onExecutionLevelChange}
              executionSelectDisabled={
                executionSelectDisabled || updatedHistorical
              }
              footer={updatedIsActive ? planFooter : undefined}
            />
            {updatedIsActive && commentInputOpen ? (
              <PlanCommentInput
                value={commentDraft}
                onChange={onCommentDraftChange}
                onSubmit={onCommentSubmit}
                onCancel={onCommentCancel}
                disabled={commentSubmitting}
                autoFocus
              />
            ) : null}
          </div>
        </li>
      ) : null}

      {analysisStatus === "error" && analysisError ? (
        <li className="plan-approval-timeline__item">
          <PlanTimelineStatus variant="error">
            {friendlyErrorMessage(analysisError)}
          </PlanTimelineStatus>
        </li>
      ) : null}

      {thread.additionalAnswersError ? (
        <li className="plan-approval-timeline__item">
          <PlanTimelineStatus variant="error">
            {friendlyErrorMessage(thread.additionalAnswersError)}
          </PlanTimelineStatus>
        </li>
      ) : null}
    </Fragment>
  );
}

function friendlyErrorMessage(raw: string): string {
  const t = raw.trim();
  if (!t) return "Não foi possível concluir esta etapa. Tente novamente.";
  if (/fetch|network|timeout|ECONNREFUSED/i.test(t)) {
    return "Ligação ao runtime indisponível. Verifique o serviço e tente de novo.";
  }
  if (/json|parse|invalid/i.test(t)) return "Resposta inválida do servidor. Tente novamente.";
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

export function PlanApprovalTimeline({
  basePlan,
  activePlanVersion,
  threads,
  planFooter,
  commentInputOpen,
  commentDraft,
  onCommentDraftChange,
  onCommentSubmit,
  onCommentCancel,
  commentSubmitting,
  executionLevel,
  onExecutionLevelChange,
  executionSelectDisabled,
  scrollToBlockId,
  submittingAnswersFor,
  onSubmitAdditionalAnswers,
}: {
  basePlan: OperationalPlanPresentation;
  activePlanVersion: number;
  threads: PlanCommentThreadState[];
  planFooter: ReactNode;
  commentInputOpen: boolean;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: () => void;
  onCommentCancel: () => void;
  commentSubmitting?: boolean;
  executionLevel: ExecutionLevelId;
  onExecutionLevelChange: (level: ExecutionLevelId) => void;
  executionSelectDisabled?: boolean;
  scrollToBlockId: string | null;
  submittingAnswersFor: string | null;
  onSubmitAdditionalAnswers: (
    commentId: string,
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => void;
}) {
  const v1Historical = isSupersededPlanVersion(1, activePlanVersion);
  const activeIsInitial = activePlanVersion === 1;

  useEffect(() => {
    if (!scrollToBlockId) return;
    const el = document.getElementById(
      `plan-timeline-block-${scrollToBlockId}`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [scrollToBlockId]);

  return (
    <ol
      className="plan-approval-timeline"
      aria-label="Histórico do plano e comentários"
    >
      <li
        className={`plan-approval-timeline__item plan-approval-timeline__item--plan ${
          activeIsInitial
            ? "plan-approval-timeline__item--plan-active"
            : "plan-approval-timeline__item--plan-historical"
        }`}
      >
        <OperationalPlanDocument
          plan={basePlan}
          detailed
          appearance="minimal"
          active={activeIsInitial}
          compact={v1Historical}
          historical={v1Historical}
          supersededLabel={
            v1Historical ? "Substituído por plano atualizado" : undefined
          }
          executionLevel={executionLevel}
          onExecutionLevelChange={onExecutionLevelChange}
          executionSelectDisabled={executionSelectDisabled || v1Historical}
          footer={activeIsInitial ? planFooter : undefined}
        />
        {activeIsInitial && commentInputOpen ? (
          <PlanCommentInput
            value={commentDraft}
            onChange={onCommentDraftChange}
            onSubmit={onCommentSubmit}
            onCancel={onCommentCancel}
            disabled={commentSubmitting}
            autoFocus
          />
        ) : null}
      </li>

      {threads.map((thread) => (
        <PlanCommentThreadItems
          key={thread.comment.id}
          thread={thread}
          activePlanVersion={activePlanVersion}
          submittingAnswers={submittingAnswersFor === thread.comment.id}
          onSubmitAdditionalAnswers={onSubmitAdditionalAnswers}
          planFooter={planFooter}
          commentInputOpen={commentInputOpen}
          commentDraft={commentDraft}
          onCommentDraftChange={onCommentDraftChange}
          onCommentSubmit={onCommentSubmit}
          onCommentCancel={onCommentCancel}
          commentSubmitting={commentSubmitting}
          executionLevel={executionLevel}
          onExecutionLevelChange={onExecutionLevelChange}
          executionSelectDisabled={executionSelectDisabled}
        />
      ))}
    </ol>
  );
}
