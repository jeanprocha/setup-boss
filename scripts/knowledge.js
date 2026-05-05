const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { resolveOutputDir } = require("../core/run-resolver");

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
        status: runContext.architect?.status,
        allowed_files: runContext.architect?.allowed_files,
        plan_summary: runContext.architect?.plan_summary,
        risks: runContext.architect?.risks,
        stop_criteria: runContext.architect?.stop_criteria
      },
      execution_context: runContext.execution_context
    },
    null,
    2
  );
}

function buildLegacyKnowledgeContextForPrompt({
  taskPath,
  architectPath,
  executorPath,
}) {
  return JSON.stringify(
    {
      mode: "legacy-fallback",
      warning: "run-context ausente",
      task_excerpt: compactText(safeRead(taskPath), MAX_KNOWLEDGE_LEGACY_TASK_CHARS),
      architect_excerpt: compactText(
        safeRead(architectPath),
        MAX_KNOWLEDGE_LEGACY_ARCHITECT_CHARS
      ),
      executor_excerpt: compactText(
        safeRead(executorPath),
        MAX_KNOWLEDGE_LEGACY_EXECUTOR_CHARS
      )
    },
    null,
    2
  );
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

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const runContextPath = path.join(outputDir, "run-context.json");

  const taskPath = path.join(outputDir, "task.md");
  const architectPath = path.join(outputDir, "architect-output.md");
  const executorPath = path.join(outputDir, "executor-output.md");

  const reviewMarkdownPath = path.join(outputDir, "review-output.md");
  const reviewJsonPath = path.join(outputDir, "review-output.json");

  ensureFile(metadataPath, "metadata.json");

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  const projectRoot = metadata.projectRoot;
  const projectSetupDir = metadata.projectSetupDir;

  const knowledgePath = path.join(projectSetupDir, "knowledge-base.md");

  ensureDir(projectSetupDir);

  const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));

  if (review.status !== "approved") {
    console.log("❌ Knowledge só roda com review aprovado");
    process.exit(1);
  }

  const runContext = readJsonIfExists(runContextPath, null);
  const hasRunContext = isUsableRunContext(runContext);

  const promptContext = hasRunContext
    ? buildCompactRunContextForPrompt(runContext)
    : buildLegacyKnowledgeContextForPrompt({
        taskPath,
        architectPath,
        executorPath,
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

  const knowledgeModel = getModelForStep("knowledge");

  const response = await client.responses.create({
    model: knowledgeModel,
    input: prompt,
  });

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

  writeJson(metadataPath, metadata);

  recordLLMUsage({
    outputDir,
    step: "knowledge",
    model: knowledgeModel,
    usage: response.usage,
  });

  console.log("✅ Knowledge atualizado");
}

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