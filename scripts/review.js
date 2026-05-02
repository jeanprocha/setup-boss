const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");

const ROOT_DIR = path.resolve(process.cwd());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ACCEPTANCE_LEVEL_ENUM = ["development", "staging", "production"];

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "acceptance_level",
    "blocking_issues",
    "warnings",
    "requires_correction",
    "summary",
    "markdown_report"
  ],
  properties: {
    status: {
      type: "string",
      enum: ["approved", "rejected", "blocked"]
    },
    acceptance_level: {
      type: "string",
      enum: ACCEPTANCE_LEVEL_ENUM
    },
    blocking_issues: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    requires_correction: {
      type: "boolean"
    },
    summary: {
      type: "string"
    },
    markdown_report: {
      type: "string"
    }
  }
};

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function updateAgentMetadata(outputDir, agentMeta) {
  const metadataPath = path.join(outputDir, "metadata.json");

  if (!fs.existsSync(metadataPath)) return;

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  metadata.agents = {
    ...metadata.agents,
    reviewer: agentMeta
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

function normalizeTaskAcceptanceLevel(token) {
  if (!token) return null;

  const x = String(token).toLowerCase();

  if (
    x === "development" ||
    x === "dev"
  ) {
    return "development";
  }

  if (
    x === "staging" ||
    x === "homologation" ||
    x === "homolog" ||
    x === "hmg"
  ) {
    return "staging";
  }

  if (
    x === "production" ||
    x === "prod"
  ) {
    return "production";
  }

  return null;
}

/** @returns {"development"|"staging"|"production"|null} */
function extractExpectedAcceptanceLevel(task) {
  const match = task.match(/## Acceptance Level[\s\S]*?\[(x|X)\]\s*(\w+)/);

  if (!match) return null;

  return normalizeTaskAcceptanceLevel(match[2]);
}

function extractSection(content, sectionTitle) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `## ${escaped}\\s*([\\s\\S]*?)(?=\\n## |$)`,
    "i"
  );

  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function extractArchitectAllowedFiles(architectOutput) {
  const section = extractSection(architectOutput, "Arquivos prováveis");

  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.replace(/`/g, "").trim());
}

function validateReviewResult(result, expectedLevel) {
  const errors = [];

  if (!result || typeof result !== "object") {
    errors.push("Review result must be an object.");
    return errors;
  }

  if (!["approved", "rejected", "blocked"].includes(result.status)) {
    errors.push("status inválido.");
  }

  if (!ACCEPTANCE_LEVEL_ENUM.includes(result.acceptance_level)) {
    errors.push("acceptance_level inválido.");
  }

  if (
    expectedLevel &&
    result.acceptance_level !== expectedLevel
  ) {
    errors.push(
      `acceptance_level inconsistente. Esperado: ${expectedLevel}, recebido: ${result.acceptance_level}`
    );
  }

  if (!Array.isArray(result.blocking_issues)) {
    errors.push("blocking_issues deve ser array.");
  }

  if (!Array.isArray(result.warnings)) {
    errors.push("warnings deve ser array.");
  }

  if (typeof result.requires_correction !== "boolean") {
    errors.push("requires_correction deve ser boolean.");
  }

  if (result.status === "approved" && result.requires_correction) {
    errors.push("approved não pode exigir correção.");
  }

  if (result.status === "rejected" && !result.requires_correction) {
    errors.push("rejected deve exigir correção.");
  }

  if (
    result.status === "approved" &&
    result.blocking_issues.length > 0
  ) {
    errors.push("approved não pode ter blocking issues.");
  }

  return errors;
}

async function run() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    throw new Error("Usage: node scripts/review.js <output-dir>");
  }

  const outputDir = path.isAbsolute(outputArg)
    ? outputArg
    : path.join(ROOT_DIR, "outputs", outputArg);

  ensureDir(outputDir);

  const reviewerAgentPath = path.join(ROOT_DIR, "agents", "reviewer.md");
  const { metadata: agentMeta } = loadAgent(reviewerAgentPath);

  updateAgentMetadata(outputDir, agentMeta);

  const task = readIfExists(path.join(outputDir, "task.md"));
  const scan = readIfExists(path.join(outputDir, "scan-output.md"));
  const architect = readIfExists(path.join(outputDir, "architect-output.md"));
  const executor = readIfExists(path.join(outputDir, "executor-output.md"));

  const changesPath = path.join(outputDir, "executor-changes.json");

  let changedFiles = [];

  if (fs.existsSync(changesPath)) {
    changedFiles = JSON.parse(fs.readFileSync(changesPath, "utf-8"));
  }

  const metadataPath = path.join(outputDir, "metadata.json");
  const pipelineMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  const projectRoot = pipelineMetadata.projectRoot;

  const pathsFromChanges = Array.isArray(changedFiles)
    ? [...new Set(changedFiles.map((f) => (f && f.path ? f.path : "")).filter(Boolean))]
    : [];

  const pathsForRealState =
    pathsFromChanges.length > 0
      ? pathsFromChanges
      : [...new Set(extractArchitectAllowedFiles(architect))];

  const MAX_SIZE = 20000;

  const realFilesContent = pathsForRealState.map((relPath) => {
    const absolutePath = path.join(projectRoot, relPath);

    if (!fs.existsSync(absolutePath)) {
      return `### ${relPath}\n\n(Não encontrado)`;
    }

    const content = fs.readFileSync(absolutePath, "utf-8");

    const safeContent =
      content.length > MAX_SIZE ? content.slice(-MAX_SIZE) : content;

    return `### ${relPath}

\`\`\`
${safeContent}
\`\`\``;
  });

  const realStatePreamble =
    pathsFromChanges.length > 0
      ? ""
      : pathsForRealState.length > 0
        ? "_Arquivos lidos do disco conforme «Arquivos prováveis» do Architect (executor-changes.json estava vazio nesta execução)._\n\n"
        : "_Nenhum caminho em executor-changes.json e nenhum arquivo em «Arquivos prováveis» do Architect — não há estado de disco para revisar._\n\n";

  const expectedLevel = extractExpectedAcceptanceLevel(task);

  const levelHint =
    expectedLevel ??
    "(não detectado na task — preencha acceptance_level conforme o nível avaliado)";

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: [
      {
        role: "system",
        content: `
Você é o Reviewer do Setup Boss.

IMPORTANTE:
- Respeite o Acceptance Level da task: ${levelHint}
- Se não houver evidência suficiente → REJECTED
- Se houver bloqueio de produção → BLOCKED
- Se estiver correto para o nível → APPROVED

Nunca aprove sem evidência clara no código.

Use como fonte de verdade:
1. REAL FILE STATE (prioridade máxima)
2. Executor Output (evidência auxiliar)

Se houver conflito, confie no REAL FILE STATE.
        `.trim()
      },
      {
        role: "user",
        content: `
# TASK
${task}

# PROJECT SCAN
${scan}

# ARCHITECT PLAN
${architect}

# EXECUTOR OUTPUT
${executor}

# REAL FILE STATE (SOURCE OF TRUTH)

${realStatePreamble}${realFilesContent.join("\n\n")}
        `.trim()
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "review",
        strict: true,
        schema: REVIEW_SCHEMA
      }
    }
  });

  const result = JSON.parse(response.output_text);

  const validationErrors = validateReviewResult(result, expectedLevel);

  if (validationErrors.length > 0) {
    const fallback = {
      status: "rejected",
      acceptance_level: expectedLevel ?? "development",
      blocking_issues: validationErrors,
      warnings: [],
      requires_correction: true,
      summary: "Review inválido.",
      markdown_report: validationErrors.join("\n")
    };

    fs.writeFileSync(
      path.join(outputDir, "review-output.json"),
      JSON.stringify(fallback, null, 2)
    );

    fs.writeFileSync(
      path.join(outputDir, "review-output.md"),
      fallback.markdown_report
    );

    return;
  }

  fs.writeFileSync(
    path.join(outputDir, "review-output.json"),
    JSON.stringify(result, null, 2)
  );

  fs.writeFileSync(
    path.join(outputDir, "review-output.md"),
    result.markdown_report
  );
}

run().catch((err) => {
  console.error("❌ Erro no review:", err.message || err);
  process.exit(1);
});
