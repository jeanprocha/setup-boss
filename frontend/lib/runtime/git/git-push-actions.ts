import { RUNTIME_API_PROXY_PREFIX } from "@/lib/api/runtime-config";
import type { RunGitSummaryDto } from "@/lib/api/runtime-types";
import {
  gitPushErrorMessage,
  parseGitPushApiErrorBody,
} from "@/lib/runtime/git/git-push-error-messages";
import { mapApiGitSummary } from "@/lib/runtime/adapters/map-run-git-summary";

const PUSH_TIMEOUT_MS = 120_000;

export class PublishGitBranchError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PublishGitBranchError";
    this.code = code;
  }
}

export type PublishGitBranchResult = {
  ok: true;
  message: string;
  branch: string | null;
  remote: string | null;
  remoteUrl: string | null;
  pushedAt: string | null;
  git: RunGitSummaryDto | null;
  idempotent: boolean;
};

type PublishJson = {
  ok?: boolean;
  message?: string;
  data?: {
    branch?: string;
    remote?: string;
    remoteUrl?: string;
    pushedAt?: string;
    git?: Record<string, unknown>;
  };
};

export async function postPublishGitBranch(
  runKey: string,
): Promise<PublishGitBranchResult> {
  const enc = encodeURIComponent(runKey);
  const path = `${RUNTIME_API_PROXY_PREFIX}/runs/${enc}/git-push`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PUSH_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: "POST",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const txt = await res.text();
    let json: unknown = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      throw new PublishGitBranchError(
        gitPushErrorMessage("git_unknown_error"),
        "git_unknown_error",
      );
    }
    if (!res.ok) {
      const parsed = parseGitPushApiErrorBody(json);
      throw new PublishGitBranchError(parsed.message, parsed.code);
    }
    const j = json as PublishJson;
    if (j.ok === false) {
      const parsed = parseGitPushApiErrorBody(json);
      throw new PublishGitBranchError(parsed.message, parsed.code);
    }
    const git = mapApiGitSummary(j.data?.git);
    return {
      ok: true,
      message:
        typeof j.message === "string" && j.message.trim()
          ? j.message.trim()
          : "Branch publicada no remoto.",
      branch: j.data?.branch != null ? String(j.data.branch) : git?.activityBranch ?? null,
      remote: j.data?.remote != null ? String(j.data.remote) : "origin",
      remoteUrl:
        j.data?.remoteUrl != null ? String(j.data.remoteUrl) : null,
      pushedAt: j.data?.pushedAt != null ? String(j.data.pushedAt) : null,
      git,
      idempotent: res.status === 200,
    };
  } catch (e) {
    if (e instanceof PublishGitBranchError) throw e;
    const abortMsg = e instanceof Error ? e.message : String(e);
    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      /aborted|timeout/i.test(abortMsg)
    ) {
      throw new PublishGitBranchError(
        gitPushErrorMessage("git_push_failed", "Timeout ao publicar branch."),
        "git_push_failed",
      );
    }
    throw new PublishGitBranchError(
      gitPushErrorMessage("git_unknown_error"),
      "git_unknown_error",
    );
  } finally {
    clearTimeout(timer);
  }
}
