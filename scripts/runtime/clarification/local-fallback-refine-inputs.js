"use strict";

const fs = require("fs");
const path = require("path");

const PLAN_INITIAL_FILE = "task-plan-initial.md";
const DISCOVERY_FILE = "task-discovery.md";

/** IDs das perguntas heurísticas (alinhadas com local-fallback-questions.js) */
const FALLBACK_Q_IDS = Object.freeze([
  "local_fallback_q1",
  "local_fallback_q2",
  "local_fallback_q3",
  "local_fallback_q4",
  "local_fallback_q5",
]);

function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * @param {object|null} answersDoc
 * @param {string} qid
 */
function answerTextForId(answersDoc, qid) {
  const rows = answersDoc && Array.isArray(answersDoc.answers) ? answersDoc.answers : [];
  for (const row of rows) {
    const id = row && row.question_id != null ? String(row.question_id).trim() : "";
    if (id === qid) {
      const v = row.value;
      if (typeof v === "boolean") return v ? "sim" : "não";
      return v != null ? String(v).trim() : "";
    }
  }
  return "";
}

/**
 * @param {object|null} disc
 */
function summarizeDiscoveryAnalysis(disc) {
  if (!disc || typeof disc !== "object") return "(sem intake-discovery-analysis.json legível.)";
  try {
    const raw = JSON.stringify(disc, null, 2);
    const max = 2800;
    if (raw.length <= max) return raw;
    return `${raw.slice(0, max)}\n… _(truncado)_`;
  } catch {
    return "(resumo indisponível.)";
  }
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   taskPreview: string,
 *   questionsDoc: object,
 *   answersDoc: object,
 * }} p
 * @returns {string}
 */
