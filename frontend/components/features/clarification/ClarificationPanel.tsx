"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingState } from "@/components/primitives/LoadingState";
import { EmptyState } from "@/components/primitives/EmptyState";
import { ClarificationQuestionCard } from "@/components/features/clarification/ClarificationQuestionCard";
import { useClarification } from "@/hooks/use-clarification";
import { useClarificationMutations } from "@/hooks/use-clarification-mutations";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { canSubmitAnswersPayload } from "@/lib/runtime/clarification/clarification-state";
import {
  clarificationApprovedAwaitingStrategy,
  clarificationInitializedWithoutQuestions,
  CLARIFICATION_EMPTY_DETAIL_PT,
  CLARIFICATION_EMPTY_PRIMARY_PT,
} from "@/lib/runtime/clarification/clarification-operational-state";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronDown, HandMetal, Loader2 } from "lucide-react";

export function ClarificationPanel({
  summary,
  projectId,
  workflowPostApproveCompact = false,
}: {
  summary: RunSummaryDto;
  projectId: string | null;
  workflowPostApproveCompact?: boolean;
}) {
  const runKey = summary.runId ?? summary.id;
  const {
    bundle,
    applies,
    availability,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useClarification(runKey, summary.phase, summary.state);
  const mutations = useClarificationMutations({
    runKey,
    jobId: summary.id,
    runId: summary.runId,
    projectId,
    refinementAvailable: bundle?.refinement.available,
  });

  const pending = bundle?.questions.filter((q) => q.status === "pending") ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (workflowPostApproveCompact) setCollapsed(true);
  }, [workflowPostApproveCompact, runKey]);

  const pendingDrafts = useMemo(
    () => pending.map((q) => ({ questionId: q.id, value: drafts[q.id] ?? "" })),
    [pending, drafts],
  );

  const anyPending =
    mutations.submitAnswers.isPending || mutations.refreshClarification.isPending;

  const approvedAwaitingStrategy = bundle
    ? clarificationApprovedAwaitingStrategy(bundle)
    : false;
  const allAnswered = bundle ? pending.length === 0 && bundle.questions.length > 0 : false;
  const isComplete =
    workflowPostApproveCompact || approvedAwaitingStrategy || allAnswered;

  const actionsBlocked =
    availability.blockedReason != null &&
    !availability.canSubmitAnswers &&
    !availability.canApprove;

  if (!applies) {
    return (
      <EmptyState
        icon={HandMetal}
        title="Clarificação não activa"
        hint="Esta corrida não está em fase de clarificação."
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  if (isPending && !bundle) return <LoadingState />;

  const generatingRefinedPlan =
    mutations.submitAnswers.isPending ||
    bundle?.session.runtimePhase === "refining";

  if (!bundle || bundle.source === "unsupported") {
    return (
      <EmptyState
        icon={HandMetal}
        title="Clarificação indisponível"
        hint={
          bundle?.unsupportedReason?.replace(/^\[read-model-conflito\]\s*/, "") ??
          "Aguarde o runtime ou tente novamente."
        }
        className="rounded-md border border-dashed border-border/60 py-10"
      />
    );
  }

  const emptyInitState = clarificationInitializedWithoutQuestions(bundle);
  const fallbackGenFailed = bundle.session.localFallbackGenerationFailed === true;

  const submit = () => {
    setValidation(null);
    setActionError(null);
    const missing = pending.filter((q) => {
      if (!q.blocking) return false;
      return !(drafts[q.id] ?? "").trim();
    });
    if (missing.length > 0) {
      setValidation("Responda todas as perguntas obrigatórias.");
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
        onSuccess: () => {
          setDrafts({});
          setCollapsed(true);
        },
        onError: (e) =>
          setActionError(
            e instanceof Error ? e.message : "Falha ao submeter respostas.",
          ),
      },
    );
  };

  if (isComplete && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-600/25 bg-emerald-500/8 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/12 dark:border-emerald-500/20 dark:bg-emerald-500/6"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[12px] font-medium text-foreground">
            Clarificação concluída
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
    );
  }

  const formBody = (
    <div className="space-y-5">
      {generatingRefinedPlan ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          A gerar plano refinado com base nas suas respostas…
        </div>
      ) : null}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Responda as perguntas abaixo para gerar o plano refinado.
      </p>

      {emptyInitState ? (
        <div className="rounded-lg border border-border/35 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed">
          <p className="font-medium text-foreground">
            {fallbackGenFailed
              ? "Aguarda perguntas — a geração local falhou."
              : CLARIFICATION_EMPTY_PRIMARY_PT}
          </p>
          {!fallbackGenFailed ? (
            <p className="mt-1 text-muted-foreground">
              {CLARIFICATION_EMPTY_DETAIL_PT}
            </p>
          ) : null}
        </div>
      ) : null}

      {bundle.questions.length > 0 ? (
        <div className="space-y-4">
          {bundle.questions.map((q) => (
            <ClarificationQuestionCard
              key={q.id}
              question={q}
              draftValue={drafts[q.id] ?? ""}
              onDraftChange={(v) => setDrafts((d) => ({ ...d, [q.id]: v }))}
              focusAnchor={
                q.status === "pending" && q.id === pending[0]?.id
              }
              readOnly={
                q.status === "answered" ||
                !availability.canSubmitAnswers ||
                actionsBlocked
              }
              validationError={validation && q.blocking && !(drafts[q.id] ?? "").trim() ? "Obrigatória" : null}
            />
          ))}
        </div>
      ) : null}

      {pending.length > 0 && availability.canSubmitAnswers ? (
        <Button
          type="button"
          size="sm"
          className="h-9 w-full text-[12px] font-medium sm:w-auto"
          disabled={anyPending || actionsBlocked}
          onClick={submit}
        >
          {mutations.submitAnswers.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : null}
          Gerar plano refinado
        </Button>
      ) : null}

      {validation ? (
        <p className="text-[11px] text-sb-failed">{validation}</p>
      ) : null}

      {isError || actionError || mutations.submitAnswers.error ? (
        <p className="text-[11px] text-sb-failed">
          {actionError ||
            (error instanceof Error
              ? error.message
              : mutations.submitAnswers.error instanceof Error
                ? mutations.submitAnswers.error.message
                : "Acção falhou.")}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setActionError(null);
              void refetch();
            }}
          >
            Tentar novamente
          </button>
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            isComplete
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
              : "border-cyan-500/30 bg-cyan-500/10 text-foreground",
          )}
        >
          {isComplete ? "Concluído" : "Aguardando respostas"}
        </span>
        {isComplete ? (
          <button
            type="button"
            className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setCollapsed(true)}
          >
            Colapsar
          </button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="pr-2">{formBody}</div>
      </ScrollArea>
    </div>
  );
}
