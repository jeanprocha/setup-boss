import type { RunGitSummaryDto } from "../../api/runtime-types.ts";
import type { ExecuteAvailability } from "../orchestration/orchestration-types.ts";

export type ExecutionAutoStartBlockView = {
  headline: string;
  body: string;
  reason: string | null;
};

/** Mensagem operacional quando auto-start está bloqueado (sem códigos internos na UI). */
export function formatExecutionAutoStartBlockMessage(input: {
  availability: ExecuteAvailability;
  git?: RunGitSummaryDto | null;
}): ExecutionAutoStartBlockView | null {
  const { availability, git } = input;
  if (availability.canExecute) return null;

  const reason = availability.reason;
  const expected = git?.activityBranch?.trim() || null;
  const current = git?.currentBranch?.trim() || null;

  if (reason === "git_branch_mismatch") {
    const lines = [
      "A execução não pode iniciar porque o projeto está em outra branch.",
      "",
      expected ? `Branch esperada:\n${expected}` : null,
      current ? `Branch atual:\n${current}` : null,
      "",
      "Ação necessária:\nvolte para a branch correta ou execute novamente o versionamento.",
    ].filter((l): l is string => l != null);

    return {
      headline: "Branch Git não coincide",
      body: lines.join("\n"),
      reason,
    };
  }

  if (reason === "git_branch_required") {
    return {
      headline: "Branch da atividade em falta",
      body: [
        "A execução não pode iniciar sem a branch da atividade preparada.",
        expected ? `\nBranch esperada:\n${expected}` : "",
        "\nAção necessária:\nconclua o versionamento ou prepare a branch novamente.",
      ]
        .filter(Boolean)
        .join("\n"),
      reason,
    };
  }

  const generic =
    availability.message?.trim() ||
    "A execução automática está temporariamente indisponível. Verifique o estado da atividade e tente novamente.";

  return {
    headline: "Execução bloqueada",
    body: generic,
    reason: reason ?? null,
  };
}
