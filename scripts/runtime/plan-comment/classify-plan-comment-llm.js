"use strict";

const OpenAI = require("openai");
const { getModelForStep } = require("../../../core/llm-client");
const {
  isClassification,
  normalizeAnalysisDoc,
} = require("./plan-comment-analysis-schema.js");
const {
  classifyPlanCommentHeuristic,
  buildQuestionResponse,
} = require("./classify-plan-comment-heuristic.js");
const { reconcilePlanCommentClassification } = require("./plan-comment-intent.js");

/**
 * @param {{ commentText: string, planExcerpt?: string, llmClient?: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } }|null }} input
 */
async function classifyPlanCommentLlm(input) {
  const commentText = String(input.commentText || "").trim();
  if (!commentText) {
    return {
      ok: false,
      error: { code: "plan_comment_empty", message: "Comentário vazio." },
    };
  }

  /** @type {{ responses: { create: (opts: object) => Promise<{ output_text?: string }> } }} */
  let client = input.llmClient || null;
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: true,
        analysis: classifyPlanCommentHeuristic({
          commentText,
          planExcerpt: input.planExcerpt,
        }),
        fallback: "no_api_key",
      };
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const planExcerpt = String(input.planExcerpt || "").slice(0, 10000);
  const prompt = `Analisa o comentário do utilizador sobre o plano operacional e responde APENAS com JSON válido (sem markdown).

Classificações possíveis:
- question: dúvida ou pedido de explicação sobre o plano, SEM alterar escopo
- no_change: observação sem impacto no plano
- update_plan: pedido CLARO de alteração ao plano
- needs_questions: pedido de alteração ambíguo (intenção de mudar, mas faltam dados)

Campos obrigatórios no JSON:
{
  "classification": "question|no_change|update_plan|needs_questions",
  "reason": "frase curta em português",
  "assistantResponse": "resposta humana em português para o utilizador",
  "requiresNewPlan": boolean,
  "requiresQuestions": boolean,
  "suggestedQuestions": ["pergunta 1", ...],
  "planChangeSummary": "resumo do pedido de mudança ou string vazia"
}

Regras gerais:
- assistantResponse em tom direto, sem mencionar JSON, APIs ou fases internas
- requiresNewPlan true só para update_plan
- requiresQuestions true só para needs_questions
- suggestedQuestions só quando needs_questions (1 a 4 perguntas)
- Comentário interrogativo NÃO é automaticamente needs_questions

Regra CRÍTICA — classificar como question (explicação, manter plano):
Perguntas sobre complexidade/dificuldade, prioridade, nível de execução, risco, escopo, fora do escopo, mini-tarefas, estratégia ou critérios de conclusão, quando NÃO pedem mudança explícita.
Exemplos question:
- "pode dificuldade média?"
- "por que dificuldade média?"
- "isso não deveria ser alta?"
- "por que backend ficou fora?"
- "o que significa risco visual?"
Para question: explica com base no plano; requiresNewPlan=false; requiresQuestions=false; suggestedQuestions=[]

Regra — classificar como update_plan ou needs_questions:
Só quando há intenção CLARA de alterar o plano.
Exemplos update_plan: "mude para dificuldade alta", "quero incluir backend", "remova dark mode", "divida em mini-tarefas"
Exemplo needs_questions: "talvez incluir backend futuramente" (intenção vaga de mudança)

Plano (extracto):
${planExcerpt || "(sem extracto disponível)"}

Comentário do utilizador:
${commentText}`;

  const model = getModelForStep("plan_comment_analysis") || getModelForStep("plan_refine");

  let rawText = "";
  try {
    const response = await client.responses.create({
      model,
      input: prompt,
    });
    rawText = String(response.output_text || "").trim();
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    return {
      ok: true,
      analysis: classifyPlanCommentHeuristic({
        commentText,
        planExcerpt: input.planExcerpt,
      }),
      fallback: "llm_error",
      llmError: message,
    };
  }

  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return {
      ok: true,
      analysis: classifyPlanCommentHeuristic({
        commentText,
        planExcerpt: input.planExcerpt,
      }),
      fallback: "parse_failed",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: true,
      analysis: classifyPlanCommentHeuristic({
        commentText,
        planExcerpt: input.planExcerpt,
      }),
      fallback: "json_invalid",
    };
  }

  if (!isClassification(parsed.classification)) {
    return {
      ok: true,
      analysis: classifyPlanCommentHeuristic({
        commentText,
        planExcerpt: input.planExcerpt,
      }),
      fallback: "classification_invalid",
    };
  }

  const normalized = normalizeAnalysisDoc(
    {
      ...parsed,
      mode: "llm",
      analyzedAt: new Date().toISOString(),
    },
    "pending",
  );

  if (!normalized) {
    return {
      ok: true,
      analysis: classifyPlanCommentHeuristic({
        commentText,
        planExcerpt: input.planExcerpt,
      }),
      fallback: "normalize_failed",
    };
  }

  const reconciled = reconcilePlanCommentClassification(
    {
      classification: normalized.classification,
      reason: normalized.reason,
      assistantResponse: normalized.assistantResponse,
      requiresNewPlan: normalized.requiresNewPlan,
      requiresQuestions: normalized.requiresQuestions,
      suggestedQuestions: normalized.suggestedQuestions,
      planChangeSummary: normalized.planChangeSummary,
      mode: "llm",
    },
    commentText,
    input.planExcerpt,
    { buildQuestionResponse },
  );

  return {
    ok: true,
    analysis: reconciled,
  };
}

/**
 * @param {string} raw
 */
function extractJsonObject(raw) {
  const t = String(raw || "").trim();
  if (t.startsWith("{")) return t;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) return fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

module.exports = {
  classifyPlanCommentLlm,
  extractJsonObject,
};
