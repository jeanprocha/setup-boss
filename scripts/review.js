const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { resolveOutputDir } = require("../core/run-resolver");
const { measureChatInput, writePromptSizeRecord } = require("../core/prompt-sizes");

const ROOT_DIR = path.resolve(__dirname, "..");

const client = createLLMClient();

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

const MAX_REAL_STATE_SNIPPET_SIZE = Number(
  process.env.REVIEW_REAL_STATE_SNIPPET_SIZE || 3000
);

const MAX_LEGACY_TASK_CHARS = Number(
  process.env.REVIEW_LEGACY_TASK_CHARS || 4000
);

const MAX_LEGACY_SCAN_CHARS = Number(
  process.env.REVIEW_LEGACY_SCAN_CHARS || 5000
);

const MAX_LEGACY_ARCHITECT_CHARS = Number(
  process.env.REVIEW_LEGACY_ARCHITECT_CHARS || 5000
);

const MAX_EXECUTOR_OUTPUT_CHARS = Number(
  process.env.REVIEW_EXECUTOR_OUTPUT_CHARS || 5000
);

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function compactText(value, maxLength) {
  const text = String(value || "").trim();

  if (!maxLength || text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

/** JSON numa linha para o prompt (sem pretty-print). */
function compactJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function updateAgentMetadata(outputDir, agentMeta) {
  const metadataPath = path.join(outputDir, "metadata.json");

  if (!fs.existsSync(metadataPath)) return;

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  metadata.agents = {
    ...metadata.agents,
    reviewer: agentMeta
  };

  metadata.llm = {
    ...(metadata.llm || {}),
    review: {
      model: getModelForStep("review")
    }
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
function extractExpectedAcceptanceLevelFromTask(task) {
  const match = String(task || "").match(/## Acceptance Level[\s\S]*?\[(x|X)\]\s*(\w+)/);

  if (!match) return null;

  return normalizeTaskAcceptanceLevel(match[2]);
}

function extractExpectedAcceptanceLevelFromRunContext(runContext) {
  const level =
    runContext &&
    runContext.task &&
    typeof runContext.task.acceptance_level === "string"
      ? runContext.task.acceptance_level
      : null;

  return normalizeTaskAcceptanceLevel(level);
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

function normalizeRelativePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
}

function assertSafeProjectPath(projectRoot, relativePath) {
  const normalized = normalizeRelativePath(relativePath);

  if (!normalized) {
    throw new Error("Caminho vazio não permitido.");
  }

  if (path.isAbsolute(normalized)) {
    throw new Error(`Caminho absoluto não permitido: ${relativePath}`);
  }

  if (
    normalized.includes("..") ||
    normalized.includes(".git/") ||
    normalized.includes("node_modules/")
  ) {
    throw new Error(`Caminho inseguro não permitido: ${relativePath}`);
  }

  const absolutePath = path.resolve(projectRoot, normalized);
  const resolvedProjectRoot = path.resolve(projectRoot);

  if (
    absolutePath !== resolvedProjectRoot &&
    !absolutePath.startsWith(resolvedProjectRoot + path.sep)
  ) {
    throw new Error(`Arquivo fora do projeto alvo: ${relativePath}`);
  }

  return {
    relativePath: normalized,
    absolutePath
  };
}

function createSnippetAroundNeedle(content, needle, maxSize) {
  if (!content) return "";

  const safeNeedle = String(needle || "");

  if (!safeNeedle) {
    return content.slice(0, maxSize);
  }

  const index = content.indexOf(safeNeedle);

  if (index === -1) {
    return content.slice(0, maxSize);
  }

  const half = Math.floor(maxSize / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(content.length, index + safeNeedle.length + half);

  return content.slice(start, end);
}

function getPatchNeedle(change, executorResult) {
  if (change && change.replace) return change.replace;
  if (change && change.preview) return change.preview;
  if (change && change.search) return change.search;

  if (
    change &&
    executorResult &&
    Array.isArray(executorResult.changes)
  ) {
    const match = executorResult.changes.find((item) => {
      return normalizeRelativePath(item.path) === normalizeRelativePath(change.path);
    });

    if (match && match.replace) return match.replace;
    if (match && match.search) return match.search;
  }

  return "";
}

function buildChangedFilesEvidence(changedFiles, executorResult, projectRoot) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return [];
  }

  return changedFiles.map((change) => {
    const relPath = normalizeRelativePath(change.path);
    const safe = assertSafeProjectPath(projectRoot, relPath);

    if (!fs.existsSync(safe.absolutePath)) {
      return {
        path: relPath,
        exists: false,
        reason: change.reason || "",
        operation: change.operation || "patch",
        evidence: "Arquivo não encontrado no estado real do projeto.",
        snippet: ""
      };
    }

    const content = fs.readFileSync(safe.absolutePath, "utf-8");
    const needle = getPatchNeedle(change, executorResult);
    const snippet = createSnippetAroundNeedle(
      content,
      needle,
      MAX_REAL_STATE_SNIPPET_SIZE
    );

    return {
      path: relPath,
      exists: true,
      reason: change.reason || "",
      operation: change.operation || "patch",
      before_length: change.before_length,
      after_length: change.after_length,
      search_length: change.search_length,
      replace_length: change.replace_length,
      evidence: needle
        ? "Snippet extraído próximo ao trecho alterado."
        : "Snippet inicial do arquivo extraído por ausência de trecho-alvo.",
      snippet
    };
  });
}

function getAllowedFilesFromRunContext(runContext) {
  if (
    runContext &&
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
  ) {
    return runContext.execution_context.allowed_files
      .map(normalizeRelativePath)
      .filter(Boolean);
  }

  if (
    runContext &&
    runContext.architect &&
    Array.isArray(runContext.architect.allowed_files)
  ) {
    return runContext.architect.allowed_files
      .map(normalizeRelativePath)
      .filter(Boolean);
  }

  return [];
}

function isUsableRunContext(runContext) {
  if (!runContext || typeof runContext !== "object") return false;

  const allowedFiles = getAllowedFilesFromRunContext(runContext);

  return allowedFiles.length > 0;
}

function buildFallbackRealState(architectOutput, projectRoot) {
  const paths = [...new Set(extractArchitectAllowedFiles(architectOutput))];

  return paths.map((relPath) => {
    const safe = assertSafeProjectPath(projectRoot, relPath);

    if (!fs.existsSync(safe.absolutePath)) {
      return {
        path: safe.relativePath,
        exists: false,
        operation: "(fallback)",
        evidence:
          "Arquivo lido do Architect porque executor-changes.json estava vazio.",
        snippet: ""
      };
    }

    const content = fs.readFileSync(safe.absolutePath, "utf-8");

    return {
      path: safe.relativePath,
      exists: true,
      operation: "(fallback)",
      evidence:
        "Snippet inicial lido do Architect porque executor-changes.json estava vazio.",
      snippet: content.slice(0, MAX_REAL_STATE_SNIPPET_SIZE)
    };
  });
}

function buildRunContextFallbackRealState(runContext, projectRoot) {
  const paths = [...new Set(getAllowedFilesFromRunContext(runContext))];

  return paths.map((relPath) => {
    const safe = assertSafeProjectPath(projectRoot, relPath);

    if (!fs.existsSync(safe.absolutePath)) {
      return {
        path: safe.relativePath,
        exists: false,
        operation: "(run-context-fallback)",
        evidence:
          "Arquivo lido do run-context porque executor-changes.json estava vazio.",
        snippet: ""
      };
    }

    const content = fs.readFileSync(safe.absolutePath, "utf-8");

    return {
      path: safe.relativePath,
      exists: true,
      operation: "(run-context-fallback)",
      evidence:
        "Snippet inicial lido do run-context porque executor-changes.json estava vazio.",
      snippet: content.slice(0, MAX_REAL_STATE_SNIPPET_SIZE)
    };
  });
}

function formatRealStateForPrompt(realState) {
  if (!Array.isArray(realState) || realState.length === 0) {
    return "_Nenhum estado real de arquivo disponível._";
  }

  return realState
    .map((file) => {
      return `### ${file.path}

Exists: ${file.exists ? "yes" : "no"}
Operation: ${file.operation || "(unknown)"}
Reason: ${file.reason || "(not provided)"}
Evidence: ${file.evidence || "(not provided)"}
Before length: ${file.before_length ?? "(unknown)"}
After length: ${file.after_length ?? "(unknown)"}
Search length: ${file.search_length ?? "(unknown)"}
Replace length: ${file.replace_length ?? "(unknown)"}

\`\`\`
${file.snippet || ""}
\`\`\``;
    })
    .join("\n\n");
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
        violations: runContext.architect && runContext.architect.violations,
        allowed_files: runContext.architect && runContext.architect.allowed_files,
        plan_summary: runContext.architect && runContext.architect.plan_summary,
        risks: runContext.architect && runContext.architect.risks,
        stop_criteria: runContext.architect && runContext.architect.stop_criteria
      },
      execution_context: runContext.execution_context
    },
    null,
    2
  );
}

function buildLegacyContextForPrompt({ task, scan, architect }) {
  return JSON.stringify(
    {
      mode: "legacy-fallback",
      warning:
        "run-context.json ausente ou inválido. Contexto legado foi truncado para reduzir custo.",
      task_excerpt: compactText(task, MAX_LEGACY_TASK_CHARS),
      scan_excerpt: compactText(scan, MAX_LEGACY_SCAN_CHARS),
      architect_excerpt: compactText(architect, MAX_LEGACY_ARCHITECT_CHARS)
    },
    null,
    2
  );
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

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputArg);
  } catch (err) {
    throw new Error(
      `Usage: node scripts/review.js <runId> — ${err.message || err}`
    );
  }

  ensureDir(outputDir);

  const reviewerAgentPath = path.join(ROOT_DIR, "agents", "reviewer.md");
  const { content: reviewerAgent, metadata: agentMeta } =
    loadAgent(reviewerAgentPath);

  updateAgentMetadata(outputDir, agentMeta);

  const metadataPath = path.join(outputDir, "metadata.json");
  const pipelineMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  const projectRoot = pipelineMetadata.projectRoot;

  const runContext = readJsonIfExists(
    path.join(outputDir, "run-context.json"),
    null
  );

  const hasUsableRunContext = isUsableRunContext(runContext);

  const executor = compactText(
    readIfExists(path.join(outputDir, "executor-output.md")),
    MAX_EXECUTOR_OUTPUT_CHARS
  );

  const changedFiles = readJsonIfExists(
    path.join(outputDir, "executor-changes.json"),
    []
  );

  const executorResult = readJsonIfExists(
    path.join(outputDir, "executor-result.json"),
    null
  );

  let task = "";
  let scan = "";
  let architect = "";
  let expectedLevel = null;
  let promptContext = "";

  if (hasUsableRunContext) {
    expectedLevel = extractExpectedAcceptanceLevelFromRunContext(runContext);
    promptContext = buildCompactRunContextForPrompt(runContext);
  } else {
    task = readIfExists(path.join(outputDir, "task.md"));
    scan = readIfExists(path.join(outputDir, "scan-output.md"));
    architect = readIfExists(path.join(outputDir, "architect-output.md"));
    expectedLevel = extractExpectedAcceptanceLevelFromTask(task);

    promptContext = buildLegacyContextForPrompt({
      task,
      scan,
      architect
    });
  }

  const realState =
    Array.isArray(changedFiles) && changedFiles.length > 0
      ? buildChangedFilesEvidence(changedFiles, executorResult, projectRoot)
      : hasUsableRunContext
        ? buildRunContextFallbackRealState(runContext, projectRoot)
        : buildFallbackRealState(architect, projectRoot);

  const levelHint =
    expectedLevel ??
    "(não detectado na task/run-context — preencha acceptance_level conforme o nível avaliado)";

  const reviewModel = getModelForStep("review");

  const reviewChatInput = [
    {
      role: "system",
      content: `
${reviewerAgent}

Regras:
- Acceptance level esperado: ${levelHint}
- APPROVED só com evidência suficiente; estado real em disco é a fonte principal quando disponível.
- REJECTED implica requires_correction = true (entrega insuficiente para o nível).
- BLOCKED só por falta de definição, ambiente ou evidência impeditiva (não é ciclo de correção).
        `.trim(),
    },
    {
      role: "user",
      content: `
# CONTEXT MODE

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

# RUN CONTEXT

\`\`\`json
${promptContext}
\`\`\`

# EXECUTOR OUTPUT

${executor || "(executor-output.md vazio ou ausente)"}

# EXECUTOR RESULT JSON

\`\`\`json
${compactJson(executorResult)}
\`\`\`

# EXECUTOR CHANGES JSON

\`\`\`json
${compactJson(changedFiles)}
\`\`\`

# REAL FILE STATE PATCH EVIDENCE

${formatRealStateForPrompt(realState)}
        `.trim(),
    },
  ];

  writePromptSizeRecord(outputDir, "review", {
    ...measureChatInput(reviewChatInput),
    blocks: {
      reviewer_agent: reviewerAgent.length,
      user_context: reviewChatInput[1].content.length,
    },
  });

  const response = await client.responses.create({
    model: reviewModel,
    input: reviewChatInput,
    text: {
      format: {
        type: "json_schema",
        name: "review",
        strict: true,
        schema: REVIEW_SCHEMA
      }
    }
  });

  recordLLMUsage({
    outputDir,
    step: "review",
    model: reviewModel,
    usage: response.usage,
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

    appendProblemHistoryEntry({
      outputDir,
      projectRoot,
      step: "review",
      status: "failed",
      severity: "medium",
      type: "unknown_error",
      title: "Validação do schema do review falhou",
      summary: fallback.summary,
      cause: "schema_validation",
      evidence: validationErrors.map((e) => String(e).slice(0, 800)),
      files: [],
      model: reviewModel,
      usage: response.usage,
      extra: {
        acceptance_level: fallback.acceptance_level,
        requires_correction: fallback.requires_correction,
        blocking_issues: fallback.blocking_issues || [],
        warnings: fallback.warnings || [],
      },
    });

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

  if (result.status === "blocked") {
    appendProblemHistoryEntry({
      outputDir,
      projectRoot,
      step: "review",
      status: "blocked",
      severity: "high",
      type: "review_blocked",
      title: "Review bloqueado",
      summary: result.summary,
      cause: "review_gate",
      evidence: [
        ...(Array.isArray(result.blocking_issues) ? result.blocking_issues : []),
        ...(Array.isArray(result.warnings) ? result.warnings : []),
      ]
        .map((e) => String(e).slice(0, 600))
        .slice(0, 25),
      files: [],
      model: reviewModel,
      usage: response.usage,
      extra: {
        acceptance_level: result.acceptance_level,
        requires_correction: result.requires_correction,
        blocking_issues: result.blocking_issues || [],
        warnings: result.warnings || [],
      },
    });
  }
}

run().catch((err) => {
  console.error("❌ Erro no review:", err.message || err);
  process.exit(1);
});