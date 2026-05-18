"use strict";

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const { loadAgent } = require("../../../core/agent-metadata");
const { getModelForStep } = require("../../../core/llm-client");

const MARKER = "---CLARIFICATION_QUESTIONS_JSON---";
const QUESTIONS_FILE = "clarification-questions.json";
const MAX_QUESTIONS = 7;
const VALID_TYPES = new Set(["free_text", "single_choice", "confirm"]);

/**
 * @param {string} repoRoot
 */
function agentPath(repoRoot) {
  return path.join(repoRoot, "agents", "task-clarify.md");
}

/**
 * @param {string} outputText
 * @returns {{ ok: true, payload: { questions: object[], recommendations: unknown[] } } | { ok: false, error: { code: string, message: string } }}
 */
function parseClarificationQuestionsResponse(outputText) {
  const raw = String(outputText ?? "");
  const trimmedStart = raw.replace(/^\uFEFF/, "").trimStart();
  const idx = trimmedStart.indexOf(MARKER);
  if (idx === -1) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_PARSE_MISSING_MARKER",
        message: `Marcador obrigatório em falta: ${MARKER}`,
      },
    };
  }
  if (idx !== 0) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_PARSE_LEADING_NOISE",
        message: `A resposta deve começar por ${MARKER} (sem texto antes).`,
      },
    };
  }
  const after = trimmedStart.slice(idx + MARKER.length).trim();
  if (!after) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_PARSE_EMPTY_JSON",
        message: "JSON em falta após o marcador.",
      },
    };
  }
  let payload;
  try {
    payload = JSON.parse(after);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_PARSE_JSON",
        message: `JSON inválido: ${msg}`,
      },
    };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_PARSE_ROOT",
        message: "O JSON raiz deve ser um objeto.",
      },
    };
  }
  return { ok: true, payload };
}

