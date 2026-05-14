const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { resolveOutputDir } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");
const {
  compactText,
  isUsableRunContextStrict,
  buildCompactRunContextForPrompt,
} = require("./shared-utils");
const { createStageContextFromOutputDir } = require("./runtime/runtime-context");
const { createOutputFs } = require("./runtime/output-fs");
const { isCorrectionIntelligenceEnabled } = require("./correction-runtime/feature-flags");
const { persistFullCorrectionArtifacts } = require("./correction-runtime/correction-pipeline");
const { CORRECTION_ANALYSIS_FILENAME } = require("./correction-runtime/constants");

const client = createLLMClient();

const ROOT_DIR = path.resolve(__dirname, "..");

const MAX_REVIEW_MD_CHARS = Number(
  process.env.CORRECTION_REVIEW_MD_CHARS || 3000
);

const MAX_LEGACY_TASK_CHARS = Number(
  process.env.CORRECTION_LEGACY_TASK_CHARS || 4000
);

const MAX_CORRECTION_INTEL_PROMPT_CHARS = Number(
  process.env.CORRECTION_INTEL_PROMPT_CHARS || 3600,
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

async function runCorrection(ctx, opts = {}) {
  const exitOnFailure = opts.exitOnFailure === true;
  const out = createOutputFs(ctx.cache);
  const telemetry = ctx.telemetry;

  telemetry.stepStart("correction");

  try {
  const outputDir = ctx.outputDir;

  ensureFile(outputDir, "Pasta de output");

  const reviewJsonPath = path.join(outputDir, "review-output.json");
  const reviewMdPath = path.join(outputDir, "review-output.md");
  const runContextPath = path.join(outputDir, "run-context.json");
  const taskPath = path.join(outputDir, "task.md");

  ensureFile(reviewJsonPath, "review-output.json");

  const review = out
    ? out.readJson(reviewJsonPath)
    : JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));
  const reviewMd = compactText(
    out ? out.readIfExists(reviewMdPath) : readIfExists(reviewMdPath),
    MAX_REVIEW_MD_CHARS,
  );

  if (review.status === "approved") {
    console.log("⚠️ Review já aprovado. Nenhuma correção necessária.");
    if (exitOnFailure) process.exit(0);
    return { success: true, skipped: true };
  }

  if (!review.requires_correction) {
    console.log("❌ Review não aprovou, mas não pediu correção.");
    if (exitOnFailure) process.exit(1);
    return {
      success: false,
      retryable: false,
      errorType: "CORRECTION_NOT_REQUESTED",
      message: "Review não pediu correção.",
    };
  }

  try {
    if (review.requires_correction && isCorrectionIntelligenceEnabled()) {
      persistFullCorrectionArtifacts({
        outputDir,
        telemetry,
        hintsOverride: null,
      });
    }
  } catch (_) {}

  let runtimeGuidanceBlock = "";
  try {
    const intelPath = path.join(outputDir, CORRECTION_ANALYSIS_FILENAME);
    if (review.requires_correction && isCorrectionIntelligenceEnabled() && fs.existsSync(intelPath)) {
      const intelRaw = fs.readFileSync(intelPath, "utf-8");
      const intelParsed = JSON.parse(intelRaw);
      const compactGuide = JSON.stringify(
        {
          correction_analysis_id: intelParsed.correction_analysis_id || null,
          summary: intelParsed.summary || {},
          targets_top: Array.isArray(intelParsed.correction_targets)
            ? intelParsed.correction_targets.slice(0, 28)
            : [],
          failures_sample: Array.isArray(intelParsed.failures)
            ? intelParsed.failures.slice(0, 18)
            : [],
          recommendation_slice: Array.isArray(intelParsed.recommendations)
            ? intelParsed.recommendations.slice(0, 18)
            : [],
        },
        null,
        2,
      );
      runtimeGuidanceBlock = `\n\n## RUNTIME-GUIDED REMEDIATION\n\nCopia integral das prioridades seguintes antes de PATCH amplo:\n\n\`\`\`json\n${compactText(compactGuide, MAX_CORRECTION_INTEL_PROMPT_CHARS)}\n\`\`\`\n`;
    }
  } catch (_) {}

  const runContext = out
    ? out.readJsonIfExists(runContextPath, null)
    : readJsonIfExists(runContextPath, null);
  const hasUsableRunContext = isUsableRunContextStrict(runContext);

  let promptContext;

  if (hasUsableRunContext) {
    promptContext = buildCompactRunContextForPrompt(runContext, {
      mode: "correction",
      safeWhitespaceCompact: true,
    });
  } else {
    ensureFile(taskPath, "task.md");
    const task = out
      ? out.readUtf8(taskPath)
      : fs.readFileSync(taskPath, "utf-8");
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
${runtimeGuidanceBlock || ""}

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

  telemetry.llmCall({ step: "correction", model: correctionModel });

  const response = await client.responses.create({
    model: correctionModel,
    input: prompt,
  });

  telemetry.llmResponse({ step: "correction", model: correctionModel });

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

  const corrPath = path.join(outputDir, "correction-instructions.md");
  if (out) out.writeUtf8(corrPath, generated);
  else fs.writeFileSync(corrPath, generated, "utf-8");

  const metadataPath = path.join(outputDir, "metadata.json");

  if (out ? out.exists(metadataPath) : fs.existsSync(metadataPath)) {
    const metadata = out
      ? out.readJson(metadataPath)
      : JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

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

    if (out) out.writeJson(metadataPath, metadata);
    else
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        "utf-8",
      );
  }

  recordLLMUsage({
    outputDir,
    step: "correction",
    model: correctionModel,
    usage: response.usage,
  });

  if (ctx.cache) {
    ctx.cache.invalidate(metadataPath);
  }

  console.log(
    `✅ correction-instructions.md gerado (${hasUsableRunContext ? "run-context" : "legacy-fallback"})`
  );

  return { success: true, outputDir };
  } finally {
    telemetry.stepEnd("correction");
  }
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

  const ctx = createStageContextFromOutputDir(outputDir, { runId: outputArg });
  await runCorrection(ctx, { exitOnFailure: true });
}

module.exports = { runCorrection };

if (require.main === module) {
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
}