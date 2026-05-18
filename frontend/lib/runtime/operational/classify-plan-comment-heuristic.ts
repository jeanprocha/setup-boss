import type { PlanCommentClassification } from "@/lib/runtime/operational/plan-comment-analysis-types";

function normalizeCommentText(commentText: string): string {
  return String(commentText || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isInterrogative(text: string, lower: string): boolean {
  return (
    /\?\s*$/.test(text) ||
    /^(por que|porquê|porque|como|o que|qual|quais|onde|quando|pode|podia|seria|isso não|isso nao|não deveria|nao deveria|pode explicar|explique|entender|dúvida|duvida)\b/i.test(
      lower,
    )
  );
}

const PLAN_META_TOPIC =
  /\b(dificuldade|complexidade|prioridade|nível|nivel|risco|escopo|fora do escopo|mini-?tarefas?|estratégia|estrategia|critério|criterio|critérios|criterios|padrão|padrao|execução|execucao|backend|frontend|visual|anexo|upload|teste|deploy)\b/i;

const CHANGE_VERBS =
  /\b(incluir|adicionar|remover|alterar|mudar|atualizar|implementar|criar|refazer|expandir|reduzir|tirar|colocar|suportar|preparar)\b/i;

const SCOPE_SIGNALS =
  /\b(escopo|backend|frontend|api|anexo|upload|banco|teste|deploy|critério|fora do escopo|mini-tarefa)\b/i;

const VAGUE_SIGNALS =
  /\b(talvez|depende|não sei|nao sei|poderia|seria bom|avaliar|considerar|futuramente|eventualmente)\b/i;

const CLEAR_IMPERATIVE =
  /\b(mude|mudar|troque|trocar|inclua|adicione|remova|altere|implemente|atualize|suba|baixe|divida|dividir)\b/i;

const CLEAR_WANT_CHANGE =
  /\b(quero|preciso|gostaria)\s+(de\s+)?(incluir|adicionar|remover|alterar|mudar|implementar|criar|trocar|dividir)\b/i;

const SKEPTICAL_QUESTION =
  /\b(não deveria|nao deveria|por que não|porque não|como assim|não seria|nao seria)\b/i;

function hasClearChangeIntent(lower: string): boolean {
  return CLEAR_IMPERATIVE.test(lower) || CLEAR_WANT_CHANGE.test(lower);
}

function isPlanMetadataExplanationQuestion(text: string, lower: string): boolean {
  return (
    isInterrogative(text, lower) &&
    PLAN_META_TOPIC.test(lower) &&
    !hasClearChangeIntent(lower)
  );
}

function isSkepticalExplanationQuestion(text: string, lower: string): boolean {
  return (
    isInterrogative(text, lower) &&
    SKEPTICAL_QUESTION.test(lower) &&
    !hasClearChangeIntent(lower)
  );
}

function isExplanationQuestion(commentText: string): boolean {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isPlanMetadataExplanationQuestion(text, lower)) return true;
  if (isSkepticalExplanationQuestion(text, lower)) return true;
  return isInterrogative(text, lower) && !hasClearChangeIntent(lower);
}

function hasConcreteChangeIntent(commentText: string): boolean {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isExplanationQuestion(text)) return false;
  if (hasClearChangeIntent(lower)) return true;
  if (isInterrogative(text, lower)) {
    return /\b(quero|preciso|gostaria|favor|inclua|adicione|remova|altere|implemente|atualize)\b/i.test(
      lower,
    );
  }
  return CHANGE_VERBS.test(lower) || SCOPE_SIGNALS.test(lower);
}

function isVagueChangeRequest(commentText: string): boolean {
  const text = normalizeCommentText(commentText);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isExplanationQuestion(text)) return false;
  if (hasClearChangeIntent(lower)) return false;
  const wantsChange = isInterrogative(text, lower)
    ? /\b(quero|preciso|gostaria|favor|inclua|adicione|remova|altere|implemente|atualize)\b/i.test(
        lower,
      )
    : CHANGE_VERBS.test(lower) || SCOPE_SIGNALS.test(lower);
  return wantsChange && VAGUE_SIGNALS.test(lower);
}

