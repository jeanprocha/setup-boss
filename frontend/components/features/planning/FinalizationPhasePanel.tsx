"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Flag,
  Loader2,
  MessageSquare,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import { buildOperationalFinalizationSummary } from "@/lib/runtime/operational/build-operational-finalization-summary";
import {
  deriveFinalizationOperationalStatus,
  labelFinalizationOperationalStatus,
} from "@/lib/runtime/operational/finalization-operational-state";
import {
  operationalPhaseLabelForUi,
  operationalPhaseSubheadline,
} from "@/lib/runtime/operational/operational-ux-selectors";
import { OperationalFinalizationSummaryView } from "@/components/features/planning/OperationalFinalizationSummary";
import { useClarification } from "@/hooks/use-clarification";
import { useExecution } from "@/hooks/use-execution";
import { useRunEvidence } from "@/hooks/use-run-evidence";
import { useOperationalReview } from "@/hooks/use-operational-review";
import { useOperationalFinalization } from "@/hooks/use-operational-finalization";
import { useOperationalFinalizationMutations } from "@/hooks/use-operational-finalization-mutations";
import { useGitPushMutation } from "@/hooks/use-git-push-mutation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PublishBranchBlock({
  canPublish,
  gitPushed,
  confirmPublish,
  pending,
  pushSuccess,
  activityBranch,
  onPublish,
  onCancelConfirm,
}: {
  canPublish: boolean;
  gitPushed: boolean;
  confirmPublish: boolean;
  pending: boolean;
  pushSuccess: string | null;
  activityBranch: string | null;
  onPublish: () => void;
  onCancelConfirm: () => void;
}) {
  if (pushSuccess) {
    return (
      <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-900 dark:text-emerald-100">
        {pushSuccess}
      </div>
    );
  }
  if (gitPushed && activityBranch) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-[12px] text-muted-foreground">
        Branch já publicada no remoto ({activityBranch}). O PR continua sendo sua
        responsabilidade.
      </div>
    );
  }
  if (!canPublish) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
      <p className="text-[12px] font-medium text-foreground">Publicar branch</p>
      <p className="text-[11px] text-muted-foreground">
        Envia <span className="font-mono">{activityBranch}</span> para o remoto
        (origin). Sem PR, merge ou deploy automáticos.
      </p>
      {confirmPublish ? (
        <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">
          Confirme: publicar esta branch no remoto?
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={confirmPublish ? "default" : "outline"}
          className="h-8 gap-1.5 text-[11px]"
          disabled={pending}
          onClick={onPublish}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {confirmPublish ? "Confirmar publicação" : "Publicar branch"}
        </Button>
        {confirmPublish ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-[11px]"
            disabled={pending}
            onClick={onCancelConfirm}
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function FinalizationPhasePanel({
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
  const operationalFinalization = useOperationalFinalization(
    runKey,
    operationalReview.hitl,
  );
  const mutations = useOperationalFinalizationMutations({ runKey, projectId });
  const gitPush = useGitPushMutation({ runKey, projectId });

  const [comment, setComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);
  const [adjustMode, setAdjustMode] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const hitl = operationalFinalization.hitl;
  const status = deriveFinalizationOperationalStatus(hitl);
  const statusLabel = labelFinalizationOperationalStatus(status);
  const phaseTitle = operationalPhaseLabelForUi(operationalUx);
  const phaseSubheadline = operationalPhaseSubheadline(operationalUx, {
    finalizationStatus: status,
  });

  const gitPushed = summary.git?.pushStatus === "pushed";
  const activityBranch =
    summary.git?.activityBranch?.trim() || summary.branchHint?.trim() || null;
  const canPublishBranch =
    summary.git?.status === "git_branch_ready" && Boolean(activityBranch) && !gitPushed;

  const finalSummary = useMemo(
    () =>
      buildOperationalFinalizationSummary({
        clarification: clarification.bundle,
        execution: execution.bundle,
        evidence: evidence.bundle,
        summary,
        reviewHitl: operationalReview.hitl,
        reviewConfirmedAt: operationalFinalization.session?.reviewConfirmedAt,
        activityLabel: summary.label ?? summary.activityTitle ?? null,
        executionLifecyclePhase: execution.lifecyclePhase,
      }),
    [
      clarification.bundle,
      execution.bundle,
      execution.lifecyclePhase,
      evidence.bundle,
      summary,
      operationalReview.hitl,
      operationalFinalization.session?.reviewConfirmedAt,
    ],
  );

  const pending =
    mutations.finalizeActivity.isPending ||
    mutations.requestFinalAdjustment.isPending ||
    gitPush.isPending;

  const finalize = () => {
    setActionError(null);
    mutations.finalizeActivity.mutate(comment.trim() || undefined, {
      onError: (e) =>
        setActionError(e instanceof Error ? e.message : "Falha ao finalizar."),
    });
  };

  const requestFinalAdjustment = () => {
    setActionError(null);
    const notes = comment.trim();
    if (!notes) {
      setActionError("Descreva o ajuste antes de solicitar.");
      return;
    }
    mutations.requestFinalAdjustment.mutate(notes, {
      onSuccess: (r) => {
        if (r.message) setActionError(r.message);
        setAdjustMode(false);
      },
      onError: (e) =>
        setActionError(
          e instanceof Error ? e.message : "Falha ao solicitar ajuste final.",
        ),
    });
  };

  const publishBranch = () => {
    setActionError(null);
    setPushSuccess(null);
    if (!confirmPublish) {
      setConfirmPublish(true);
      return;
    }
    gitPush.mutate(undefined, {
      onSuccess: (r) => {
        setConfirmPublish(false);
        const branch = r.branch ?? activityBranch ?? "branch";
        const remote = r.remote ?? "origin";
        const url = r.remoteUrl?.trim();
        setPushSuccess(
          url
            ? `Branch publicada: ${remote}/${branch} (${url}). Abra o PR no seu fluxo habitual — o Setup Boss não cria PR nem faz merge.`
            : `Branch publicada: ${remote}/${branch}. Abra o PR no seu fluxo habitual — o Setup Boss não cria PR nem faz merge.`,
        );
      },
      onError: (e) => {
        setConfirmPublish(false);
        setActionError(
          e instanceof Error ? e.message : "Falha ao publicar a branch.",
        );
      },
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
        Encerre a atividade após validar o resumo. Pode publicar a branch no
        remoto com confirmação explícita; PR, merge e deploy ficam consigo.
      </p>

      <PublishBranchBlock
        canPublish={canPublishBranch}
        gitPushed={gitPushed}
        confirmPublish={confirmPublish}
        pending={pending}
        pushSuccess={pushSuccess}
        activityBranch={activityBranch}
        onPublish={publishBranch}
        onCancelConfirm={() => setConfirmPublish(false)}
      />

      <div className="rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
        <OperationalFinalizationSummaryView summary={finalSummary} />
      </div>

      {status === "awaiting_finalize" ? (
        <>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Comentário final (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={pending}
              className={cn(
                "flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-[12px]",
                "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              placeholder="Ex.: notas para o encerramento, lembrete de PR…"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 text-[12px] font-medium"
              disabled={pending || operationalFinalization.isLoading}
              onClick={finalize}
            >
              {mutations.finalizeActivity.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Flag className="size-3.5" />
              )}
              Finalizar atividade
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
              Solicitar ajuste final
            </Button>
          </div>

          {adjustMode ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-[11px]"
              disabled={pending}
              onClick={requestFinalAdjustment}
            >
              {mutations.requestFinalAdjustment.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <MessageSquare className="size-3.5" />
              )}
              Enviar pedido e voltar ao Review
            </Button>
          ) : null}
        </>
      ) : null}

      {status === "finalized" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Atividade finalizada. PR, merge e deploy são decisões suas.
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
