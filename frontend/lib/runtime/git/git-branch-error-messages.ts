/** Mensagens seguras para erros da API POST /runs/:id/git-branch */

const GIT_BRANCH_ERROR_MESSAGES: Record<string, string> = {
  git_dirty_worktree:
    "Existem alterações fora de docs/.IA no repositório. Faça commit, stash ou descarte antes de preparar a branch.",
  git_pull_failed:
    "O git pull --ff-only falhou. Resolva conflitos ou problemas de rede com o remoto antes de tentar de novo.",
  git_branch_exists:
    "A branch sugerida já existe localmente. Escolha outro nome ou remova a branch existente antes de continuar.",
  git_not_repository:
    "O projeto não é um repositório Git válido. Verifique o caminho do projeto no Mission Control.",
  git_branch_required: "Prepare a branch da atividade antes de executar.",
  git_branch_mismatch:
    "A branch actual não coincide com a branch preparada. Faça checkout da branch da atividade.",
  git_branch_unknown:
    "Não foi possível detectar a branch actual do repositório.",
  strategy_not_ready: "A strategy ainda não está pronta para preparar a branch.",
  git_timeout: "A operação Git excedeu o tempo limite. Tente novamente.",
  git_unknown_error: "Não foi possível preparar a branch. Tente novamente ou verifique o repositório.",
};

export function gitBranchErrorMessage(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  const c = code != null ? String(code).trim() : "";
  if (c && GIT_BRANCH_ERROR_MESSAGES[c]) {
    return GIT_BRANCH_ERROR_MESSAGES[c];
  }
  const fb = fallback != null ? String(fallback).trim() : "";
  if (fb && !looksLikeStackTrace(fb)) {
    return fb.length > 240 ? `${fb.slice(0, 239)}…` : fb;
  }
  return GIT_BRANCH_ERROR_MESSAGES.git_unknown_error;
}

function looksLikeStackTrace(text: string): boolean {
  return /^\s*at\s+/m.test(text) || /\n\s+at\s+/m.test(text);
}

export function parseGitBranchApiErrorBody(json: unknown): {
  code: string;
  message: string;
} {
  if (!json || typeof json !== "object") {
    return {
      code: "git_unknown_error",
      message: GIT_BRANCH_ERROR_MESSAGES.git_unknown_error,
    };
  }
  const row = json as Record<string, unknown>;
  let code = "";
  if (typeof row.error === "string" && row.error.trim()) {
    code = row.error.trim();
  } else if (
    row.error &&
    typeof row.error === "object" &&
    !Array.isArray(row.error) &&
    typeof (row.error as { code?: string }).code === "string"
  ) {
    code = String((row.error as { code: string }).code).trim();
  }
  const rawMessage =
    typeof row.message === "string"
      ? row.message
      : row.error &&
          typeof row.error === "object" &&
          !Array.isArray(row.error) &&
          typeof (row.error as { message?: string }).message === "string"
        ? String((row.error as { message: string }).message)
        : "";
  return {
    code: code || "git_unknown_error",
    message: gitBranchErrorMessage(code, rawMessage),
  };
}
