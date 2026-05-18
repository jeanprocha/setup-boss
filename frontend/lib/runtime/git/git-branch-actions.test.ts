import assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import {
  postPrepareGitBranch,
  PrepareGitBranchError,
} from "./git-branch-actions.ts";

describe("postPrepareGitBranch", () => {
  const originalFetch = globalThis.fetch;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("chama POST /runs/:id/git-branch com body vazio", async () => {
    let url = "";
    let method = "";
    let body = "";
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      method = init?.method ?? "GET";
      body = init?.body != null ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Branch de atividade preparada.",
          data: {
            git: { status: "git_branch_ready", activityBranch: "setup-boss/20260516-x" },
            activityBranch: "setup-boss/20260516-x",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const r = await postPrepareGitBranch("20260516-run-1");
    assert.match(url, /\/runs\/20260516-run-1\/git-branch$/);
    assert.equal(method, "POST");
    assert.equal(body, "{}");
    assert.equal(r.activityBranch, "setup-boss/20260516-x");
    assert.equal(r.git?.status, "git_branch_ready");
  });

  it("envia activityBranch no body quando fornecido", async () => {
    let body = "";
    globalThis.fetch = mock.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = init?.body != null ? String(init.body) : "";
      return new Response(
        JSON.stringify({
          ok: true,
          data: { git: { status: "git_branch_ready" }, activityBranch: "setup-boss/custom" },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await postPrepareGitBranch("run-1", "setup-boss/custom");
    assert.equal(body, JSON.stringify({ activityBranch: "setup-boss/custom" }));
  });

  it("erro git_dirty_worktree mensagem segura", async () => {
    globalThis.fetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "git_dirty_worktree",
          message: "working tree dirty",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await assert.rejects(
      () => postPrepareGitBranch("run-x"),
      (e: unknown) => {
        assert.ok(e instanceof PrepareGitBranchError);
        assert.equal(e.code, "git_dirty_worktree");
        assert.match(e.message, /docs\/\.IA/i);
        return true;
      },
    );
  });
});
