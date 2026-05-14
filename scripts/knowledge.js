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

const client = createLLMClient();

const ROOT_DIR = path.resolve(__dirname, "..");

const MAX_KNOWLEDGE_BASE_CONTEXT_CHARS = Number(
  process.env.KNOWLEDGE_BASE_CONTEXT_CHARS || 12000
);

const MAX_KNOWLEDGE_LEGACY_TASK_CHARS = Number(
  process.env.KNOWLEDGE_LEGACY_TASK_CHARS || 4000
);

const MAX_KNOWLEDGE_LEGACY_ARCHITECT_CHARS = Number(
  process.env.KNOWLEDGE_LEGACY_ARCHITECT_CHARS || 5000
);

const MAX_KNOWLEDGE_LEGACY_EXECUTOR_CHARS = Number(
  process.env.KNOWLEDGE_LEGACY_EXECUTOR_CHARS || 5000
);

const MAX_KNOWLEDGE_REVIEW_MD_CHARS = Number(
  process.env.KNOWLEDGE_REVIEW_MD_CHARS || 3000
);

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRead(filePath) {
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

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function buildLegacyKnowledgeContextForPrompt({
  taskPath,
  architectPath,
  executorPath,
  out,
}) {
  const read = out ? (p) => out.readIfExists(p) : safeRead;
  return JSON.stringify(
    {
      mode: "legacy-fallback",
      warning: "run-context ausente",
      task_excerpt: compactText(read(taskPath), MAX_KNOWLEDGE_LEGACY_TASK_CHARS),
      architect_excerpt: compactText(
        read(architectPath),
        MAX_KNOWLEDGE_LEGACY_ARCHITECT_CHARS
      ),
      executor_excerpt: compactText(
        read(executorPath),
        MAX_KNOWLEDGE_LEGACY_EXECUTOR_CHARS
      ),
    },
    null,
    2
  );
}

async function runKnowledge(ctx, opts = {}) {
  const exitOnFailure = opts.exitOnFailure === true;
  const out = createOutputFs(ctx.cache);
  const telemetry = ctx.telemetry;

  telemetry.stepStart("knowledge");

  try {
  const outputDir = ctx.outputDir;

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const runContextPath = path.join(outputDir, "run-context.json");

  const taskPath = path.join(outputDir, "task.md");
  const architectPath = path.join(outputDir, "architect-output.md");
  const executorPath = path.join(outputDir, "executor-output.md");

  const reviewJsonPath = path.join(outputDir, "review-output.json");

  ensureFile(metadataPath, "metadata.json");

  const metadata = out
    ? out.readJson(metadataPath)
    : JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  const projectRoot = metadata.projectRoot;
  const projectSetupDir = metadata.projectSetupDir;

  const knowledgePath = path.join(projectSetupDir, "knowledge-base.md");

  ensureDir(projectSetupDir);

  const review = out
    ? out.readJson(reviewJsonPath)
    : JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));

  if (review.status !== "approved") {
    console.log("❌ Knowledge só roda com review aprovado");
    if (exitOnFailure) process.exit(1);
    return {
      success: false,
      errorType: "KNOWLEDGE_REVIEW_NOT_APPROVED",
      message: "Review não aprovado.",
    };
  }

  const runContext = out
    ? out.readJsonIfExists(runContextPath, null)
    : readJsonIfExists(runContextPath, null);
  const hasRunContext = isUsableRunContextStrict(runContext);

  const promptContext = hasRunContext
    ? buildCompactRunContextForPrompt(runContext, {
        mode: "review",
        safeWhitespaceCompact: true,
      })
    : buildLegacyKnowledgeContextForPrompt({
        taskPath,
        architectPath,
        executorPath,
        out,
      });

  const { content: agent, metadata: agentMeta } =
    loadAgent(path.join(ROOT_DIR, "agents", "knowledge.md"));

  const prompt = `${agent}

## CONTEXT MODE
${hasRunContext ? "run-context" : "legacy"}

## CONTEXT
\`\`\`json
${promptContext}
\`\`\`
`;

  writePromptSizeRecord(outputDir, "knowledge", {
    total_prompt_chars: prompt.length,
    user_chars: prompt.length,
    blocks: {
      agent: agent.length,
    },
  });

  const knowledgeModel = getModelForStep("knowledge");

  telemetry.llmCall({ step: "knowledge", model: knowledgeModel });

  const response = await client.responses.create({
    model: knowledgeModel,
    input: prompt,
  });

  telemetry.llmResponse({ step: "knowledge", model: knowledgeModel });

  const generated = String(response.output_text || "").trim();

  const existing = safeRead(knowledgePath);

  write(
    knowledgePath,
    existing ? `${existing}\n\n${generated}` : generated
  );

  metadata.agents = {
    ...metadata.agents,
    knowledge: agentMeta,
  };

  metadata.llm = {
    ...(metadata.llm || {}),
    knowledge: {
      model: knowledgeModel,
    },
  };

  if (out) out.writeJson(metadataPath, metadata);
  else writeJson(metadataPath, metadata);

  recordLLMUsage({
    outputDir,
    step: "knowledge",
    model: knowledgeModel,
    usage: response.usage,
  });

  if (ctx.cache) {
    ctx.cache.invalidate(metadataPath);
  }

  ctx.metadata = metadata;

  console.log("✅ Knowledge atualizado");

  return { success: true, outputDir };
  } finally {
    telemetry.stepEnd("knowledge");
  }
}

async function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.log("Uso: npm run knowledge <runId>");
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
  await runKnowledge(ctx, { exitOnFailure: true });
}

module.exports = { runKnowledge };

if (require.main === module) {
main().catch((err) => {
  console.error("❌ Erro no knowledge:", err.message || err);

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
            step: "knowledge",
            status: "error",
            severity: "high",
            type: "knowledge_failed",
            title: "Erro no knowledge",
            summary: String(err.message || err).slice(0, 1200),
            cause: "exception",
            evidence: [String(err.stack || err.message).slice(0, 2000)],
            files: [],
            model: getModelForStep("knowledge"),
            extra: {},
          });
        }
      }
    }
  } catch (_) {}

  process.exit(1);
  });
}