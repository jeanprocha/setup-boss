"use strict";

/**
 * Detecção de intenção em comentários ao plano (heurística + reconciliação pós-LLM).
 * @param {string} commentText
 */
function normalizeCommentText(commentText) {
  return String(commentText || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} text
 * @param {string} lower
 */
function isInterrogative(text, lower) {
  return (
    /\?\s*$/.test(text) ||
    /^(por que|porquê|porque|como|o que|qual|quais|onde|quando|pode|podia|seria|isso não|isso nao|não deveria|nao deveria|pode explicar|explique|entender|dúvida|duvida)\b/i.test(
      lower,
    )
  );
}

/** Tópicos do plano sobre os quais perguntas costumam ser explicativas. */
const PLAN_META_TOPIC =
  /\b(dificuldade|complexidade|prioridade|nível|nivel|risco|escopo|fora do escopo|mini-?tarefas?|estratégia|estrategia|critério|criterio|critérios|criterios|padrão|padrao|execução|execucao|backend|frontend|visual|anexo|upload|teste|deploy)\b/i;

const CHANGE_VERBS =
  /\b(incluir|adicionar|remover|alterar|mudar|mude|trocar|troque|atualizar|implementar|criar|refazer|expandir|reduzir|tirar|colocar|suportar|preparar|dividir|divida)\b/i;

const SCOPE_SIGNALS =
  /\b(escopo|backend|frontend|api|anexo|upload|banco|teste|deploy|critério|fora do escopo|mini-tarefa)\b/i;

const VAGUE_SIGNALS =
  /\b(talvez|depende|não sei|nao sei|poderia|seria bom|avaliar|considerar|futuramente|eventualmente)\b/i;

const REQUEST_CHANGE =
  /\b(quero|preciso|gostaria|favor|inclua|adicione|remova|altere|implemente|atualize)\b/i;

const CLEAR_IMPERATIVE =
  /\b(mude|mudar|troque|trocar|inclua|adicione|remova|altere|implemente|atualize|suba|baixe|divida|dividir)\b/i;

const CLEAR_WANT_CHANGE =
  /\b(quero|preciso|gostaria)\s+(de\s+)?(incluir|adicionar|remover|alterar|mudar|implementar|criar|trocar|dividir)\b/i;

const SKEPTICAL_QUESTION =
  /\b(não deveria|nao deveria|por que não|porque não|como assim|não seria|nao seria)\b/i;

/**
 * Pedido explícito de alteração (imperativo ou "quero incluir…").
 * @param {string} lower
 */
function hasClearChangeIntent(lower) {
  return CLEAR_IMPERATIVE.test(lower) || CLEAR_WANT_CHANGE.test(lower);
}

/**
 * Pergunta sobre metadados do plano sem pedido claro de mudança.
 * @param {string} text
 * @param {string} lower
 */
function isPlanMetadataExplanationQuestion(text, lower) {
  return (
    isInterrogative(text, lower) &&
    PLAN_META_TOPIC.test(lower) &&
    !hasClearChangeIntent(lower)
  );
}

/**
 * @param {string} text
 * @param {string} lower
 */
function isSkepticalExplanationQuestion(text, lower) {
  return (
    isInterrogative(text, lower) &&
    SKEPTICAL_QUESTION.test(lower) &&
    !hasClearChangeIntent(lower)
  );
}

/**
 * Pergunta explicativa (não pedido de alteração).
 * @param {string} commentText
 */
function isExplanationQuestion(commentText) {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isPlanMetadataExplanationQuestion(text, lower)) return true;
  if (isSkepticalExplanationQuestion(text, lower)) return true;
  return isInterrogative(text, lower) && !hasClearChangeIntent(lower);
}

/**
 * @param {string} commentText
 */
function hasConcreteChangeIntent(commentText) {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isExplanationQuestion(text)) return false;
  if (hasClearChangeIntent(lower)) return true;
  if (isInterrogative(text, lower)) return REQUEST_CHANGE.test(lower);
  return CHANGE_VERBS.test(lower) || SCOPE_SIGNALS.test(lower);
}

/**
 * @param {string} commentText
 */
function isVagueChangeRequest(commentText) {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isExplanationQuestion(text)) return false;
  if (hasClearChangeIntent(lower)) return false;
  const wantsChange = isInterrogative(text, lower)
    ? REQUEST_CHANGE.test(lower)
    : CHANGE_VERBS.test(lower) || SCOPE_SIGNALS.test(lower);
  return wantsChange && VAGUE_SIGNALS.test(lower);
}

/**
 * Corrige classificação LLM quando o comentário é claramente explicativo.
 * @param {object} analysis
 * @param {string} commentText
 * @param {string} [planExcerpt]
 * @param {{ buildQuestionResponse: (text: string, plan: string) => string }} helpers
 */
function reconcilePlanCommentClassification(
  analysis,
  commentText,
  planExcerpt,
  helpers,
) {
  if (!analysis || !isExplanationQuestion(commentText)) return analysis;
  if (analysis.classification === "question") return analysis;
  if (
    analysis.classification !== "needs_questions" &&
    analysis.classification !== "update_plan"
  ) {
    return analysis;
  }

  const text = normalizeCommentText(commentText);
  const plan = String(planExcerpt || "").toLowerCase();
  return {
    ...analysis,
    classification: "question",
    reason: "O comentário pede esclarecimento sobre o plano, sem alterar o escopo.",
    assistantResponse: helpers.buildQuestionResponse(text, plan),
    requiresNewPlan: false,
    requiresQuestions: false,
    suggestedQuestions: [],
    planChangeSummary: "",
    mode: analysis.mode === "llm" ? "llm_reconciled" : analysis.mode,
  };
}

module.exports = {
  normalizeCommentText,
  isInterrogative,
  hasClearChangeIntent,
  isPlanMetadataExplanationQuestion,
  isSkepticalExplanationQuestion,
  isExplanationQuestion,
  hasConcreteChangeIntent,
  isVagueChangeRequest,
  reconcilePlanCommentClassification,
  PLAN_META_TOPIC,
  CHANGE_VERBS,
  SCOPE_SIGNALS,
  VAGUE_SIGNALS,
};
