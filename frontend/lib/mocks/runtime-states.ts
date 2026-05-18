export type RuntimeUiState =
  | "running"
  | "waiting_clarification_questions"
  | "waiting_clarification_answers"
  | "waiting_approval"
  | "blocked"
  | "failed"
  | "correcting"
  | "retrying"
  | "recovered"
  | "success"
  | "warning";

export const runtimeStateLabels: Record<RuntimeUiState, string> = {
  running: "Em execução",
  waiting_clarification_questions: "Clarificação (sem perguntas)",
  waiting_clarification_answers: "Clarificação (respostas)",
  waiting_approval: "Aprovação",
  blocked: "Bloqueado",
  failed: "Falhou",
  correcting: "Correcção",
  retrying: "Retry",
  recovered: "Recuperado",
  success: "OK",
  warning: "Alerta",
};