/**
 * @param {unknown} payload
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateClarificationQuestions(payload) {
  /** @type {string[]} */
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, errors: ["Raiz deve ser um objeto."] };
  }
  const questions = /** @type {unknown} */ (/** @type {any} */ (payload).questions);
  if (!Array.isArray(questions)) {
    errors.push("Campo 'questions' deve ser um array.");
    return { ok: false, errors };
  }
  if (questions.length > MAX_QUESTIONS) {
    errors.push(`No máximo ${MAX_QUESTIONS} perguntas; recebidas ${questions.length}.`);
  }
  const seenIds = new Set();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const prefix = `questions[${i}]`;
    if (!q || typeof q !== "object" || Array.isArray(q)) {
      errors.push(`${prefix}: cada pergunta deve ser um objeto.`);
      continue;
    }
    const id = /** @type {any} */ (q).id;
    if (id == null || String(id).trim() === "") {
      errors.push(`${prefix}: 'id' obrigatório e não vazio.`);
    } else {
      const sid = String(id).trim();
      if (seenIds.has(sid)) {
        errors.push(`${prefix}: id duplicado '${sid}'.`);
      }
      seenIds.add(sid);
    }
    const prompt = /** @type {any} */ (q).prompt;
    if (prompt == null || String(prompt).trim() === "") {
      errors.push(`${prefix}: 'prompt' obrigatório.`);
    }
    const type = /** @type {any} */ (q).type;
    if (type == null || !VALID_TYPES.has(String(type))) {
      errors.push(
        `${prefix}: 'type' deve ser um de: free_text, single_choice, confirm.`,
      );
    }
    if (typeof /** @type {any} */ (q).blocking !== "boolean") {
      errors.push(`${prefix}: 'blocking' deve ser boolean.`);
    }
    const options = /** @type {any} */ (q).options;
    if (options != null && !Array.isArray(options)) {
      errors.push(`${prefix}: 'options' deve ser um array.`);
    } else if (String(type) === "single_choice") {
      const arr = Array.isArray(options) ? options : [];
      const nonEmpty = arr.filter((o) => o != null && String(o).trim() !== "");
      if (nonEmpty.length === 0) {
        errors.push(
          `${prefix}: type 'single_choice' exige 'options' não vazio.`,
        );
      }
    }
    const evidence = /** @type {any} */ (q).evidence_refs;
    if (evidence != null && !Array.isArray(evidence)) {
      errors.push(`${prefix}: 'evidence_refs' deve ser um array quando presente.`);
    }
  }
  const rec = /** @type {any} */ (payload).recommendations;
  if (rec !== undefined && !Array.isArray(rec)) {
    errors.push("Campo 'recommendations' deve ser um array quando presente.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
}

/**
 * @param {{
 *   repoRoot: string,
 *   taskDiscovery: string,
 *   taskPlanInitial: string,
 *   intakeClassification: object,
 *   intakeDiscoveryAnalysis: object,
 * }} p
 * @returns {string}
 */
function buildClarifyPrompt(p) {
  const { content: agentContent } = loadAgent(agentPath(p.repoRoot));
  return `${agentContent}

## ARTEFACTOS (conteúdo integral)

### task-discovery.md

\`\`\`markdown
${p.taskDiscovery}
\`\`\`

### task-plan-initial.md

\`\`\`markdown
${p.taskPlanInitial}
\`\`\`

### intake-classification.json

\`\`\`json
${JSON.stringify(p.intakeClassification, null, 2)}
\`\`\`

### intake-discovery-analysis.json

\`\`\`json
${JSON.stringify(p.intakeDiscoveryAnalysis, null, 2)}
\`\`\`

---

Segue o contrato de saída (marcador \`${MARKER}\` sozinho numa linha, depois só o JSON).`;
}

/**
 * @param {{
 *   outputDir: string,
 *   repoRoot: string,
 *   skipLlm: boolean,
 *   llmClient: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } }|null,
 * }} p
 * @returns {Promise<{
 *   ok: true,
 *   questionsCount: number,
 *   recommendationsCount: number,
 *   rawText?: string,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 *   rawText?: string,
 * }>}
 */
async function generateClarificationQuestions(p) {
  const outputDir = path.resolve(p.outputDir);
  const outFile = path.join(outputDir, QUESTIONS_FILE);
  const generatedAt = new Date().toISOString();
  const round = 1;

  if (p.skipLlm) {
    const clsPath = path.join(outputDir, "intake-classification.json");
    let needsCtx = false;
    try {
      if (fs.existsSync(clsPath)) {
        const c = JSON.parse(fs.readFileSync(clsPath, "utf-8"));
        needsCtx =
          c &&
          typeof c === "object" &&
          String(c.classification || "").trim() === "needs_context";
      }
    } catch (_) {
      /* */
    }

    if (needsCtx) {
      const {
        buildLocalFallbackQuestionsDocument,
      } = require("./local-fallback-questions");
      const doc = buildLocalFallbackQuestionsDocument();
      const validated = validateClarificationQuestions(doc);
      if (!validated.ok) {
        const msg =
          validated.errors && validated.errors.length
            ? validated.errors.join(" ")
            : "Validação de perguntas (fallback local) falhou.";
        return {
          ok: false,
          error: { code: "CLARIFY_QUESTIONS_VALIDATION", message: msg },
        };
      }
      fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf-8");
      return {
        ok: true,
        questionsCount: doc.questions.length,
        recommendationsCount: Array.isArray(doc.recommendations)
          ? doc.recommendations.length
          : 0,
      };
    }

    const doc = {
      schema_version: "1.0.0",
      generated_at: generatedAt,
      round,
      questions: [],
      recommendations: [],
      source: {
        agent: "task-clarify.md",
        mode: "skip-llm",
      },
    };
    fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf-8");
    return {
      ok: true,
      questionsCount: 0,
      recommendationsCount: 0,
    };
  }

  const tdPath = path.join(outputDir, "task-discovery.md");
  const tpPath = path.join(outputDir, "task-plan-initial.md");
  const clsPath = path.join(outputDir, "intake-classification.json");
  const discPath = path.join(outputDir, "intake-discovery-analysis.json");

  for (const [label, fp] of [
    ["task-discovery.md", tdPath],
    ["task-plan-initial.md", tpPath],
    ["intake-classification.json", clsPath],
    ["intake-discovery-analysis.json", discPath],
  ]) {
    if (!fs.existsSync(fp)) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_QUESTIONS_MISSING_INPUT",
          message: `Artefacto em falta para geração LLM: ${label}`,
        },
      };
    }
  }

  let taskDiscovery;
  let taskPlanInitial;
  let intakeClassification;
  let intakeDiscoveryAnalysis;
  try {
    taskDiscovery = fs.readFileSync(tdPath, "utf-8");
    taskPlanInitial = fs.readFileSync(tpPath, "utf-8");
    intakeClassification = JSON.parse(fs.readFileSync(clsPath, "utf-8"));
    intakeDiscoveryAnalysis = JSON.parse(fs.readFileSync(discPath, "utf-8"));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_QUESTIONS_READ_INPUT",
        message: msg,
      },
    };
  }

  const prompt = buildClarifyPrompt({
    repoRoot: p.repoRoot,
    taskDiscovery,
    taskPlanInitial,
    intakeClassification,
    intakeDiscoveryAnalysis,
  });

  /** @type {{ responses: { create: (opts: object) => Promise<{ output_text?: string }> } }} */
  let client = p.llmClient;
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_QUESTIONS_NO_API_KEY",
          message:
            "OPENAI_API_KEY em falta: defina a variável ou use skipLlm / injeção de llmClient.",
        },
      };
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const model = getModelForStep("clarify");
  let rawText = "";
  try {
    const response = await client.responses.create({
      model,
      input: prompt,
    });
    rawText = String(response.output_text || "");
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    return {
      ok: false,
      error: { code: "CLARIFY_QUESTIONS_LLM_CALL", message },
      rawText: rawText || undefined,
    };
  }

  const parsed = parseClarificationQuestionsResponse(rawText);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, rawText };
  }

  const validated = validateClarificationQuestions(parsed.payload);
  if (!validated.ok) {
    const msg =
      validated.errors && validated.errors.length
        ? validated.errors.join(" ")
        : "Validação de perguntas falhou.";
    return {
      ok: false,
      error: { code: "CLARIFY_QUESTIONS_VALIDATION", message: msg },
      rawText,
    };
  }

  const pl = /** @type {any} */ (parsed.payload);
  const questions = Array.isArray(pl.questions) ? pl.questions : [];
  const recommendations = Array.isArray(pl.recommendations) ? pl.recommendations : [];

  const doc = {
    schema_version: "1.0.0",
    generated_at: generatedAt,
    round,
    questions,
    recommendations,
    source: {
      agent: "task-clarify.md",
      mode: "llm",
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(doc, null, 2), "utf-8");
  return {
    ok: true,
    questionsCount: questions.length,
    recommendationsCount: recommendations.length,
    rawText,
  };
}

module.exports = {
  MARKER,
  QUESTIONS_FILE,
  MAX_QUESTIONS,
  parseClarificationQuestionsResponse,
  validateClarificationQuestions,
  generateClarificationQuestions,
};
