"use client";

import { useMemo } from "react";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { LoadingState } from "@/components/primitives/LoadingState";
import { RefinementPreview } from "@/components/features/clarification/RefinementPreview";
import { ApprovalFlow } from "@/components/features/clarification/ApprovalFlow";
import { useClarification } from "@/hooks/use-clarification";
import { useClarificationMutations } from "@/hooks/use-clarification-mutations";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import {
  clarificationApprovedAwaitingStrategy,
  shouldShowClarificationApprovalGate,
} from "@/lib/runtime/clarification/clarification-operational-state";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function RefinedPlanPanel({
  summary,
  projectId,
}: {
  summary: RunSummaryDto;
  projectId: string | null;
}) {
  const runKey = summary.runId ?? summary.id;
  const { bundle, applies, isPending, isFetching, availability } = useClarification(
    runKey,
    summary.phase,
    summary.state,
  );
  const mutations = useClarificationMutations({
    runKey,
    jobId: summary.id,
    runId: summary.runId,
    projectId,
    refinementAvailable: bundle?.refinement.available,
  });

  const isRefining =
    bundle?.session.runtimePhase === "refining" ||
    mutations.submitAnswers.isPending;
  const refinementReady =
    bundle?.session.runtimePhase === "refinement_ready";
  const showApprovalGate = bundle
    ? shouldShowClarificationApprovalGate(bundle)
    : false;
  const approvedAwaitingStrategy = bundle
    ? clarificationApprovedAwaitingStrategy(bundle)
    : false;

  const hasContent = useMemo(() => {
    if (!bundle) return false;
    if (isRefining) return true;
    if (bundle.refinement.available) return true;
    if (showApprovalGate) return true;
    if (approvedAwaitingStrategy) return true;
    return false;
  }, [bundle, isRefining, showApprovalGate, approvedAwaitingStrategy]);

  if (!applies) return null;
  if (isPending && !bundle) return <LoadingState />;
  if (!bundle || !hasContent) {
    if (isRefining || mutations.requestRefinement.isPending) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          A gerar plano refinado…
        </div>
      );
    }
    return null;
  }

  const anyPending =
    mutations.approve.isPending ||
    mutations.reject.isPending ||
    mutations.requestRefinement.isPending;

  const completed =
    approvedAwaitingStrategy ||
    bundle.approval.status === "approved" ||
    bundle.approval.status === "rejected";

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <SectionHeader
        title="Plano refinado"
        description="Plano atualizado com base nas respostas da clarificação."
        titleClassName="text-[12px] font-semibold tracking-tight"
        className="border-0 px-0 pb-0"
        action={
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              completed
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
                : "border-cyan-500/30 bg-cyan-500/10 text-foreground",
            )}
          >
            {completed
              ? "Concluído"
              : bundle.approval.status === "rejected"
                ? "Revisão necessária"
                : "Aguardando decisão"}
          </span>
        }
      />

      {mutations.approve.isPending ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/25 bg-emerald-500/8 px-3 py-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          Plano aprovado — a preparar próxima etapa…
        </div>
      ) : null}

      {refinementReady && bundle.refinement.available && !completed ? (
        <div className="flex items-start gap-2 rounded-lg border border-cyan-600/25 bg-cyan-500/8 px-3 py-2 dark:border-cyan-500/20 dark:bg-cyan-500/6">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <div>
            <p className="text-[11px] font-medium text-foreground">
              Plano refinado gerado
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Aguardando aprovação — revise o conteúdo abaixo.
            </p>
          </div>
        </div>
      ) : null}

      {approvedAwaitingStrategy ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-600/25 bg-emerald-500/8 px-3 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/6">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Plano validado. A gerar estratégia de execução automaticamente…
          </p>
        </div>
      ) : null}

      {isRefining && !bundle.refinement.available ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          A gerar plano refinado…
        </div>
      ) : null}

      <RefinementPreview
        refinement={bundle.refinement}
        isRefining={isRefining}
      />

      {showApprovalGate ? (
        <ApprovalFlow
          approval={bundle.approval}
          availability={availability}
          isPending={anyPending}
          onApprove={() => mutations.approve.mutate(undefined)}
          onReject={() => mutations.reject.mutate(undefined)}
          onRequestRefinement={() => mutations.requestRefinement.mutate(undefined)}
        />
      ) : null}
    </div>
  );
}


