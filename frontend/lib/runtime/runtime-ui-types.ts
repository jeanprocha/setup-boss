export type RuntimeUiState =
  | "running"
  /** Clarificação sem perguntas (diagnóstico — não é gate de aprovação) */
  | "waiting_clarification_questions"
  /** Há perguntas — aguarda respostas HITL */
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
