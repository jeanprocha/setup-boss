"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  GitBranch,
  Loader2,
} from "lucide-react";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import type { RunOperationalUxContract } from "@/lib/runtime/operational/operational-ux-types";
import {
  buildVersioningOperationalContext,
  deriveVersioningOperationalStatus,
  labelVersioningOperationalStatus,
  type VersioningOperationalStatus,
} from "@/lib/runtime/operational/versioning-operational-state";
import {
  operationalPhaseLabelForUi,
  operationalPhaseSubheadline,
} from "@/lib/runtime/operational/operational-ux-selectors";
import { useProjects } from "@/hooks/use-projects";
import { useRunSummary } from "@/hooks/use-run-summary";
import { useGitBranchMutation } from "@/hooks/use-git-branch-mutation";
import { useWorkspaceRunMutations } from "@/hooks/use-workspace-run-mutations";
import { useWorkspaceRunDetail } from "@/hooks/use-workspace-run-detail";
import { useMissionShellStore } from "@/stores/mission-shell-store";
import { PrepareGitBranchError } from "@/lib/runtime/git/git-branch-actions";
import { gitBranchErrorMessage } from "@/lib/runtime/git/git-branch-error-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { OperationalStepOneHeader } from "@/components/features/operational/OperationalStepOneHeader";
import { OPERATIONAL_STEP_ONE_SUBTITLE } from "@/lib/runtime/operational/operational-step-one-ui";

const STATUS_RAIL: VersioningOperationalStatus[] = [
  "awaiting_confirmation",
  "preparing_branches",
  "workspace_ready",
];

