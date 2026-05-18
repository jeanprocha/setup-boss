import type { ClarificationBundleDto } from "../clarification/clarification-types.ts";
import { suggestActivityBranchName } from "../git/suggest-activity-branch.ts";
import type { ProjectSummaryDto, RunSummaryDto } from "../../api/runtime-types.ts";
import type { WorkspaceGitDto } from "../../api/workspace-git-types.ts";
import type { RunOperationalUxContract } from "./operational-ux-types.ts";

export const VERSIONING_OPERATIONAL_STATUSES = [
  "awaiting_confirmation",
  "preparing_branches",
  "workspace_ready",
  "prepare_failed",
] as const;

export type VersioningOperationalStatus =
  (typeof VERSIONING_OPERATIONAL_STATUSES)[number];

export const VERSIONING_OPERATIONAL_STATUS_LABELS_PT: Record<
  VersioningOperationalStatus,
  string
> = {
  awaiting_confirmation: "Confirme o versionamento",
  preparing_branches: "A preparar branches",
  workspace_ready: "Workspace operacional pronto",
  prepare_failed: "Falha na preparação",
};

export type VersioningProjectRow = {
  projectId: string;
  displayName: string;
  baseBranch: string | null;
  activityBranch: string | null;
  status: "pending" | "preparing" | "ready" | "failed" | "skipped";
  statusLabelPt: string;
  errorMessage: string | null;
};

export type VersioningOperationalContext = {
  mode: "run" | "workspace";
  workspaceRunId: string | null;
  suggestedBranchName: string;
  projects: VersioningProjectRow[];
};

export type ShouldShowVersioningPhasePanelInput = {
  executionApplies: boolean;
  isInitializationPhase: boolean;
  operationalUx: RunOperationalUxContract;
  bundle: ClarificationBundleDto | null | undefined;
  summary: RunSummaryDto | null | undefined;
};

const PROJECT_STATUS_LABELS_PT: Record<VersioningProjectRow["status"], string> = {
  pending: "Pendente",
  preparing: "A preparar",
  ready: "Pronto",
  failed: "Falhou",
  skipped: "Ignorado",
};

export function labelVersioningOperationalStatus(
  status: VersioningOperationalStatus,
): string {
  return VERSIONING_OPERATIONAL_STATUS_LABELS_PT[status];
}

export function isRunApprovedForVersioning(
  bundle: ClarificationBundleDto | null | undefined,
): boolean {
  if (!bundle) return false;
  if (bundle.approval.status === "approved") return true;
  const rp = bundle.session.runtimePhase;
  return (
    rp === "approved" ||
    rp === "strategy_pending" ||
    rp === "ready_for_execution"
  );
}

/** Versionamento concluído — transição para fase Execução (Fase 7). */
export function isVersioningOperationallyComplete(
  summary: RunSummaryDto | null | undefined,
): boolean {
  if (!summary) return false;
  return String(summary.git?.status ?? "") === "git_branch_ready";
}

/** Fase visual Versionamento — após aprovação, antes da execução. */
export function shouldShowVersioningPhasePanel(
  input: ShouldShowVersioningPhasePanelInput,
): boolean {
  const { executionApplies, isInitializationPhase, operationalUx, bundle, summary } =
    input;
  if (executionApplies || isInitializationPhase) return false;
  if (!isRunApprovedForVersioning(bundle)) return false;
  if (summary && isVersioningOperationallyComplete(summary)) return false;

  if (operationalUx.uxPhase === "versioning") return true;

  const gitStatus = summary?.git?.status;
  if (
    gitStatus === "git_branch_pending" ||
    gitStatus === "git_branch_ready" ||
    gitStatus === "git_branch_failed" ||
    summary?.git?.executeBlockCode === "git_branch_required"
  ) {
    return true;
  }

  return bundle?.approval.status === "approved";
}

