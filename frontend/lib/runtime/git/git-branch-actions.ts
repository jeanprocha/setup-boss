import { RUNTIME_API_PROXY_PREFIX } from "@/lib/api/runtime-config";
import { RuntimeApiError } from "@/lib/api/runtime-errors";
import {
  parseGitBranchApiErrorBody,
  gitBranchErrorMessage,
} from "@/lib/runtime/git/git-branch-error-messages";
import type { RunGitSummaryDto } from "@/lib/api/runtime-types";

const PREPARE_BRANCH_TIMEOUT_MS = 120_000;

export class PrepareGitBranchError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PrepareGitBranchError";
    this.code = code;
  }
}

export type PrepareGitBranchResult = {
  ok: true;
  message: string;
  activityBranch: string | null;
  git: RunGitSummaryDto | null;
};

type PrepareGitBranchJson = {
  ok?: boolean;
  message?: string;
  data?: {
    git?: Record<string, unknown>;
    activityBranch?: string;
    currentBranch?: string;
  };
};

function mapGitFromResponse(data: PrepareGitBranchJson["data"]): RunGitSummaryDto | null {
  const gitRaw = data?.git;
  if (!gitRaw || typeof gitRaw !== "object" || Array.isArray(gitRaw)) return null;
  const out: RunGitSummaryDto = {};
  if (gitRaw.status != null) out.status = String(gitRaw.status);
  if (gitRaw.activityBranch != null) out.activityBranch = String(gitRaw.activityBranch);
  return Object.keys(out).length > 0 ? out : null;
}

export async function postPrepareGitBranch(
  runKey: string,
  activityBranch?: string | null,
): Promise<PrepareGitBranchResult> {
  const enc = encodeURIComponent(runKey);
  const path = `${RUNTIME_API_PROXY_PREFIX}/runs/${enc}/git-branch`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PREPARE_BRANCH_TIMEOUT_MS);
  const branch =
    activityBranch != null && String(activityBranch).trim()
      ? String(activityBranch).trim()
      : undefined;
  try {
    const res = await fetch(path, {
      method: "POST",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(branch ? { activityBranch: branch } : {}),
    });
    const txt = await res.text();
    let json: unknown = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      throw new PrepareGitBranchError(
        gitBranchErrorMessage("git_unknown_error"),
        "git_unknown_error",
      );
    }
    if (!res.ok) {
      const parsed = parseGitBranchApiErrorBody(json);
      throw new PrepareGitBranchError(parsed.message, parsed.code);
    }
    const j = json as PrepareGitBranchJson;
    if (j.ok === false) {
      const parsed = parseGitBranchApiErrorBody(json);
      throw new PrepareGitBranchError(parsed.message, parsed.code);
    }
    const git = mapGitFromResponse(j.data);
    const activityBranch =
      j.data?.activityBranch != null
        ? String(j.data.activityBranch)
        : git?.activityBranch ?? null;
    return {
      ok: true,
      message:
        typeof j.message === "string" && j.message.trim()
          ? j.message.trim()
          : "Branch de atividade preparada.",
      activityBranch,
      git,
    };
  } catch (e) {
    if (e instanceof PrepareGitBranchError) throw e;
    if (e instanceof RuntimeApiError) {
      throw new PrepareGitBranchError(
        gitBranchErrorMessage("git_unknown_error", e.message),
        "git_unknown_error",
      );
    }
    const abortMsg = e instanceof Error ? e.message : String(e);
    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      /aborted|timeout/i.test(abortMsg)
    ) {
      throw new PrepareGitBranchError(
        gitBranchErrorMessage("git_timeout"),
        "git_timeout",
      );
    }
    throw new PrepareGitBranchError(
      gitBranchErrorMessage("git_unknown_error"),
      "git_unknown_error",
    );
  } finally {
    clearTimeout(timer);
  }
}