function buildLocalFallbackTaskPlanInitialMarkdown(p) {
  const meta = {
    source: "local_fallback",
    skip_llm: true,
    generated_for: "refine_prerequisite",
  };
  const lines = [];
  lines.push("# Plano inicial — fallback local");
  lines.push("");
  lines.push(`<!-- task-plan-initial-meta: ${JSON.stringify(meta)} -->`);
  lines.push("");
  lines.push("## Contexto");
  const tp = String(p.taskPreview || "").trim();
  lines.push(
    tp
      ? `Pedido original (metadata / pré-visualização):\n\n> ${tp.replace(/\n/g, "\n> ")}`
      : "(Sem texto da tarefa em metadata — ver run-context.json.)",
  );
  lines.push("");

  const idToPrompt = new Map();
  const qs = Array.isArray(p.questionsDoc?.questions) ? p.questionsDoc.questions : [];
  for (const q of qs) {
    const id = q && q.id != null ? String(q.id).trim() : "";
    if (id) idToPrompt.set(id, String(q.prompt || "").trim());
  }

  const sections = [
    ["## Objetivo", FALLBACK_Q_IDS[0], "Resposta à pergunta sobre objetivo final"],
    ["## Escopo inicial", FALLBACK_Q_IDS[1], "Resposta sobre o que fazer primeiro"],
    ["## Arquivos/telas prováveis", FALLBACK_Q_IDS[2], "Resposta sobre ficheiros/telas/módulos"],
    ["## Fora de escopo", FALLBACK_Q_IDS[3], "Resposta sobre exclusões"],
    ["## Critério de sucesso", FALLBACK_Q_IDS[4], "Resposta sobre critério de conclusão"],
  ];

  for (const [heading, qid, hint] of sections) {
    lines.push(heading);
    const ans = answerTextForId(p.answersDoc, qid);
    if (ans) {
      lines.push(ans);
    } else {
      const prompt = idToPrompt.get(qid);
      lines.push(
        prompt
          ? `_(Sem resposta para \`${qid}\`; pergunta: ${prompt})_`
          : `_(Sem resposta para \`${qid}\` — ${hint}.)_`,
      );
    }
    lines.push("");
  }

  lines.push("## Observações");
  lines.push("- Gerado localmente por fallback (sem LLM).");
  lines.push("- Marcação `source/local_fallback` — requer revisão e aprovação humana antes de execução.");
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {{
 *   taskPreview: string,
 *   discoverySnippet: string,
 * }} p
 * @returns {string}
 */
function buildLocalFallbackTaskDiscoveryMarkdown(p) {
  const tp = String(p.taskPreview || "").trim();
  const meta = {
    source: "local_fallback",
    skip_llm: true,
    generated_for: "refine_prerequisite",
  };
  return `---TASK_DISCOVERY---

<!-- task-discovery-meta: ${JSON.stringify(meta)} -->

## Entendimento

${tp ? tp : "(Sem pré-visualização da tarefa em metadata.)"}

## Sinais estruturados (extracto)

\`\`\`json
${p.discoverySnippet}
\`\`\`

## Observações

- Documento mínimo gerado localmente quando o intake foi executado com \`skipLlm\`.
- Não substitui discovery gerado por LLM.
`;
}

/**
 * Escreve \`task-plan-initial.md\` e/ou \`task-discovery.md\` em modo determinístico (sem LLM).
 *
 * @param {string} outputDirAbs
 * @returns {{
 *   ok: true,
 *   initialPlanWritten: boolean,
 *   discoveryWritten: boolean,
 *   reason: string,
 * } | { ok: false, error: { code: string, message: string } }}
 */
function ensureSkipLlmRefineMarkdownArtifacts(outputDirAbs) {
  const dir = path.resolve(outputDirAbs);
  const tpPath = path.join(dir, PLAN_INITIAL_FILE);
  const tdPath = path.join(dir, DISCOVERY_FILE);

  const questionsDoc = safeReadJson(path.join(dir, "clarification-questions.json"));
  const answersDoc = safeReadJson(path.join(dir, "clarification-answers.json"));
  if (!questionsDoc || typeof questionsDoc !== "object") {
    return {
      ok: false,
      error: {
        code: "CLARIFY_LOCAL_REFINE_INPUT_QUESTIONS",
        message:
          "Não é possível gerar plano inicial local: clarification-questions.json em falta ou inválido.",
      },
    };
  }
  if (!answersDoc || typeof answersDoc !== "object") {
    return {
      ok: false,
      error: {
        code: "CLARIFY_LOCAL_REFINE_INPUT_ANSWERS",
        message:
          "Não é possível gerar plano inicial local: clarification-answers.json em falta ou inválido.",
      },
    };
  }

  const metadata = safeReadJson(path.join(dir, "metadata.json")) || {};
  const taskPreview =
    metadata.intake_task_preview != null ? String(metadata.intake_task_preview) : "";

  let discoveryWritten = false;
  let initialPlanWritten = false;

  const discObj = safeReadJson(path.join(dir, "intake-discovery-analysis.json"));
  const discoverySnippet = summarizeDiscoveryAnalysis(discObj);

  if (!fs.existsSync(tdPath)) {
    const md = buildLocalFallbackTaskDiscoveryMarkdown({
      taskPreview,
      discoverySnippet,
    });
    try {
      fs.writeFileSync(tdPath, md, "utf-8");
      discoveryWritten = true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      return {
        ok: false,
        error: {
          code: "CLARIFY_LOCAL_REFINE_DISCOVERY_WRITE",
          message: msg,
        },
      };
    }
  }

  if (!fs.existsSync(tpPath)) {
    const md = buildLocalFallbackTaskPlanInitialMarkdown({
      outputDirAbs: dir,
      taskPreview,
      questionsDoc,
      answersDoc,
    });
    try {
      fs.writeFileSync(tpPath, md, "utf-8");
      initialPlanWritten = true;
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      return {
        ok: false,
        error: {
          code: "CLARIFY_LOCAL_REFINE_INITIAL_WRITE",
          message: msg,
        },
      };
    }
  }

  return {
    ok: true,
    initialPlanWritten,
    discoveryWritten,
    reason: "skip_llm_missing_markdown_artifacts",
  };
}

module.exports = {
  PLAN_INITIAL_FILE,
  DISCOVERY_FILE,
  FALLBACK_Q_IDS,
  ensureSkipLlmRefineMarkdownArtifacts,
  buildLocalFallbackTaskPlanInitialMarkdown,
  buildLocalFallbackTaskDiscoveryMarkdown,
};
