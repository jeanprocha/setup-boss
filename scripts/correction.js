const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { resolveOutputDir } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");

const client = createLLMClient();

const ROOT_DIR = path.resolve(__dirname, "..");

const MAX_REVIEW_MD_CHARS = Number(
  process.env.CORRECTION_REVIEW_MD_CHARS || 3000
);

const MAX_LEGACY_TASK_CHARS = Number(
  process.env.CORRECTION_LEGACY_TASK_CHARS || 4000
);

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function compactText(value, maxLength) {
  const text = String(value || "").trim();

  if (!maxLength || text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function isUsableRunContext(runContext) {
  if (!runContext || typeof runContext !== "object") return false;

  const allowedFiles =
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
      ? runContext.execution_context.allowed_files
      : runContext.architect &&
          Array.isArray(runContext.architect.allowed_files)
        ? runContext.architect.allowed_files
        : [];

  return (
    allowedFiles.length > 0 &&
    runContext.task &&
    typeof runContext.task === "object"
  );
}

function buildCompactRunContextForPrompt(runContext) {
  return JSON.stringify(
    {
      version: runContext.version,
      run_id: runContext.run_id,
      project: runContext.project,
      task: runContext.task,
      architect: {
        status: runContext.architect && runContext.architect.status,
        allowed_files: runContext.architect && runContext.architect.allowed_files,
        plan_summary: runContext.architect && runContext.architect.plan_summary,
        risks: runContext.architect && runContext.architect.risks,
        stop_criteria: runContext.architect && runContext.architect.stop_criteria,
      },
      execution_context: runContext.execution_context,
    },
    null,
    2
  );
}

function buildLegacyContextForPrompt(task) {
  return JSON.stringify(
    {
      mode: "legacy-fallback",
      warning:
        "run-context.json ausente ou inválido. Task legada foi truncada para reduzir custo.",
      task_excerpt: compactText(task, MAX_LEGACY_TASK_CHARS),
    },
    null,
    2
  );
}

function buildLeanReview(review) {
  return {
    status: review.status,
    acceptance_level: review.acceptance_level,
    requires_correction: review.requires_correction,
    summary: review.summary,
    blocking_issues: Array.isArray(review.blocking_issues)
      ? review.blocking_issues
      : [],
    warnings: Array.isArray(review.warnings) ? review.warnings : [],
  };
}

async function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: npm run correction <runId>");
    process.exit(1);
  }

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputArg);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }

  ensureFile(outputDir, "Pasta de output");

  const reviewJsonPath = path.join(outputDir, "review-output.json");
  const reviewMdPath = path.join(outputDir, "review-output.md");
  const runContextPath = path.join(outputDir, "run-context.json");
  const taskPath = path.join(outputDir, "task.md");

  ensureFile(reviewJsonPath, "review-output.json");

  const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));
  const reviewMd = compactText(readIfExists(reviewMdPath), MAX_REVIEW_MD_CHARS);

  if (review.status === "approved") {
    console.log("⚠️ Review já aprovado. Nenhuma correção necessária.");
    process.exit(0);
  }

  if (!review.requires_correction) {
    console.log("❌ Review não aprovou, mas não pediu correção.");
    process.exit(1);
  }

  const runContext = readJsonIfExists(runContextPath, null);
  const hasUsableRunContext = isUsableRunContext(runContext);

  let promptContext;

  if (hasUsableRunContext) {
    promptContext = buildCompactRunContextForPrompt(runContext);
  } else {
    ensureFile(taskPath, "task.md");
    const task = fs.readFileSync(taskPath, "utf-8");
    promptContext = buildLegacyContextForPrompt(task);
  }

  const agentPath = path.join(ROOT_DIR, "agents", "correction.md");
  const { content: agent, metadata: agentMeta } = loadAgent(agentPath);

  const prompt = `${agent}

## CONTEXT MODE

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

## RUN CONTEXT

\`\`\`json
${promptContext}
\`\`\`

## REVIEW STRUCTURED LEAN

\`\`\`json
${JSON.stringify(buildLeanReview(review), null, 2)}
\`\`\`

## REVIEW EXPLANATION (TRUNCATED)

${reviewMd || "(sem review-output.md)"}

---

Gere o documento em Markdown seguindo o formato obrigatório do agente.
As instruções serão lidas automaticamente pelo Executor na próxima rodada.

Regras adicionais:
- Use o run-context como fonte da task, arquivos permitidos, plano e critérios.
- Não peça alterações fora de architect.allowed_files / execution_context.allowed_files.
- Não repita a task completa.
- Não copie o review inteiro.
- Foque apenas nos problemas bloqueantes e ajustes necessários.
`;

  writePromptSizeRecord(outputDir, "correction", {
    total_prompt_chars: prompt.length,
    user_chars: prompt.length,
    blocks: {
      agent: agent.length,
    },
  });

  const correctionModel = getModelForStep("correction");

  const response = await client.responses.create({
    model: correctionModel,
    input: prompt,
  });

  const generated = String(response.output_text || "").trim();

  if (!generated) {
    appendProblemHistoryEntry({
      outputDir,
      step: "correction",
      status: "failed",
      severity: "high",
      type: "unknown_error",
      title: "Correction retornou vazio",
      summary: "O modelo não produziu instruções de correção.",
      cause: "empty_output",
      evidence: ["response.output_text vazio após chamada LLM."],
      files: [],
      model: correctionModel,
      usage: response.usage,
      extra: {
        context_mode: hasUsableRunContext ? "run-context" : "legacy-fallback",
      },
    });
  }

  fs.writeFileSync(
    path.join(outputDir, "correction-instructions.md"),
    generated,
    "utf-8"
  );

  const metadataPath = path.join(outputDir, "metadata.json");

  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

    metadata.agents = {
      ...metadata.agents,
      correction: agentMeta,
    };

    metadata.llm = {
      ...(metadata.llm || {}),
      correction: {
        model: correctionModel,
      },
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  recordLLMUsage({
    outputDir,
    step: "correction",
    model: correctionModel,
    usage: response.usage,
  });

  console.log(
    `✅ correction-instructions.md gerado (${hasUsableRunContext ? "run-context" : "legacy-fallback"})`
  );
}

main().catch((err) => {
  console.error("❌ Erro no correction:", err.message || err);

  try {
    const outputArg = process.argv[2];

    if (outputArg) {
      let outputDir;

      try {
        outputDir = resolveOutputDir(outputArg, { warnLegacy: false });
      } catch (_) {
        outputDir = null;
      }

      if (outputDir) {
        const metaPath = path.join(outputDir, "metadata.json");

        if (fs.existsSync(metaPath)) {
          const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

          appendProblemHistoryEntry({
            outputDir,
            metadata,
            projectRoot: metadata.projectRoot,
            step: "correction",
            status: "error",
            severity: "high",
            type: "unknown_error",
            title: "Erro no correction",
            summary: String(err.message || err).slice(0, 1200),
            cause: "exception",
            evidence: [String(err.stack || err.message).slice(0, 2000)],
            files: [],
            model: getModelForStep("correction"),
            extra: {},
          });
        }
      }
    }
  } catch (_) {}

  process.exit(1);
});