"use strict";

const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const { loadAgent } = require("../../../core/agent-metadata");
const { getModelForStep } = require("../../../core/llm-client");
const { QUESTIONS_FILE } = require("./question-generator");
const {
  ANSWERS_FILE,
  loadClarificationQuestions,
  validateClarificationAnswers,
} = require("./answers");
const { ensureSkipLlmRefineMarkdownArtifacts } = require("./local-fallback-refine-inputs");
const runtimeLogger = require("../logger");

const MARKER = "---TASK_PLAN_REFINED---";
const PLAN_REFINED_FILE = "task-plan-refined.md";

/** @type {readonly string[]} */
const REQUIRED_H2 = Object.freeze([
  "Objetivo",
  "Escopo Refinado",
  "Decisões Confirmadas",
  "Passos Propostos",
  "Critérios de Aceite",
  "Fora de Escopo",
  "Riscos Restantes",
]);

/**
 * @param {string} repoRoot
 */
function agentPath(repoRoot) {
  return path.join(repoRoot, "agents", "task-plan-refine.md");
}

/**
 * @param {string} outputText
 * @returns {{ ok: true, coreMarkdown: string } | { ok: false, error: { code: string, message: string } }}
 */
function parseTaskPlanRefinedResponse(outputText) {
  const raw = String(outputText ?? "");
  const trimmedStart = raw.replace(/^\uFEFF/, "").trimStart();
  const idx = trimmedStart.indexOf(MARKER);
  if (idx === -1) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_PARSE_MISSING_MARKER",
        message: `Marcador obrigatório em falta: ${MARKER}`,
      },
    };
  }
  if (idx !== 0) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_PARSE_LEADING_NOISE",
        message: `A resposta deve começar por ${MARKER} (sem texto antes).`,
      },
    };
  }
  const afterMarker = trimmedStart.slice(idx + MARKER.length).replace(/^\r?\n?/, "");
  const coreMarkdown = `${MARKER}\n${afterMarker}`.trimEnd() + "\n";
  if (afterMarker.trim() === "") {
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_PARSE_EMPTY",
        message: "Markdown em falta após o marcador.",
      },
    };
  }
  return { ok: true, coreMarkdown };
}

