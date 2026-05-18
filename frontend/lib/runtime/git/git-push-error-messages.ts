/** Mensagens seguras para POST /runs/:id/git-push */

const MESSAGES: Record<string, string> = {
  git_push_disabled: "Publicação automática desactivada — use o botão Publicar branch.",
  git_push_commit_required:
    "Não foi possível publicar. Confirme o versionamento e o estado da branch.",
  git_push_branch_required: "Prepare a branch na fase de Versionamento antes de publicar.",
  git_push_branch_mismatch:
    "O repositório não está na branch da atividade. Faça checkout e tente novamente.",
  git_push_no_remote:
    "Remote origin não configurado. Configure o remoto Git no projecto-alvo.",
  git_push_protected_branch: "Push bloqueado: branch protegida.",
  git_push_failed: "Falha ao publicar a branch. Verifique credenciais e remoto.",
  git_not_repository: "O projecto não é um repositório Git.",
  output_unavailable: "Output da corrida indisponível.",
  project_not_found: "Projecto da corrida não encontrado.",
  git_unknown_error: "Não foi possível publicar a branch.",
};

export function gitPushErrorMessage(
  code: string,
  fallback?: string | null,
): string {
  return MESSAGES[code] ?? fallback ?? MESSAGES.git_unknown_error;
}

export function parseGitPushApiErrorBody(json: unknown): {
  code: string;
  message: string;
} {
  if (!json || typeof json !== "object") {
    return { code: "git_unknown_error", message: MESSAGES.git_unknown_error };
  }
  const o = json as Record<string, unknown>;
  const code =
    (o.error != null && typeof o.error === "string" ? o.error : null) ||
    (o.error &&
    typeof o.error === "object" &&
    "code" in o.error &&
    (o.error as { code?: string }).code
      ? String((o.error as { code: string }).code)
      : null) ||
    "git_unknown_error";
  const msg =
    typeof o.message === "string" && o.message.trim()
      ? o.message.trim()
      : typeof o.error === "object" &&
          o.error &&
          "message" in o.error &&
          typeof (o.error as { message?: string }).message === "string"
        ? String((o.error as { message: string }).message)
        : gitPushErrorMessage(code);
  return { code, message: msg };
}
