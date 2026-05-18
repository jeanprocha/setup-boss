"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Check,
  CheckCircle2,
  Circle,
  Loader2,
  MessageSquarePlus,
} from "lucide-react";

import type { RunSummaryDto } from "@/lib/api/runtime-types";

import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";

import {
  approvalOperationalStatusRail,
  deriveApprovalOperationalStatus,
  deriveOperationalApprovalActions,
  labelApprovalOperationalStatus,
  type ApprovalOperationalStatus,
} from "@/lib/runtime/operational/approval-operational-state";

import { translateOperationalPlan } from "@/lib/runtime/operational/translate-operational-plan";
import { persistPlanPresentationBaseSnapshot } from "@/lib/runtime/operational/plan-presentation-base-actions";
import type { OperationalPlanPresentation } from "@/lib/runtime/operational/operational-plan-types";

import type { ExecutionLevelId } from "@/lib/runtime/operational/operational-plan-execution-level";

import { modeFromExecutionLevel } from "@/lib/runtime/operational/operational-plan-execution-level";

import { operationalPhaseLabelForUi } from "@/lib/runtime/operational/operational-ux-selectors";

import { PlanApprovalTimeline } from "@/components/features/planning/PlanApprovalTimeline";

import { useClarification } from "@/hooks/use-clarification";

import { useClarificationMutations } from "@/hooks/use-clarification-mutations";

import { usePlanApprovalTimeline } from "@/hooks/use-plan-approval-timeline";
import {
  resolveScrollAfterCommentAnalysis,
  resolveScrollAfterUpdatedPlan,
} from "@/lib/runtime/operational/plan-timeline-scroll";

import { useStrategy } from "@/hooks/use-strategy";

import { LoadingState } from "@/components/primitives/LoadingState";

import { Button } from "@/components/ui/button";

import { OperationalStepOneHeader } from "@/components/features/operational/OperationalStepOneHeader";

import { OperationalStepOneSectionHeading } from "@/components/features/operational/OperationalStepOneSectionHeading";

import { OPERATIONAL_STEP_ONE_SUBTITLE } from "@/lib/runtime/operational/operational-step-one-ui";

import { cn } from "@/lib/utils";