export function deriveSuggestedBranchName(summary: RunSummaryDto): string {
  const fromPersisted =
    summary.branchHint?.trim() ||
    summary.git?.activityBranch?.trim() ||
    null;
  if (fromPersisted) return fromPersisted;

  const title =
    summary.activityTitle?.trim() ||
    summary.label?.trim() ||
    "atividade";
  return suggestActivityBranchName(title);
}

function mapWorkspaceProjectStatus(
  raw: string | null | undefined,
): VersioningProjectRow["status"] {
  const s = String(raw || "").toLowerCase();
  if (s === "ready") return "ready";
  if (s === "preparing") return "preparing";
  if (s === "failed") return "failed";
  if (s === "skipped") return "skipped";
  return "pending";
}

function mapRunGitProjectStatus(
  git: RunSummaryDto["git"],
): VersioningProjectRow["status"] {
  const st = String(git?.status || "");
  if (st === "git_branch_ready") return "ready";
  if (st === "git_branch_pending") return "preparing";
  if (st === "git_branch_failed") return "failed";
  return "pending";
}

export function buildVersioningOperationalContext(input: {
  summary: RunSummaryDto;
  projectsCatalog: ProjectSummaryDto[];
  workspaceGit?: WorkspaceGitDto | null;
  workspaceRunId?: string | null;
  branchNameOverride?: string | null;
}): VersioningOperationalContext {
  const { summary, projectsCatalog, workspaceGit, workspaceRunId, branchNameOverride } =
    input;

  const suggestedBranchName =
    branchNameOverride?.trim() ||
    workspaceGit?.activityBranch?.trim() ||
    deriveSuggestedBranchName(summary);

  if (workspaceRunId && workspaceGit?.projects?.length) {
    const projects: VersioningProjectRow[] = workspaceGit.projects.map((p) => {
      const status = mapWorkspaceProjectStatus(
        p.prepareBranchStatus ?? p.gitStatus,
      );
      return {
        projectId: p.projectId,
        displayName:
          projectsCatalog.find((c) => c.id === p.projectId)?.displayName ??
          p.projectId,
        baseBranch: p.baseBranch,
        activityBranch: p.activityBranch ?? suggestedBranchName,
        status,
        statusLabelPt: PROJECT_STATUS_LABELS_PT[status],
        errorMessage: p.errorMessage?.trim() || null,
      };
    });
    return {
      mode: "workspace",
      workspaceRunId,
      suggestedBranchName,
      projects,
    };
  }

  const projectId = summary.projectId?.trim() || null;
  const catalog = projectId
    ? projectsCatalog.find((p) => p.id === projectId)
    : null;
  const status = mapRunGitProjectStatus(summary.git);

  const projects: VersioningProjectRow[] = projectId
    ? [
        {
          projectId,
          displayName: catalog?.displayName?.trim() || projectId,
          baseBranch: null,
          activityBranch:
            summary.git?.activityBranch?.trim() || suggestedBranchName,
          status,
          statusLabelPt: PROJECT_STATUS_LABELS_PT[status],
          errorMessage: summary.git?.errorMessage?.trim() || null,
        },
      ]
    : [];

  return {
    mode: "run",
    workspaceRunId: null,
    suggestedBranchName,
    projects,
  };
}

export function deriveVersioningOperationalStatus(input: {
  context: VersioningOperationalContext;
  summary: RunSummaryDto;
  preparePending: boolean;
}): VersioningOperationalStatus {
  const { context, summary, preparePending } = input;

  if (preparePending) return "preparing_branches";

  const git = summary.git;
  if (git?.status === "git_branch_pending") return "preparing_branches";

  const allReady =
    context.projects.length > 0 &&
    context.projects.every((p) => p.status === "ready" || p.status === "skipped");

  if (git?.status === "git_branch_ready" || allReady) {
    return "workspace_ready";
  }

  if (git?.status === "git_branch_failed") {
    return "prepare_failed";
  }

  const anyFailed = context.projects.some((p) => p.status === "failed");
  if (anyFailed) return "prepare_failed";

  return "awaiting_confirmation";
}
