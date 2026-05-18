"use strict";

const {
  normalizeCommentText,
  isExplanationQuestion,
  hasConcreteChangeIntent,
  isVagueChangeRequest,
} = require("./plan-comment-intent.js");

const CHANGE_VERBS =
  /\b(incluir|adicionar|remover|alterar|mudar|atualizar|implementar|criar|refazer|expandir|reduzir|tirar|colocar|suportar|preparar)\b/i;

/**
 * Classificação determinística (sem respostas fixas por ID) — usa o texto do comentário e contexto.
 * @param {{ commentText: string, planExcerpt?: string }} input
 */
function classifyPlanCommentHeuristic(input) {
  const text = normalizeCommentText(input.commentText);
  const lower = text.toLowerCase();
  const plan = String(input.planExcerpt || "").toLowerCase();

  const ackOnly =
    /^(ok|certo|entendi|obrigad[oa]|perfeito|ótimo|otimo|valeu|anotado)[.!?\s]*$/i.test(text) ||
    (text.length < 40 &&
      /\b(só para avisar|anotar|registrar|fica claro)\b/i.test(lower) &&
      !CHANGE_VERBS.test(lower));

  /** @type {import("./plan-comment-analysis-schema.js").PlanCommentClassification} */
  let classification = "no_change";
  let requiresNewPlan = false;
  let requiresQuestions = false;
  /** @type {string[]} */
  let suggestedQuestions = [];
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
    reason = "Há intenção de mudança, mas faltam detalhes para atualizar o plano com segurança.";
    suggestedQuestions = buildSuggestedQuestions(lower);
    assistantResponse =
      "Este comentário precisa de novas perguntas antes de atualizar o plano. Responda aos pontos abaixo para eu refinar o plano na próxima etapa.";
  } else if (hasConcreteChangeIntent(text)) {
    classification = "update_plan";
    requiresNewPlan = true;
    planChangeSummary = summarizeChangeIntent(text);
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

/**
 * @param {string} text
 * @param {string} planLower
 */
function buildQuestionResponse(text, planLower) {
  const lower = text.toLowerCase();

  if (/\b(dificuldade|complexidade|média|media|alta|baixa|nível|nivel)\b/.test(lower)) {
    const fromPlan = extractComplexityExplanation(planLower);
    if (fromPlan) return fromPlan;
    return (
      "A dificuldade foi avaliada com base no escopo descrito no plano: quantos pontos de trabalho envolve " +
      "(por exemplo, componentes visuais, integração em ecrãs existentes, responsividade e temas). " +
      "Tende a média quando há mais de um elemento visual, mas ainda sem backend, persistência ou tempo real. " +
      "Se quiser que a classificação mude, indique explicitamente (por exemplo, «mude para dificuldade alta»)."
    );
  }

  if (/\b(prioridade|padrão|padrao)\b/.test(lower)) {
    return (
      "Prioridade e padrão de execução seguem o pedido da atividade e o que já foi clarificado. " +
      "Se algo parece desalinhado, diga qual critério gostaria de ver refletido no plano."
    );
  }

  if (/\b(risco)\b/.test(lower)) {
    const riskHint = extractRiskHint(planLower);
    return (
      riskHint ||
      "Os riscos listados no plano antecipam o que pode atrasar ou complicar a entrega neste recorte. " +
      "Posso detalhar qualquer item; mudanças de escopo exigem um pedido explícito de atualização."
    );
  }

  if (/\b(mini-?tarefas?|estratégia|estrategia|execução|execucao)\b/.test(lower)) {
    return (
      "A estratégia e a divisão em mini-tarefas refletem o tamanho e a clareza do escopo. " +
      "Execução direta num único passo é usada quando o trabalho é coeso; divisão aparece quando há entregas independentes."
    );
  }

  if (/\b(fora do escopo|escopo)\b/.test(lower)) {
    const hasScope = /\bfora do escopo\b/i.test(planLower) || /##\s+fora/i.test(planLower);
    return hasScope
      ? "Itens fora do escopo estão listados no plano para evitar trabalho não pedido. Se quiser incluir algo que está fora, posso atualizar o plano na próxima etapa."
      : "O plano separa o que será feito do que fica de fora. Se a dúvida for sobre incluir algo novo, posso atualizar o plano com esse ajuste.";
  }

  if (/\b(backend|api|servidor)\b/.test(lower)) {
    return (
      "O plano atual reflete o pedido registado na atividade. Se o backend ou API não aparecem, " +
      "é porque a solicitação inicial focou noutro recorte — posso incluir isso numa versão atualizada do plano, " +
      "se for o que pretende."
    );
  }

  if (/\b(por que|porquê|porque|pode)\b/.test(lower)) {
    return (
      "A estrutura do plano segue o entendimento da atividade e as respostas de clarificação. " +
      "Indique o ponto específico que quer aprofundar; se quiser alterar escopo ou critérios, descreva a mudança desejada."
    );
  }

  return (
    "Posso esclarecer qualquer secção do plano. O documento acima continua o plano ativo para aprovação; " +
    "se a resposta implicar mudança de escopo, preparo uma versão atualizada na etapa seguinte."
  );
}

/**
 * @param {string} planLower
 */
function extractComplexityExplanation(planLower) {
  const explMatch = planLower.match(
    /complexidade[^]*?(?:explicação|explicacao|explanation)[:\s]*([^\n#]{20,280})/i,
  );
  if (explMatch && explMatch[1]) {
    const snippet = explMatch[1].trim();
    if (snippet.length > 20) {
      return `No plano, a complexidade está assim justificada: ${snippet.charAt(0).toUpperCase()}${snippet.slice(1)}`;
    }
  }
  const levelMatch = planLower.match(/\b(nível|nivel|level)[:\s]*(baix[ao]|médi[ao]|media|alt[ao])/i);
  if (levelMatch) {
    return `O plano classifica a complexidade como ${levelMatch[2]}. Essa avaliação considera o escopo descrito (visual, integração, responsividade) e o que ficou explicitamente fora.`;
  }
  return null;
}

/**
 * @param {string} planLower
 */
function extractRiskHint(planLower) {
  const riskBlock = planLower.match(/riscos?[^]*?(?=##|$)/i);
  if (!riskBlock) return null;
  const first = riskBlock[0].match(/[-•]\s*([^\n]{12,120})/);
  if (first) {
    return `Um dos riscos registados é: «${first[1].trim()}». Serve para antecipar impacto neste recorte do plano.`;
  }
  return null;
}

/**
 * @param {string} lower
 * @returns {string[]}
 */
function buildSuggestedQuestions(lower) {
  const qs = [];
  if (/\b(anexo|upload|ficheiro|arquivo)\b/.test(lower)) {
    qs.push("Que tipos de anexo devem ser suportados nesta fase?");
    qs.push("O upload é obrigatório agora ou apenas preparação visual?");
  }
  if (/\b(backend|api)\b/.test(lower)) {
    qs.push("Que endpoints ou fluxos de backend devem entrar no escopo?");
  }
  if (/\b(visual|ui|interface|tela)\b/.test(lower)) {
    qs.push("O ajuste é só visual ou também comportamento/interações?");
  }
  if (qs.length === 0) {
    qs.push("Qual é o resultado mínimo aceitável após este ajuste?");
    qs.push("Há algo que deve permanecer explicitamente fora do escopo?");
  }
  return qs.slice(0, 4);
}

/**
 * @param {string} text
 */
function summarizeChangeIntent(text) {
  const trimmed = text.trim();
  if (trimmed.length <= 120) return trimmed;
  return `${trimmed.slice(0, 117).trim()}…`;
}

module.exports = {
  classifyPlanCommentHeuristic,
  buildQuestionResponse,
  buildSuggestedQuestions,
};