/**
 * @param {string} markdown — documento que inclui o marcador na primeira linha útil (após trim)
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateTaskPlanRefinedMarkdown(markdown) {
  /** @type {string[]} */
  const errors = [];
  const raw = String(markdown ?? "").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || lines[i].trim() !== MARKER) {
    errors.push(`A primeira linha não vazia deve ser exatamente ${MARKER}.`);
    return { ok: false, errors };
  }
  i++;
  const body = lines.slice(i).join("\n").replace(/^\uFEFF/, "");
  /** @type {Map<string, string>} */
  const sections = new Map();
  const chunks = body.split(/(?=^##\s+)/m).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const head = nl === -1 ? chunk : chunk.slice(0, nl).trim();
    const rest = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    const hm = head.match(/^##\s+(.+?)\s*$/);
    if (hm) {
      sections.set(hm[1].trim(), rest);
    }
  }

  for (const need of REQUIRED_H2) {
    if (!sections.has(need)) {
      errors.push(`Secção H2 em falta: ## ${need}`);
      continue;
    }
    const c = sections.get(need);
    if (c == null || String(c).trim() === "") {
      errors.push(`Secção ## ${need} não pode estar vazia.`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

/**
 * @param {{
 *   taskPlanInitial: string,
 *   taskDiscovery: string,
 *   questionsJson: object,
 *   answersJson: object,
 *   classificationJson: object,
 * }} p
 * @returns {string}
 */
function buildDeterministicRefinedMarkdown(p) {
  const ansLines =
    Array.isArray(p.answersJson.answers) && p.answersJson.answers.length
      ? p.answersJson.answers
          .map(
            (a) =>
              `- **${String(a.question_id)}**: ${typeof a.value === "boolean" ? (a.value ? "sim" : "não") : String(a.value)}`,
          )
          .join("\n")
      : "- (sem respostas estruturadas)";

  const planSnippet = String(p.taskPlanInitial || "").trim().slice(0, 4000);

  return `${MARKER}
## Objetivo
Plano refinado de forma determinística (sem LLM), alinhado com o plano inicial e as respostas registadas.

## Escopo Refinado
Escopo alinhado com \`task-plan-initial.md\` e clarificações gravadas. Resumo do plano inicial (extracto):
${planSnippet ? `\n> ${planSnippet.split("\n").join("\n> ")}\n` : "\n_(extracto vazio)_\n"}

## Decisões Confirmadas
- Modo de geração: **skip-llm** (síntese automática mínima).
- Respostas de clarificação consideradas:
${ansLines}

## Passos Propostos
1. Rever \`task-plan-initial.md\` e \`task-discovery.md\` em conjunto com \`clarification-answers.json\`.
2. Executar a implementação conforme o plano refinado acordado pela equipa (fora do âmbito deste comando).

## Critérios de Aceite
- O ficheiro \`${PLAN_REFINED_FILE}\` existe e contém todas as secções obrigatórias.
- As respostas blocking foram validadas antes da geração.

## Fora de Escopo
- Execução técnica, revisão automática, aprovação humana formal, orquestração DAG.

## Riscos Restantes
- O modo skip-llm não interpreta nuance semântica; pode ser necessário refinamento manual se a task for complexa.
`;
}

/**
 * @param {{
 *   repoRoot: string,
 *   taskDiscovery: string,
 *   taskPlanInitial: string,
 *   questionsDoc: object,
 *   answersDoc: object,
 *   intakeClassification: object,
 * }} p
 * @returns {string}
 */
function buildRefinePrompt(p) {
  const { content: agentContent } = loadAgent(agentPath(p.repoRoot));
  return `${agentContent}

## ARTEFACTOS (conteúdo integral)

### task-plan-initial.md

\`\`\`markdown
${p.taskPlanInitial}
\`\`\`

### task-discovery.md

\`\`\`markdown
${p.taskDiscovery}
\`\`\`

### clarification-questions.json

\`\`\`json
${JSON.stringify(p.questionsDoc, null, 2)}
\`\`\`

### clarification-answers.json

\`\`\`json
${JSON.stringify(p.answersDoc, null, 2)}
\`\`\`

### intake-classification.json

\`\`\`json
${JSON.stringify(p.intakeClassification, null, 2)}
\`\`\`

---

Segue o contrato de saída (marcador \`${MARKER}\` sozinho numa linha, depois Markdown com as secções H2 obrigatórias).`;
}

/**
 * @param {{
 *   outputDirAbs: string,
 *   repoRoot: string,
 *   skipLlm: boolean,
 *   llmClient: { responses: { create: (opts: object) => Promise<{ output_text?: string }> } }|null,
 * }} p
 * @returns {Promise<
 *   | { ok: true, filePath: string, mode: "skip-llm"|"llm", rawText?: string }
 *   | { ok: false, error: { code: string, message: string }, rawText?: string }
 * >}
 */
async function refineTaskPlan(p) {
  const outputDir = path.resolve(p.outputDirAbs);
  const outFile = path.join(outputDir, PLAN_REFINED_FILE);

  const tpPath = path.join(outputDir, "task-plan-initial.md");
  const tdPath = path.join(outputDir, "task-discovery.md");
  const clsPath = path.join(outputDir, "intake-classification.json");
  const qPath = path.join(outputDir, QUESTIONS_FILE);
  const aPath = path.join(outputDir, ANSWERS_FILE);

  /** @type {{ localInitialPlanWritten?: boolean, localDiscoveryWritten?: boolean }} */
  const sideFx = {};

  for (const [label, fp] of [
    ["clarification-questions.json", qPath],
    ["clarification-answers.json", aPath],
    ["intake-classification.json", clsPath],
  ]) {
    if (!fs.existsSync(fp)) {
      const code =
        label === "clarification-answers.json"
          ? "CLARIFY_REFINE_ANSWERS_MISSING"
          : label === "clarification-questions.json"
            ? "CLARIFY_REFINE_QUESTIONS_MISSING"
            : "CLARIFY_REFINE_INPUT_MISSING";
      return {
        ok: false,
        error: {
          code,
          message:
            label === "clarification-answers.json"
              ? "Para refinar é preciso gravar clarification-answers.json primeiro."
              : label === "clarification-questions.json"
                ? "Ficheiro clarification-questions.json em falta — gere perguntas antes do refine."
                : `Artefacto em falta para refine: ${label}`,
        },
      };
    }
  }

  const tpMissing = !fs.existsSync(tpPath);
  const tdMissing = !fs.existsSync(tdPath);
  if (tpMissing || tdMissing) {
    if (!p.skipLlm) {
      const planMissingMsg =
        "Não foi possível gerar o plano refinado porque o plano inicial ainda não existe. Execute o intake com LLM ou use skip LLM no fluxo que permite fallback local.";
      const discoveryMissingMsg =
        "Não foi possível gerar o plano refinado porque task-discovery.md não existe (intake sem LLM). Complete o intake com LLM ou use o modo skip LLM com fallback.";
      runtimeLogger.warn("runtime.refine.failed", {
        outputDir,
        reason: "missing_markdown_prerequisite",
        task_plan_initial_missing: tpMissing,
        task_discovery_missing: tdMissing,
        skipLlm: false,
      });
      return {
        ok: false,
        error: {
          code: tpMissing
            ? "CLARIFY_REFINE_PLAN_INITIAL_MISSING"
            : "CLARIFY_REFINE_DISCOVERY_MISSING",
          message: tpMissing ? planMissingMsg : discoveryMissingMsg,
        },
      };
    }

    runtimeLogger.info("runtime.refine.missing_initial_plan", {
      outputDir,
      initialPlanPath: tpPath,
      refinedPlanPath: outFile,
      task_plan_initial_missing: tpMissing,
      task_discovery_missing: tdMissing,
      answersCount: null,
      reason: "skip_llm_stub_pending",
    });
    runtimeLogger.info("runtime.refine.local_initial_plan_started", {
      outputDir,
      initialPlanPath: tpPath,
      refinedPlanPath: outFile,
      reason: "skip_llm_missing_markdown_artifacts",
    });

    const ensured = ensureSkipLlmRefineMarkdownArtifacts(outputDir);
    if (!ensured.ok) {
      runtimeLogger.warn("runtime.refine.failed", {
        outputDir,
        initialPlanPath: tpPath,
        refinedPlanPath: outFile,
        reason: ensured.error?.code || "local_fallback_failed",
      });
      return { ok: false, error: ensured.error };
    }
    sideFx.localInitialPlanWritten = ensured.initialPlanWritten;
    sideFx.localDiscoveryWritten = ensured.discoveryWritten;
    runtimeLogger.info("runtime.refine.local_initial_plan_written", {
      outputDir,
      initialPlanPath: tpPath,
      refinedPlanPath: outFile,
      answersCount: null,
      initialPlanWritten: ensured.initialPlanWritten,
      discoveryWritten: ensured.discoveryWritten,
      reason: ensured.reason,
    });
  }

  const qLoad = loadClarificationQuestions(outputDir);
  if (!qLoad.ok) {
    return { ok: false, error: qLoad.error };
  }

  let answersDoc;
  try {
    answersDoc = JSON.parse(fs.readFileSync(aPath, "utf-8"));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_ANSWERS_READ",
        message: msg,
      },
    };
  }

  const val = validateClarificationAnswers(
    { questions: qLoad.doc.questions },
    answersDoc && typeof answersDoc === "object" && Array.isArray(answersDoc.answers)
      ? { answers: answersDoc.answers }
      : { answers: [] },
  );
  if (!val.ok) {
    const pending =
      typeof val.pendingBlocking === "number" ? val.pendingBlocking : 0;
    return {
      ok: false,
      error: {
        code:
          pending > 0 ? "CLARIFY_REFINE_BLOCKING_PENDING" : "CLARIFY_REFINE_ANSWERS_INVALID",
        message: val.errors.join(" "),
      },
    };
  }

  let taskPlanInitial;
  let taskDiscovery;
  let intakeClassification;
  try {
    taskPlanInitial = fs.readFileSync(tpPath, "utf-8");
    taskDiscovery = fs.readFileSync(tdPath, "utf-8");
    intakeClassification = JSON.parse(fs.readFileSync(clsPath, "utf-8"));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_READ_INPUT",
        message: msg,
      },
    };
  }

  if (p.skipLlm) {
    const core = buildDeterministicRefinedMarkdown({
      taskPlanInitial,
      taskDiscovery,
      questionsJson: qLoad.doc,
      answersJson: answersDoc,
      classificationJson: intakeClassification,
    });
    const v = validateTaskPlanRefinedMarkdown(core);
    if (!v.ok) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_REFINE_VALIDATION",
          message: v.errors.join(" "),
        },
      };
    }
    const meta = `<!-- plan-refine-meta: ${JSON.stringify({ mode: "skip-llm" })} -->\n\n`;
    fs.writeFileSync(outFile, meta + core, "utf-8");
    runtimeLogger.info("runtime.refine.completed", {
      outputDir,
      initialPlanPath: tpPath,
      refinedPlanPath: outFile,
      mode: "skip-llm",
      localInitialPlanWritten: Boolean(sideFx.localInitialPlanWritten),
      localDiscoveryWritten: Boolean(sideFx.localDiscoveryWritten),
      reason: "skip_llm_deterministic",
    });
    return {
      ok: true,
      filePath: outFile,
      mode: "skip-llm",
      localInitialPlanWritten: Boolean(sideFx.localInitialPlanWritten),
      localDiscoveryWritten: Boolean(sideFx.localDiscoveryWritten),
    };
  }

  const prompt = buildRefinePrompt({
    repoRoot: p.repoRoot,
    taskDiscovery,
    taskPlanInitial,
    questionsDoc: qLoad.doc,
    answersDoc,
    intakeClassification,
  });

  /** @type {{ responses: { create: (opts: object) => Promise<{ output_text?: string }> } }} */
  let client = p.llmClient;
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_REFINE_NO_API_KEY",
          message:
            "OPENAI_API_KEY em falta: defina a variável ou use --skip-llm / injeção de llmClient.",
        },
      };
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  const model = getModelForStep("plan_refine");
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
      error: { code: "CLARIFY_REFINE_LLM_CALL", message },
      rawText: rawText || undefined,
    };
  }

  const parsed = parseTaskPlanRefinedResponse(rawText);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, rawText };
  }

  const validated = validateTaskPlanRefinedMarkdown(parsed.coreMarkdown);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_REFINE_VALIDATION",
        message: validated.errors.join(" "),
      },
      rawText,
    };
  }

  const meta = `<!-- plan-refine-meta: ${JSON.stringify({ mode: "llm" })} -->\n\n`;
  fs.writeFileSync(outFile, meta + parsed.coreMarkdown, "utf-8");
  runtimeLogger.info("runtime.refine.completed", {
    outputDir,
    initialPlanPath: tpPath,
    refinedPlanPath: outFile,
    mode: "llm",
    reason: "llm_ok",
  });
  return {
    ok: true,
    filePath: outFile,
    mode: "llm",
    rawText,
    localInitialPlanWritten: Boolean(sideFx.localInitialPlanWritten),
    localDiscoveryWritten: Boolean(sideFx.localDiscoveryWritten),
  };
}

module.exports = {
  MARKER,
  PLAN_REFINED_FILE,
  REQUIRED_H2,
  parseTaskPlanRefinedResponse,
  validateTaskPlanRefinedMarkdown,
  buildDeterministicRefinedMarkdown,
  refineTaskPlan,
};