function StepIcon({ current, passed }: { current: boolean; passed: boolean }) {
  if (current) {
    return <Loader2 className="size-3.5 animate-spin text-primary" />;
  }
  if (passed) {
    return <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  return <Circle className="size-3.5 text-muted-foreground/50" />;
}

function VersioningStatusRail({ current }: { current: VersioningOperationalStatus }) {
  const rail =
    current === "prepare_failed"
      ? ([...STATUS_RAIL, "prepare_failed"] as VersioningOperationalStatus[])
      : STATUS_RAIL;
  const idx = rail.indexOf(current);
  return (
    <ol className="flex flex-col gap-1 border-l border-border/60 pl-3">
      {rail.map((stepId, stepIdx) => {
        const passed =
          idx > stepIdx || current === "workspace_ready";
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
            <span>{labelVersioningOperationalStatus(stepId)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function VersioningPhasePanel({
  projectId,
  summary,
  operationalUx,
}: {
  projectId: string | null;
  summary: RunSummaryDto;
  operationalUx: RunOperationalUxContract;
}) {
  const runKey = summary.runId ?? summary.id;
  const liveSummary = useRunSummary(projectId, runKey) ?? summary;
  const workspaceRunId = useMissionShellStore((s) => s.selectedWorkspaceRunId);
  const projectsQuery = useProjects();
  const projectsCatalog = projectsQuery.data?.projects ?? [];

  const workspaceDetail = useWorkspaceRunDetail(workspaceRunId);
  const workspaceGit =
    workspaceDetail.gitQuery.data?.git ?? workspaceDetail.runQuery.data?.git ?? null;

  const runGitMut = useGitBranchMutation({ runKey, projectId });
  const workspaceGitMut = useWorkspaceRunMutations(workspaceRunId);

  const initialBranch = useMemo(
    () =>
      buildVersioningOperationalContext({
        summary: liveSummary,
        projectsCatalog,
        workspaceGit,
        workspaceRunId,
      }).suggestedBranchName,
    [liveSummary, projectsCatalog, workspaceGit, workspaceRunId],
  );

  const [branchName, setBranchName] = useState(initialBranch);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBranchName(initialBranch);
  }, [initialBranch]);

  const context = useMemo(
    () =>
      buildVersioningOperationalContext({
        summary: liveSummary,
        projectsCatalog,
        workspaceGit,
        workspaceRunId,
        branchNameOverride: branchName,
      }),
    [liveSummary, projectsCatalog, workspaceGit, workspaceRunId, branchName],
  );

  const preparePending =
    runGitMut.prepareBranch.isPending || workspaceGitMut.prepareGit.isPending;

  const status = deriveVersioningOperationalStatus({
    context,
    summary: liveSummary,
    preparePending,
  });

  const phaseLabel = operationalPhaseLabelForUi(operationalUx);
  const phaseSubheadline = operationalPhaseSubheadline(operationalUx);
  const statusLabel = labelVersioningOperationalStatus(status);

  const shouldPoll =
    status === "preparing_branches" ||
    liveSummary.git?.status === "git_branch_pending";

  useEffect(() => {
    if (!shouldPoll) return;
    const id = window.setInterval(() => {
      if (workspaceRunId) {
        void workspaceDetail.gitQuery.refetch();
        void workspaceDetail.runQuery.refetch();
      }
      if (projectId) {
        void projectsQuery.refetch();
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [
    shouldPoll,
    workspaceRunId,
    workspaceDetail.gitQuery,
    workspaceDetail.runQuery,
    projectId,
    projectsQuery,
  ]);

  const confirmVersioning = () => {
    setActionError(null);
    const branch = branchName.trim();
    if (!branch) {
      setActionError("Indique um nome de branch para continuar.");
      return;
    }

    if (context.mode === "workspace" && workspaceRunId) {
      workspaceGitMut.prepareGit.mutate(
        { activityBranch: branch },
        {
          onError: (e) =>
            setActionError(
              workspaceGitMut.workspaceMutationErrorMessage(e),
            ),
        },
      );
      return;
    }

    runGitMut.prepareBranch.mutate(branch, {
      onError: (e) => {
        const msg =
          e instanceof PrepareGitBranchError
            ? e.message
            : e instanceof Error
              ? gitBranchErrorMessage("git_unknown_error", e.message)
              : "Não foi possível preparar a branch.";
        setActionError(msg);
      },
    });
  };

  const apiError =
    runGitMut.prepareBranch.error instanceof PrepareGitBranchError
      ? runGitMut.prepareBranch.error.message
      : runGitMut.prepareBranch.error instanceof Error
        ? runGitMut.prepareBranch.error.message
        : workspaceGitMut.prepareGit.error != null
          ? workspaceGitMut.workspaceMutationErrorMessage(
              workspaceGitMut.prepareGit.error,
            )
          : null;

  const canConfirm =
    status === "awaiting_confirmation" || status === "prepare_failed";

  return (
    <section
      className="mx-auto w-full max-w-2xl space-y-4 py-2"
      aria-label={phaseLabel}
    >
      <OperationalStepOneHeader
        subtitle={OPERATIONAL_STEP_ONE_SUBTITLE.prepareBranch}
        attentionMessage={
          status === "awaiting_confirmation"
            ? statusLabel
            : phaseSubheadline || null
        }
      />

      <VersioningStatusRail current={status} />

      <p className="text-[12px] leading-relaxed text-muted-foreground">
        O Setup Boss prepara branches de trabalho nos projetos envolvidos. Não
        são criados pull requests nem é feito push automático nesta fase.
      </p>

      <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-foreground">
            Nome da branch
          </span>
          <Input
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            disabled={!canConfirm || preparePending}
            className="h-9 font-mono text-[12px]"
            spellCheck={false}
          />
          <span className="text-[10px] text-muted-foreground">
            Sugestão automática com base na atividade — pode ajustar antes de
            confirmar.
          </span>
        </label>
      </div>

      <div className="space-y-2 rounded-xl border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
          Projetos envolvidos
        </p>
        {context.projects.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhum projeto associado a esta corrida. Verifique o registo do
            projeto no Mission Control.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {context.projects.map((p) => (
              <li
                key={p.projectId}
                className="flex items-start justify-between gap-2 rounded-md border border-border/40 bg-muted/15 px-2.5 py-2 text-[11px]"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground/90">{p.displayName}</p>
                  {p.activityBranch ? (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      {p.activityBranch}
                    </p>
                  ) : null}
                  {p.errorMessage ? (
                    <p className="mt-1 whitespace-pre-wrap text-destructive">
                      {p.errorMessage}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    p.status === "ready"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : p.status === "failed"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : p.status === "preparing"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {p.statusLabelPt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status === "workspace_ready" ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2.5">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-900 dark:text-emerald-100">
            Workspace operacional pronto. As branches estão preparadas para a
            execução numa fase seguinte.
          </p>
        </div>
      ) : null}

      {status === "preparing_branches" ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {statusLabel}
        </p>
      ) : null}

      {canConfirm ? (
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 text-[12px] font-medium"
          disabled={preparePending || context.projects.length === 0}
          onClick={confirmVersioning}
        >
          {preparePending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <GitBranch className="size-3.5" />
          )}
          Confirmar versionamento
        </Button>
      ) : null}

      {actionError || apiError ? (
        <p className="whitespace-pre-wrap text-[11px] text-destructive" role="alert">
          {actionError ?? apiError}
        </p>
      ) : null}
    </section>
  );
}
