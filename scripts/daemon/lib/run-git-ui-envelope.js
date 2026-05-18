"use strict";

const path = require("path");

const { resolveOutputDir } = require("../../../core/run-resolver");
const { mapRunGitForUi } = require("../../../core/map-run-git-for-ui");
const { isGitRepository, getCurrentBranch } = require("../../../core/git-exec");
const { validateGitExecuteGate } = require("../../../core/validate-git-execute-gate");
const { readRunGitState } = require("./run-git-branch-api");

/**
 * Resolve branchHint + git para listagens/resumo de job (sem stack trace).
 *
 * @param {{
 *   runId?: string|null,
 *   projectRoot?: string|null,
 * }} input
 * @returns {{ branchHint: string|null, git: Record<string, unknown>|null }}
 */
function resolveRunGitUiEnvelope(input) {
  const runId = input.runId != null ? String(input.runId).trim() : "";
  const projectRoot =
    input.projectRoot != null ? path.resolve(String(input.projectRoot).trim()) : "";

  if (!runId || !projectRoot) {
    return { branchHint: null, git: null };
  }

  let outputDir;
  try {
    outputDir = path.resolve(resolveOutputDir(runId, { warnLegacy: false }));
  } catch {
    return { branchHint: null, git: null };
  }

  const gitState = readRunGitState(outputDir);

  let executeBlockCode = null;
  let currentBranch = null;
  try {
    const gate = validateGitExecuteGate({ projectRoot, gitState });
    if (!gate.ok) {
      executeBlockCode = gate.code;
      if (isGitRepository(projectRoot)) {
        try {
          currentBranch = getCurrentBranch(projectRoot);
        } catch {
          /* */
        }
      }
    }
  } catch {
    executeBlockCode = "git_branch_unknown";
  }

  return mapRunGitForUi(gitState, { executeBlockCode, currentBranch });
}

module.exports = {
  resolveRunGitUiEnvelope,
};