function StepIcon({
  current,

  passed,

  attention,
}: {
  current: boolean;

  passed: boolean;

  attention?: boolean;
}) {
  if (passed) {
    return (
      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
    );
  }

  if (current) {
    return (
      <Loader2
        className={cn(
          "size-3.5 animate-spin",

          attention ? "text-amber-700 dark:text-amber-300" : "text-primary",
        )}
      />
    );
  }

  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

function ApprovalStatusRail({
  current,
}: {
  current: ApprovalOperationalStatus;
}) {
  const steps = approvalOperationalStatusRail(current);

  const idx = steps.indexOf(current);

  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {steps.map((stepId, stepIdx) => {
        const passed = idx > stepIdx || current === "approved";

        const isCurrent = stepId === current;

        const needsAttention = isCurrent && stepId === "awaiting_decision";

        return (
          <li
            key={stepId}
            className={cn(
              "flex items-center gap-2 text-[11px] font-mono",

              needsAttention &&
                "font-medium text-amber-800 dark:text-amber-200",

              isCurrent && !needsAttention && "font-medium text-foreground",

              !isCurrent && !needsAttention && "text-muted-foreground",

              passed && !isCurrent && "text-foreground/75",
            )}
          >
            <StepIcon
              current={isCurrent}
              passed={passed}
              attention={needsAttention}
            />

            <span>{labelApprovalOperationalStatus(stepId)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ApprovalPlanSection({
  status,

  plan,

  actions,

  pending,

  confirmApprove,

  setConfirmApprove,

  actionError,

  mutations,

  approve,

  executionLevel,

  onExecutionLevelChange,

  threads,

  activePlanVersion,

  submittingAnswersFor,

  onSubmitAdditionalAnswers,

  commentInputOpen,

  commentSubmitting,

  onOpenCommentInput,

  onCloseCommentInput,

  commentDraft,

  onCommentDraftChange,

  onCommentSubmit,

  scrollToBlockId,
}: {
  status: ApprovalOperationalStatus;

  plan: NonNullable<ReturnType<typeof translateOperationalPlan>>;

  actions: ReturnType<typeof deriveOperationalApprovalActions>;

  pending: boolean;

  confirmApprove: boolean;

  setConfirmApprove: (v: boolean) => void;

  actionError: string | null;

  mutations: ReturnType<typeof useClarificationMutations>;

  approve: () => void;

  executionLevel: ExecutionLevelId;

  onExecutionLevelChange: (level: ExecutionLevelId) => void;

  threads: ReturnType<typeof usePlanApprovalTimeline>["threads"];

  activePlanVersion: number;

  submittingAnswersFor: string | null;

  onSubmitAdditionalAnswers: ReturnType<
    typeof usePlanApprovalTimeline
  >["submitAdditionalAnswers"];

  commentInputOpen: boolean;

  commentSubmitting: boolean;

  onOpenCommentInput: () => void;

  onCloseCommentInput: () => void;

  commentDraft: string;

  onCommentDraftChange: (v: string) => void;

  onCommentSubmit: () => void;

  scrollToBlockId: string | null;
}) {
  return (
    <div className="space-y-4">
      <ApprovalStatusRail current={status} />

      <p className="text-[12px] leading-relaxed text-muted-foreground/80">
        Revise o plano operacional completo. A execução só avança depois da sua
        aprovação explícita.
      </p>

      <PlanApprovalTimeline
        basePlan={plan}
        activePlanVersion={activePlanVersion}
        threads={threads}
        submittingAnswersFor={submittingAnswersFor}
        onSubmitAdditionalAnswers={onSubmitAdditionalAnswers}
        commentSubmitting={commentSubmitting}
        executionLevel={executionLevel}
        onExecutionLevelChange={onExecutionLevelChange}
        executionSelectDisabled={pending}
        commentInputOpen={commentInputOpen}
        commentDraft={commentDraft}
        onCommentDraftChange={onCommentDraftChange}
        onCommentSubmit={onCommentSubmit}
        onCommentCancel={onCloseCommentInput}
        scrollToBlockId={scrollToBlockId}
        planFooter={
          <PlanDocumentFooter
            confirmApprove={confirmApprove}
            setConfirmApprove={setConfirmApprove}
            actions={actions}
            pending={pending}
            mutations={mutations}
            approve={approve}
            onOpenCommentInput={onOpenCommentInput}
            commentInputOpen={commentInputOpen}
            commentSubmitting={commentSubmitting}
            actionError={actionError}
          />
        }
      />
    </div>
  );
}

function PlanDocumentFooter({
  confirmApprove,

  setConfirmApprove,

  actions,

  pending,

  mutations,

  approve,

  onOpenCommentInput,

  commentInputOpen,

  commentSubmitting,

  actionError,
}: {
  confirmApprove: boolean;

  setConfirmApprove: (v: boolean) => void;

  actions: ReturnType<typeof deriveOperationalApprovalActions>;

  pending: boolean;

  mutations: ReturnType<typeof useClarificationMutations>;

  approve: () => void;

  onOpenCommentInput: () => void;

  commentInputOpen: boolean;

  commentSubmitting: boolean;

  actionError: string | null;
}) {
  return (
    <div className="space-y-3">
      {confirmApprove ? (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[13px] text-foreground/80">
          <span>Confirma a aprovação do plano?</span>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[12px] font-normal shadow-none"
              disabled={pending || !actions.canApprove}
              onClick={approve}
            >
              {mutations.approve.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Confirmar aprovação
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-[12px] font-normal text-muted-foreground"
              disabled={pending}
              onClick={() => setConfirmApprove(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-3 text-[12px] font-normal text-muted-foreground sm:order-1"
            disabled={
              pending ||
              commentSubmitting ||
              !actions.canAddPlanComment ||
              commentInputOpen
            }
            onClick={onOpenCommentInput}
          >
            <MessageSquarePlus className="size-3.5" />
            Adicionar comentário
          </Button>

          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 self-end px-4 text-[12px] font-normal shadow-none sm:order-2 sm:ml-auto"
            disabled={pending || !actions.canApprove}
            onClick={() => setConfirmApprove(true)}
          >
            <Check className="size-3.5" />
            Aprovar plano
          </Button>
        </div>
      )}

      {actions.blockedReason && !pending ? (
        <p className="text-[12px] text-muted-foreground/80">
          {actions.blockedReason}
        </p>
      ) : null}

      {actionError ? (
        <p className="text-[12px] text-destructive">{actionError}</p>
      ) : null}
    </div>
  );
}

export function ApprovalPhasePanel({
  projectId,

  summary,

  operationalUx,

  phasePresentation = "standalone",
}: {
  projectId: string | null;

  summary: RunSummaryDto;

  operationalUx: RunOperationalUxContract;

  phasePresentation?: "standalone" | "stack";
}) {
  const runKey = summary.runId ?? summary.id;

  const clarification = useClarification(runKey, summary.phase, summary.state);

  const strategy = useStrategy(runKey, summary.phase, summary.state);

  const mutations = useClarificationMutations({
    runKey,

    jobId: summary.id,

    runId: summary.runId,

    projectId,

    refinementAvailable: clarification.bundle?.refinement.available,
  });

  const [confirmApprove, setConfirmApprove] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const [executionLevel, setExecutionLevel] =
    useState<ExecutionLevelId>("normal");

  const [commentInputOpen, setCommentInputOpen] = useState(false);

  const [commentDraft, setCommentDraft] = useState("");

  const [scrollToBlockId, setScrollToBlockId] = useState<string | null>(null);

  const [pendingScrollCommentId, setPendingScrollCommentId] = useState<
    string | null
  >(null);

  const bundle = clarification.bundle;

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

  const planExcerpt = useMemo(
    () => (plan?.hasContent ? buildPlanExcerptForAnalysis(plan) : ""),
    [plan],
  );

  const {
    threads,
    addComment,
    processingCommentId,
    submittingAnswersFor,
    submitAdditionalAnswers,
    activePlanEntry,
  } = usePlanApprovalTimeline(runKey, planExcerpt, plan);

  const activePlanVersion = activePlanEntry?.planVersion ?? 1;

  const planBaseFingerprint = useMemo(() => {
    if (!plan?.hasContent) return null;
    return JSON.stringify({
      objective: plan.understanding.mainObjective,
      done: plan.whatWillBeDone,
      outOfScope: plan.outOfScope,
      complexity: plan.complexity?.level,
      criteria: plan.completionCriteria,
    });
  }, [plan]);

  useEffect(() => {
    if (!runKey || !plan?.hasContent || activePlanVersion !== 1 || !planBaseFingerprint) {
      return;
    }
    void persistPlanPresentationBaseSnapshot(runKey, plan);
  }, [runKey, plan, activePlanVersion, planBaseFingerprint]);

  const commentSubmitting = Boolean(processingCommentId);

  useEffect(() => {
    if (!pendingScrollCommentId) return;
    const thread = threads.find((t) => t.comment.id === pendingScrollCommentId);
    if (!thread) return;

    if (thread.analysisStatus === "processing") return;

    const target = resolveScrollAfterCommentAnalysis(thread);
    if (target?.kind === "block") {
      setScrollToBlockId(target.blockId);
    }

    const waitingForPlan =
      thread.analysis?.requiresNewPlan &&
      !thread.analysis.requiresQuestions &&
      !thread.updatedPlan &&
      thread.updatedPlanStatus === "generating";

    if (!waitingForPlan) {
      setPendingScrollCommentId(null);
    }
  }, [threads, pendingScrollCommentId]);

  const activePresentation =
    activePlanEntry?.presentation ?? plan ?? null;

  useEffect(() => {
    const recommended =
      activePresentation?.executionRecommendation?.recommendedLevel;

    if (recommended) setExecutionLevel(recommended);
  }, [activePresentation?.executionRecommendation?.recommendedLevel]);

  const actions = useMemo(
    () =>
      bundle
        ? deriveOperationalApprovalActions(bundle, operationalUx)
        : {
            canApprove: false,

            canReturnToPlanning: false,

            canAddPlanComment: false,

            blockedReason: null,
          },

    [bundle, operationalUx],
  );

  const status = deriveApprovalOperationalStatus(
    bundle ?? null,

    mutations.approve.isPending,

    false,
  );

  const phaseLabel = operationalPhaseLabelForUi(operationalUx);

  const inStack = phasePresentation === "stack";

  const pending = mutations.approve.isPending;

  const approve = () => {
    setActionError(null);

    mutations.approve.mutate(
      {
        recommendedMode: modeFromExecutionLevel(executionLevel),

        priority: executionLevel,
      },

      {
        onSuccess: () => setConfirmApprove(false),

        onError: (e) =>
          setActionError(
            e instanceof Error
              ? e.message
              : "Não foi possível aprovar o plano.",
          ),
      },
    );
  };

  const handleCommentSubmit = async () => {
    const block = await addComment(commentDraft);

    if (!block) return;

    setCommentDraft("");

    setCommentInputOpen(false);

    setScrollToBlockId(block.id);
    setPendingScrollCommentId(block.id);
  };

  const handleSubmitAdditionalAnswers = async (
    commentId: string,
    answers: Array<{ questionId: string; question: string; answer: string }>,
  ) => {
    setPendingScrollCommentId(commentId);
    const result = await submitAdditionalAnswers(commentId, answers);
    if (result) {
      const target = resolveScrollAfterUpdatedPlan(commentId);
      if (target?.kind === "block") setScrollToBlockId(target.blockId);
      setPendingScrollCommentId(null);
    }
  };

  const approvalSectionHeading = (
    <OperationalStepOneSectionHeading>
      {OPERATIONAL_STEP_ONE_SUBTITLE.planApproval}
    </OperationalStepOneSectionHeading>
  );

  const loadingOrEmpty = (
    <>
      {inStack ? (
        <section
          className="space-y-3"
          aria-label={OPERATIONAL_STEP_ONE_SUBTITLE.planApproval}
        >
          {approvalSectionHeading}
        </section>
      ) : (
        <OperationalStepOneHeader
          subtitle={OPERATIONAL_STEP_ONE_SUBTITLE.planApproval}
        />
      )}

      <p className="text-[11px] text-muted-foreground">
        A preparar o plano para validação. Aguarde ou atualize a página.
      </p>
    </>
  );

  if (clarification.isPending && !bundle) {
    return (
      <section className="mx-auto w-full max-w-2xl py-8">
        <LoadingState />
      </section>
    );
  }

  if (!bundle || !plan?.hasContent) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3 py-4">
        {loadingOrEmpty}
      </section>
    );
  }

  const sectionBody = (
    <ApprovalPlanSection
      status={status}
      plan={plan}
      actions={actions}
      pending={pending}
      confirmApprove={confirmApprove}
      setConfirmApprove={setConfirmApprove}
      actionError={actionError}
      mutations={mutations}
      approve={approve}
      executionLevel={executionLevel}
      onExecutionLevelChange={setExecutionLevel}
      threads={threads}
      activePlanVersion={activePlanVersion}
      submittingAnswersFor={submittingAnswersFor}
      onSubmitAdditionalAnswers={handleSubmitAdditionalAnswers}
      commentSubmitting={commentSubmitting}
      commentInputOpen={commentInputOpen}
      onOpenCommentInput={() => setCommentInputOpen(true)}
      onCloseCommentInput={() => {
        setCommentInputOpen(false);

        setCommentDraft("");
      }}
      commentDraft={commentDraft}
      onCommentDraftChange={setCommentDraft}
      onCommentSubmit={handleCommentSubmit}
      scrollToBlockId={scrollToBlockId}
    />
  );

  return (
    <section className="mx-auto w-full max-w-2xl py-2" aria-label={phaseLabel}>
      {inStack ? (
        <section
          className="space-y-3"
          aria-label={OPERATIONAL_STEP_ONE_SUBTITLE.planApproval}
        >
          {approvalSectionHeading}

          {sectionBody}
        </section>
      ) : (
        <OperationalStepOneHeader
          subtitle={OPERATIONAL_STEP_ONE_SUBTITLE.planApproval}
        >
          {sectionBody}
        </OperationalStepOneHeader>
      )}
    </section>
  );
}

function buildPlanExcerptForAnalysis(
  plan: OperationalPlanPresentation,
): string {
  const parts: string[] = [];
  if (plan.understanding.summary) {
    parts.push(`Resumo: ${plan.understanding.summary}`);
  }
  if (plan.understanding.mainObjective) {
    parts.push(`Objetivo: ${plan.understanding.mainObjective}`);
  }
  if (plan.whatWillBeDone.length) {
    parts.push(`O que será feito:\n${plan.whatWillBeDone.join("\n")}`);
  }
  if (plan.whatWillChange.length) {
    parts.push(`O que será alterado:\n${plan.whatWillChange.join("\n")}`);
  }
  if (plan.outOfScope.length) {
    parts.push(`Fora do escopo:\n${plan.outOfScope.join("\n")}`);
  }
  if (plan.completionCriteria.length) {
    parts.push(`Critérios:\n${plan.completionCriteria.join("\n")}`);
  }
  return parts.join("\n\n").slice(0, 10_000);
}
