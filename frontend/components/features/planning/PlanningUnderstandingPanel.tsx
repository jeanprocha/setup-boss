"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  derivePlanningUnderstandingStatus,
  labelPlanningUnderstandingStatus,
  type PlanningUnderstandingStatus,
} from "@/lib/runtime/operational/planning-understanding-operational-state";
import { operationalPhaseLabelForUi } from "@/lib/runtime/operational/operational-ux-selectors";
import { PlanningUnderstandingConversation } from "@/components/features/planning/PlanningUnderstandingConversation";
import { useClarification } from "@/hooks/use-clarification";
import { useClarificationMutations } from "@/hooks/use-clarification-mutations";
import { canSubmitAnswersPayload } from "@/lib/runtime/clarification/clarification-state";
import {
  clarificationInitializedWithoutQuestions,
  CLARIFICATION_EMPTY_DETAIL_PT,
  CLARIFICATION_EMPTY_PRIMARY_PT,
} from "@/lib/runtime/clarification/clarification-operational-state";
import { LoadingState } from "@/components/primitives/LoadingState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PlanningPhaseHeader } from "@/components/features/planning/PlanningPhaseHeader";
import { useRunTaskInput } from "@/hooks/use-run-task-input";

const STATUS_RAIL: PlanningUnderstandingStatus[] = [
  "analyzing_activity",
  "generating_questions",
  "awaiting_answers",
  "processing_answers",
  "evaluating_understanding",
  "generating_new_questions",
  "understanding_complete",
];

const POLL_STATUSES = new Set<PlanningUnderstandingStatus>([
  "analyzing_activity",
  "generating_questions",
  "evaluating_understanding",
  "generating_new_questions",
]);

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
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
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

