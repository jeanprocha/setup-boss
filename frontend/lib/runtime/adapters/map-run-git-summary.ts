import type { ApiJobSummary, RunGitSummaryDto } from "@/lib/api/runtime-types";

const GIT_EXECUTE_GUARD_CODES = new Set([
  "git_branch_required",
  "git_branch_mismatch",
  "git_not_repository",
  "git_branch_unknown",
]);

export function mapApiGitSummary(raw: unknown): RunGitSummaryDto | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const out: RunGitSummaryDto = {};

  if (row.status != null && String(row.status).trim()) {
    out.status = String(row.status).trim();
  }
  if (row.activityBranch != null && String(row.activityBranch).trim()) {
    out.activityBranch = String(row.activityBranch).trim();
  }
  if (row.errorCode != null && String(row.errorCode).trim()) {
    out.errorCode = String(row.errorCode).trim();
  }
  if (row.errorMessage != null && String(row.errorMessage).trim()) {
    out.errorMessage = String(row.errorMessage).trim();
  }
  const block = row.executeBlockCode != null ? String(row.executeBlockCode).trim() : "";
  if (block && GIT_EXECUTE_GUARD_CODES.has(block)) {
    out.executeBlockCode = block;
  }
  if (row.currentBranch != null && String(row.currentBranch).trim()) {
    out.currentBranch = String(row.currentBranch).trim();
  }
  if (row.pushStatus != null && String(row.pushStatus).trim()) {
    out.pushStatus = String(row.pushStatus).trim();
  }
  if (row.pushRemote != null && String(row.pushRemote).trim()) {
    out.pushRemote = String(row.pushRemote).trim();
  }
  if (row.pushBranch != null && String(row.pushBranch).trim()) {
    out.pushBranch = String(row.pushBranch).trim();
  }
  if (row.pushedAt != null && String(row.pushedAt).trim()) {
    out.pushedAt = String(row.pushedAt).trim();
  }
  if (row.pushErrorMessage != null && String(row.pushErrorMessage).trim()) {
    out.pushErrorMessage = String(row.pushErrorMessage).trim();
  }

  return Object.keys(out).length > 0 ? out : null;
}

export function resolveBranchHintFromJob(job: ApiJobSummary): string | null {
  if (typeof job.branchHint === "string" && job.branchHint.trim()) {
    return job.branchHint.trim();
  }
  const git = mapApiGitSummary(job.git);
  if (git?.status === "git_branch_ready" && git.activityBranch?.trim()) {
    return git.activityBranch.trim();
  }
  return null;
}
