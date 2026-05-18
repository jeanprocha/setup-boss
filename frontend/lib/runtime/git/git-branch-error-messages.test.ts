import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gitBranchErrorMessage,
  parseGitBranchApiErrorBody,
} from "./git-branch-error-messages.ts";

describe("gitBranchErrorMessage", () => {
  it("git_dirty_worktree mensagem segura", () => {
    const msg = gitBranchErrorMessage("git_dirty_worktree");
    assert.match(msg, /docs\/\.IA/i);
    assert.doesNotMatch(msg, /at\s+/);
  });

  it("código desconhecido usa mensagem genérica", () => {
    const msg = gitBranchErrorMessage("unknown_code", "stack\n    at fn");
    assert.match(msg, /Não foi possível preparar/i);
    assert.doesNotMatch(msg, /at\s+fn/);
  });
});

describe("parseGitBranchApiErrorBody", () => {
  it("parse error string no topo", () => {
    const p = parseGitBranchApiErrorBody({
      ok: false,
      error: "git_pull_failed",
      message: "detalhe técnico",
    });
    assert.equal(p.code, "git_pull_failed");
    assert.match(p.message, /pull/i);
  });
});