function StatusRail({
  current,
  resetKey,
}: {
  current: PlanningUnderstandingStatus;
  resetKey: string;
}) {
  const idx = STATUS_RAIL.indexOf(current);
  const [maxIdx, setMaxIdx] = useState(() => Math.max(0, idx));

  useEffect(() => {
    setMaxIdx(Math.max(0, idx));
  }, [resetKey]);

  useEffect(() => {
    if (idx >= 0) setMaxIdx((prev) => Math.max(prev, idx));
  }, [idx]);

  const visibleSteps = STATUS_RAIL.slice(0, maxIdx + 1);

  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {visibleSteps.map((stepId, stepIdx) => {
        const passed = idx > stepIdx || current === "understanding_complete";
        const isCurrent = stepId === current;
        const needsAttention = isCurrent && stepId === "awaiting_answers";
        return (
          <li
            key={stepId}
            className={cn(
              "flex items-center gap-2 text-[11px] font-mono",
              needsAttention && "font-medium text-amber-800 dark:text-amber-200",
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
            <span>{labelPlanningUnderstandingStatus(stepId)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function PlanningUnderstandingPanel({
  projectId,
  summary,
  operationalUx,
  historyMode = false,
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
  historyMode?: boolean;
}) {
  const runKey = summary.runId ?? summary.id;
  const taskInput = useRunTaskInput(projectId, runKey);
  const clarification = useClarification(runKey, summary.phase, summary.state);
  const mutations = useClarificationMutations({
    runKey,
    jobId: summary.id,
    runId: summary.runId,
    projectId,
    refinementAvailable: clarification.bundle?.refinement.available,
  });

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const bundle = clarification.bundle;
  const pending = bundle?.questions.filter((q) => q.status === "pending") ?? [];

  const status = useMemo(() => {
    if (historyMode) return "understanding_complete" as const;
    return derivePlanningUnderstandingStatus({
      contract: operationalUx,
      bundle: bundle ?? null,
      clarificationLoading: clarification.isPending,
      clarificationFetching: clarification.isFetching,
      submitPending:
        mutations.submitAnswers.isPending ||
        mutations.refreshClarification.isPending,
    });
  }, [
    historyMode,
    operationalUx,
    bundle,
    clarification.isPending,
    clarification.isFetching,
    mutations.submitAnswers.isPending,
    mutations.refreshClarification.isPending,
  ]);

  const shouldPoll =
    !historyMode &&
    POLL_STATUSES.has(status) &&
    !mutations.submitAnswers.isPending &&
    clarification.applies;

  useEffect(() => {
    if (!shouldPoll || !runKey) return;
    const id = window.setInterval(() => {
      void clarification.refetch();
    }, 4000);
    return () => window.clearInterval(id);
  }, [shouldPoll, runKey, clarification.refetch]);

  const phaseLabel = operationalPhaseLabelForUi(operationalUx);
  const pendingDrafts = useMemo(
    () => pending.map((q) => ({ questionId: q.id, value: drafts[q.id] ?? "" })),
    [pending, drafts],
  );

  const actionsBlocked =
    clarification.availability.blockedReason != null &&
    !clarification.availability.canSubmitAnswers;

  const submit = () => {
    if (!bundle) return;
    setValidation(null);
    setActionError(null);
    const missing = pending.filter((q) => {
      if (!q.blocking) return false;
      return !(drafts[q.id] ?? "").trim();
    });
    if (missing.length > 0) {
      setValidation("Responda todas as perguntas obrigatórias para continuar.");
      return;
    }
    const payload = pendingDrafts.filter((p) => p.value.trim());
    const guard = canSubmitAnswersPayload(payload);
    if (!guard.ok) {
      setValidation(guard.reason);
      return;
    }
    mutations.submitAnswers.mutate(
      { answers: payload },
      {
        onSuccess: () => setDrafts({}),
        onError: (e) =>
          setActionError(
            e instanceof Error ? e.message : "Não foi possível enviar as respostas.",
          ),
      },
    );
  };

  if (!historyMode && clarification.isPending && !bundle) {
    return (
      <section className="mx-auto w-full max-w-2xl py-8">
        <LoadingState />
      </section>
    );
  }

  if (historyMode) {
    const showConversation = Boolean(bundle && bundle.questions.length > 0);
    return (
      <section className="mx-auto w-full max-w-2xl py-1" aria-label={phaseLabel}>
        <PlanningPhaseHeader
          taskInput={taskInput}
          operationalUx={operationalUx}
          planSection={
            <div className="space-y-3">
              {bundle && bundle.source !== "unsupported" ? (
                <StatusRail current={status} resetKey={runKey} />
              ) : null}
              {showConversation && bundle ? (
                <PlanningUnderstandingConversation
                  bundle={bundle}
                  drafts={{}}
                  onDraftChange={() => {}}
                  readOnlyInputs
                  validation={null}
                  focusFirstPending={false}
                />
              ) : null}
            </div>
          }
        />
      </section>
    );
  }

  if (!bundle || bundle.source === "unsupported") {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-3 py-4">
        <PlanningPhaseHeader
          taskInput={taskInput}
          operationalUx={operationalUx}
          planSection={
            <>
              <p className="text-[11px] text-muted-foreground">
                A preparar o entendimento da atividade. Aguarde ou atualize a página.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[11px]"
                onClick={() => void clarification.refetch()}
              >
                Atualizar
              </Button>
            </>
          }
        />
      </section>
    );
  }

  const emptyInit = clarificationInitializedWithoutQuestions(bundle);
  const showConversation =
    bundle.questions.length > 0 || status === "awaiting_answers";
  const canSubmit =
    pending.length > 0 &&
    clarification.availability.canSubmitAnswers &&
    !actionsBlocked &&
    status !== "understanding_complete";

  return (
    <section
      className="mx-auto w-full max-w-2xl py-2"
      aria-label={phaseLabel}
    >
      <PlanningPhaseHeader
        taskInput={taskInput}
        operationalUx={operationalUx}
        planSection={
          <div className="space-y-5">
            <StatusRail current={status} resetKey={runKey} />

            {bundle.session.currentRound > 1 ? (
        <p className="text-[10px] text-muted-foreground">
          Continuação do entendimento · parte {bundle.session.currentRound}
        </p>
      ) : null}

      {status === "understanding_complete" ? (
        <CompleteBanner>
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Entendimento concluído. A seguir, o Setup Boss monta o plano
            operacional desta atividade.
          </p>
        </CompleteBanner>
      ) : null}

      {emptyInit && !showConversation ? (
        <div className="rounded-lg bg-muted/25 px-1 py-1 text-[12px] leading-relaxed">
          <p className="text-foreground/90">{CLARIFICATION_EMPTY_PRIMARY_PT}</p>
          <p className="mt-1 text-muted-foreground">{CLARIFICATION_EMPTY_DETAIL_PT}</p>
        </div>
      ) : null}

      {showConversation ? (
        <div
          className={cn(
            "pt-1",
            status === "understanding_complete" ? "space-y-2" : "space-y-5",
          )}
        >
          <PlanningUnderstandingConversation
            bundle={bundle}
            drafts={drafts}
            onDraftChange={(id, v) => setDrafts((d) => ({ ...d, [id]: v }))}
            readOnlyInputs={
              !clarification.availability.canSubmitAnswers || actionsBlocked
            }
            validation={validation}
            focusFirstPending
          />

          {canSubmit ? (
            <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="h-9 text-[12px] font-medium"
              disabled={
                mutations.submitAnswers.isPending ||
                mutations.refreshClarification.isPending
              }
              onClick={submit}
            >
              {mutations.submitAnswers.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Enviar respostas
            </Button>
            </div>
          ) : null}

          {validation ? (
            <p className="mt-2 text-[11px] text-destructive">{validation}</p>
          ) : null}
          {actionError ? (
            <p className="mt-2 text-[11px] text-destructive">{actionError}</p>
          ) : null}
        </div>
      ) : null}
          </div>
        }
      />
    </section>
  );
}

function CompleteBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5">
      {children}
    </div>
  );
}
