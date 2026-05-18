"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, RotateCcw } from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import { buildOperationalReviewDocument } from "@/lib/runtime/operational/build-operational-review-document";
import {
  deriveReviewOperationalStatus,
  labelReviewOperationalStatus,
} from "@/lib/runtime/operational/review-operational-state";
import { OperationalReviewDocument } from "@/components/features/planning/OperationalReviewDocument";
import { useClarification } from "@/hooks/use-clarification";
import { useExecution } from "@/hooks/use-execution";
import { useRunEvidence } from "@/hooks/use-run-evidence";
import { useOperationalReview } from "@/hooks/use-operational-review";
import { useOperationalReviewMutations } from "@/hooks/use-operational-review-mutations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  operationalPhaseLabelForUi,
  operationalPhaseSubheadline,
} from "@/lib/runtime/operational/operational-ux-selectors";

export function ReviewPhasePanel({
  projectId,
  summary,
  operationalUx,
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
}) {
  const runKey = summary.runId ?? summary.id;
  const clarification = useClarification(runKey, summary.phase, summary.state);
  const execution = useExecution(runKey, summary.phase, summary.state);
  const evidence = useRunEvidence(projectId, runKey);
  const operationalReview = useOperationalReview(
    runKey,
    summary,
    execution.lifecyclePhase,
  );
  const mutations = useOperationalReviewMutations({ runKey, projectId });

  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState(false);

  const hitl = operationalReview.hitl;
  const status = deriveReviewOperationalStatus(hitl);
  const statusLabel = labelReviewOperationalStatus(status);

  const phaseTitle = operationalPhaseLabelForUi(operationalUx);
  const phaseSubheadline = operationalPhaseSubheadline(operationalUx, {
    executionLifecyclePhase: execution.lifecyclePhase,
  });

  const document = useMemo(
    () =>
      buildOperationalReviewDocument({
        clarification: clarification.bundle,
        execution: execution.bundle,
        evidence: evidence.bundle,
        activityLabel: summary.label ?? summary.activityTitle ?? null,
        summary,
        executionLifecyclePhase: execution.lifecyclePhase,
      }),
    [
      clarification.bundle,
      execution.bundle,
      execution.lifecyclePhase,
      evidence.bundle,
      summary,
      summary.label,
      summary.activityTitle,
    ],
  );

  const pending =
    mutations.confirmReview.isPending || mutations.requestAdjustment.isPending;

  const confirm = () => {
    setActionError(null);
    mutations.confirmReview.mutate(comment.trim() || undefined, {
      onError: (e) =>
        setActionError(e instanceof Error ? e.message : "Falha ao confirmar."),
    });
  };

  const requestAdjustment = () => {
    setActionError(null);
    const notes = comment.trim();
    if (!notes) {
      setActionError("Descreva o ajuste ou a questão antes de solicitar.");
      return;
    }
    mutations.requestAdjustment.mutate(notes, {
      onSuccess: (r) => {
        if (r.executeWarning) setActionError(r.executeWarning);
        setAdjustMode(false);
      },
      onError: (e) =>
        setActionError(
          e instanceof Error ? e.message : "Falha ao solicitar ajuste.",
        ),
    });
  };

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-4 py-2"
      aria-label={phaseTitle}
    >
      <header className="space-y-1">
        <p className="cs-text-caption font-medium uppercase tracking-wide text-muted-foreground">
          Fase operacional
        </p>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {phaseTitle}
        </h2>
        <p className="text-sm text-muted-foreground" role="status">
          {phaseSubheadline || statusLabel}
        </p>
      </header>

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Valide o resultado da execução antes de avançar. O documento abaixo
        consolida entregas, ficheiros e critérios com base nos dados reais da
        corrida.
      </p>

      <div className="rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
        <OperationalReviewDocument document={document} />
      </div>

      {status === "awaiting_review" ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Comentário ou questão (opcional na confirmação)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={pending}
              className={cn(
                "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-[12px]",
                "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              placeholder="Ex.: confirmar comportamento do botão, pedir alteração no texto…"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 text-[12px] font-medium"
              disabled={pending || operationalReview.isLoading}
              onClick={confirm}
            >
              {mutations.confirmReview.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Confirmar review
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 gap-1.5 text-[12px]"
              disabled={pending}
              onClick={() => setAdjustMode((v) => !v)}
            >
              <RotateCcw className="size-3.5" />
              Solicitar ajuste
            </Button>
          </div>

          {adjustMode ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-[11px]"
              disabled={pending}
              onClick={requestAdjustment}
            >
              {mutations.requestAdjustment.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MessageSquare className="size-3.5" />
              )}
              Enviar pedido de ajuste e voltar à execução
            </Button>
          ) : null}
        </>
      ) : null}

      {status === "confirmed" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Review concluído. O resultado foi validado.
          </p>
        </div>
      ) : null}

      {actionError ? (
        <p className="text-[11px] text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}
