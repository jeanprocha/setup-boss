"use client";

import { Button } from "@/components/ui/button";
import { Surface } from "@/components/primitives/Surface";
import { useGitBranchMutation } from "@/hooks/use-git-branch-mutation";
import type { RunSummaryDto } from "@/lib/api/runtime-types";
import {
  formatGitStatusLabel,
  shouldShowGitBranchPrepareCta,
} from "@/lib/runtime/git/git-branch-cta-visibility";
import { PrepareGitBranchError } from "@/lib/runtime/git/git-branch-actions";
import { gitBranchErrorMessage } from "@/lib/runtime/git/git-branch-error-messages";
import type { ExecuteAvailability } from "@/lib/runtime/orchestration/orchestration-types";
import { cn } from "@/lib/utils";
import { GitBranch, Loader2 } from "lucide-react";

const PROTECTED_REFS = "main, master, develop, production e release";

export function PrepareGitBranchCard({
  summary,
  projectId,
  availability,
}: {
  summary: RunSummaryDto;
  projectId: string | null;
  availability: ExecuteAvailability;
}) {
  const runKey = summary.runId ?? summary.id;
  const showCta = shouldShowGitBranchPrepareCta(availability, summary);
  const mutations = useGitBranchMutation({ runKey, projectId });

  if (!showCta) return null;

  const git = summary.git;
  const statusLabel = formatGitStatusLabel(git?.status);
  const apiError =
    mutations.prepareBranch.error instanceof PrepareGitBranchError
      ? mutations.prepareBranch.error.message
      : mutations.prepareBranch.error instanceof Error
        ? gitBranchErrorMessage("git_unknown_error", mutations.prepareBranch.error.message)
        : null;
  const persistedError =
    git?.status === "git_branch_failed" && git.errorMessage?.trim()
      ? git.errorMessage.trim()
      : git?.status === "git_branch_failed" && git.errorCode
        ? gitBranchErrorMessage(git.errorCode)
        : null;
  const errorMessage = apiError ?? persistedError;

  return (
    <Surface
      variant="strip"
      className="space-y-3 border-amber-500/30 bg-amber-500/[0.04] p-3"
    >
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 size-4 shrink-0 text-amber-200/90" aria-hidden />
        <div>
          <p className="text-[12px] font-semibold tracking-tight text-foreground">
            Preparar branch da atividade
          </p>
          <p className="text-[10px] text-muted-foreground">Acção humana · antes da execução</p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A execução não corre em branches protegidas ({PROTECTED_REFS}). Será criada uma
        branch de atividade com nome sugerido pelo runtime.
      </p>

      {git?.status || summary.branchHint ? (
        <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-[11px]">
          <p className="font-medium text-foreground/90">Estado Git</p>
          {statusLabel ? (
            <p className="mt-1 text-muted-foreground">
              Status: <span className="text-foreground/85">{statusLabel}</span>
            </p>
          ) : null}
          {summary.branchHint ? (
            <p className="mt-0.5 font-mono text-[10px] text-foreground/80">
              Branch: {summary.branchHint}
            </p>
          ) : git?.activityBranch ? (
            <p className="mt-0.5 font-mono text-[10px] text-foreground/80">
              Branch prevista: {git.activityBranch}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-amber-500/40 bg-amber-500/10 px-3 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20"
          disabled={mutations.prepareBranch.isPending}
          onClick={() => mutations.prepareBranch.mutate()}
        >
          {mutations.prepareBranch.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <GitBranch className="size-3.5" aria-hidden />
          )}
          Preparar branch
        </Button>
        {errorMessage ? (
          <p
            className={cn(
              "max-w-md text-[10px] leading-snug",
              mutations.prepareBranch.isError ? "text-sb-failed" : "text-muted-foreground",
            )}
            role={mutations.prepareBranch.isError ? "alert" : undefined}
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    </Surface>
  );
}
