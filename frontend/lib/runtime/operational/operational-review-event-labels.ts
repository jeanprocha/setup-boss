import { strategyActivityLabel } from "../observability/normalize-runtime-log-for-ui.ts";

const REVIEW_VALIDATION_LABELS: Record<string, string> = {
  execution_runtime_started: "Execução iniciada",
  execution_runtime_completed: "Execução concluída",
  execution_started: "Execução iniciada",
  execution_completed: "Execução concluída",
  execution_failed: "Falha na execução",
  execution_triggered: "Execução enfileirada",
  execution_enqueued: "Execução enfileirada",
  execution_ready: "Execução pronta",
  subtask_execution_initialized: "Mini-tarefa preparada",
  subtask_execution_started: "Mini-tarefa em execução",
  subtask_execution_completed: "Mini-tarefa concluída",
  subtask_execution_failed: "Falha numa mini-tarefa",
  operational_review_confirmed: "Review confirmado",
  git_branch_prepared: "Branch preparada",
  git_branch_pushed: "Branch publicada no remoto",
};

function looksLikeRawJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/**
 * Traduz códigos/eventos técnicos para copy de Review operacional.
 */
export function humanizeOperationalReviewValidationLabel(
  raw: string,
): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (looksLikeRawJson(t)) return "Registo técnico disponível na execução detalhada";
  const key = t.toLowerCase().replace(/^runtime\./, "");
  if (REVIEW_VALIDATION_LABELS[key]) return REVIEW_VALIDATION_LABELS[key];
  if (/^[a-z][a-z0-9_]+$/i.test(key) && key.includes("_")) {
    return strategyActivityLabel(key);
  }
  if (t.length > 160) return `${t.slice(0, 157)}…`;
  return t;
}