/** Espelho do classificador heurístico do runtime (fallback offline). */
export function classifyPlanCommentHeuristic(input: {
  commentText: string;
  planExcerpt?: string;
}): {
  classification: PlanCommentClassification;
  reason: string;
  assistantResponse: string;
  requiresNewPlan: boolean;
  requiresQuestions: boolean;
  suggestedQuestions: string[];
  planChangeSummary: string;
  mode: "heuristic";
} {
  const text = normalizeCommentText(input.commentText);
  const lower = text.toLowerCase();
  const plan = String(input.planExcerpt || "").toLowerCase();

  const ackOnly =
    /^(ok|certo|entendi|obrigad[oa]|perfeito|ótimo|otimo|valeu|anotado)[.!?\s]*$/i.test(text) ||
    (text.length < 40 &&
      /\b(só para avisar|anotar|registrar|fica claro)\b/i.test(lower) &&
      !CHANGE_VERBS.test(lower));

  let classification: PlanCommentClassification = "no_change";
  let requiresNewPlan = false;
  let requiresQuestions = false;
  let suggestedQuestions: string[] = [];
  let planChangeSummary = "";
  let reason = "";
  let assistantResponse = "";

  if (ackOnly) {
    classification = "no_change";
    reason = "Comentário registrado sem pedido de alteração ao plano.";
    assistantResponse =
      "Registrei a sua observação. O plano atual permanece válido para aprovação; diga se quiser algum ajuste concreto.";
  } else if (isExplanationQuestion(text)) {
    classification = "question";
    reason = "O comentário pede esclarecimento sobre o plano, sem alterar o escopo.";
    assistantResponse = buildQuestionResponse(text, plan);
  } else if (isVagueChangeRequest(text)) {
    classification = "needs_questions";
    requiresQuestions = true;
    reason =
      "Há intenção de mudança, mas faltam detalhes para atualizar o plano com segurança.";
    suggestedQuestions = buildSuggestedQuestions(lower);
    assistantResponse =
      "Este comentário precisa de novas perguntas antes de atualizar o plano. Responda aos pontos abaixo para eu refinar o plano na próxima etapa.";
  } else if (hasConcreteChangeIntent(text)) {
    classification = "update_plan";
    requiresNewPlan = true;
    planChangeSummary =
      text.length <= 120 ? text : `${text.slice(0, 117).trim()}…`;
    reason = "O comentário pede alteração concreta ao escopo ou à execução.";
    assistantResponse =
      "O comentário altera o plano e será tratado na próxima etapa. O plano atual continua visível no histórico; uma versão atualizada será gerada abaixo quando o fluxo avançar.";
  } else {
    classification = "no_change";
    reason = "Observação sem impacto direto no escopo ou critérios.";
    assistantResponse =
      "Registrei a observação. Mantenho o plano atual; se quiser que algo mude no escopo ou na execução, indique o que incluir ou remover.";
  }

  return {
    classification,
    reason,
    assistantResponse,
    requiresNewPlan,
    requiresQuestions,
    suggestedQuestions,
    planChangeSummary,
    mode: "heuristic",
  };
}

function buildQuestionResponse(text: string, planLower: string): string {
  const lower = text.toLowerCase();

  if (/\b(dificuldade|complexidade|média|media|alta|baixa|nível|nivel)\b/.test(lower)) {
    return (
      "A dificuldade foi avaliada com base no escopo descrito no plano: quantos pontos de trabalho envolve " +
      "(por exemplo, componentes visuais, integração em ecrãs existentes, responsividade e temas). " +
      "Tende a média quando há mais de um elemento visual, mas ainda sem backend, persistência ou tempo real."
    );
  }

  if (/\b(fora do escopo|escopo)\b/.test(lower)) {
    const hasScope =
      /\bfora do escopo\b/i.test(planLower) || /##\s+fora/i.test(planLower);
    return hasScope
      ? "Itens fora do escopo estão listados no plano para evitar trabalho não pedido. Se quiser incluir algo que está fora, posso atualizar o plano na próxima etapa."
      : "O plano separa o que será feito do que fica de fora. Se a dúvida for sobre incluir algo novo, posso atualizar o plano com esse ajuste.";
  }

  if (/\b(backend|api|servidor)\b/.test(lower)) {
    return (
      "O plano atual reflete o pedido registado na atividade. Se o backend ou API não aparecem, " +
      "é porque a solicitação inicial focou noutro recorte — posso incluir isso numa versão atualizada do plano, se for o que pretende."
    );
  }

  return (
    "Posso esclarecer qualquer secção do plano. O documento acima continua o plano ativo para aprovação; " +
    "se a resposta implicar mudança de escopo, preparo uma versão atualizada na etapa seguinte."
  );
}

function buildSuggestedQuestions(lower: string): string[] {
  const qs: string[] = [];
  if (/\b(anexo|upload|ficheiro|arquivo)\b/.test(lower)) {
    qs.push("Que tipos de anexo devem ser suportados nesta fase?");
    qs.push("O upload é obrigatório agora ou apenas preparação visual?");
  }
  if (/\b(backend|api)\b/.test(lower)) {
    qs.push("Que endpoints ou fluxos de backend devem entrar no escopo?");
  }
  if (qs.length === 0) {
    qs.push("Qual é o resultado mínimo aceitável após este ajuste?");
    qs.push("Há algo que deve permanecer explicitamente fora do escopo?");
  }
  return qs.slice(0, 4);
}
