const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { resolveOutputDir } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");
const { appendProblemHistoryEntry } = require("../core/problem-history");

const ROOT_DIR = path.resolve(__dirname, "..");

const client = createLLMClient();

const EXECUTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "changes", "blocked_reason", "evidence"],
  properties: {
    status: {
      type: "string",
      enum: ["success", "blocked"]
    },
    summary: {
      type: "string"
    },
    blocked_reason: {
      type: "string"
    },
    evidence: {
      type: "array",
      items: { type: "string" }
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["operation", "path", "search", "replace", "reason"],
        properties: {
          operation: {
            type: "string",
            enum: ["patch"]
          },
          path: {
            type: "string"
          },
          search: {
            type: "string"
          },
          replace: {
            type: "string"
          },
          reason: {
            type: "string"
          }
        }
      }
    }
  }
};

const MAX_CONTEXT_SNIPPET_SIZE = Number(
  process.env.EXECUTOR_CONTEXT_SNIPPET_SIZE || 6000
);

const MAX_PREVIEW_SIZE = Number(
  process.env.EXECUTOR_CHANGE_PREVIEW_SIZE || 1200
);

const MAX_LEGACY_SCAN_CHARS = Number(
  process.env.EXECUTOR_LEGACY_SCAN_CHARS || 6000
);

const MAX_LEGACY_ARCHITECT_CHARS = Number(
  process.env.EXECUTOR_LEGACY_ARCHITECT_CHARS || 6000
);

const MAX_LEGACY_TASK_CHARS = Number(
  process.env.EXECUTOR_LEGACY_TASK_CHARS || 4000
);

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} não encontrado: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function compactText(value, maxLength) {
  const text = String(value || "").trim();

  if (!maxLength || text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
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

function extractAllowedFiles(architectOutput) {
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

function uniqueNormalizedPaths(paths) {
  return [
    ...new Set(
      (Array.isArray(paths) ? paths : [])
        .map(normalizeRelativePath)
        .filter(Boolean)
    )
  ];
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

function createContextSnippet(content) {
  if (!content) return "";

  if (content.length <= MAX_CONTEXT_SNIPPET_SIZE) {
    return content;
  }

  const headSize = Math.floor(MAX_CONTEXT_SNIPPET_SIZE * 0.55);
  const tailSize = MAX_CONTEXT_SNIPPET_SIZE - headSize;

  return [
    content.slice(0, headSize),
    "",
    `/* ... conteúdo omitido para reduzir tokens (${content.length} chars totais) ... */`,
    "",
    content.slice(-tailSize)
  ].join("\n");
}

function readAllowedProjectFiles(projectRoot, allowedFiles) {
  return allowedFiles.map((filePath) => {
    const safe = assertSafeProjectPath(projectRoot, filePath);
    const exists = fs.existsSync(safe.absolutePath);
    const content = exists ? fs.readFileSync(safe.absolutePath, "utf-8") : "";

    return {
      path: safe.relativePath,
      exists,
      size: content.length,
      snippet: createContextSnippet(content)
    };
  });
}

function createPreviewAround(content, needle) {
  if (!content) return "";

  const safeNeedle = String(needle || "");

  if (!safeNeedle) {
    return content.slice(0, MAX_PREVIEW_SIZE);
  }

  const index = content.indexOf(safeNeedle);

  if (index === -1) {
    return content.slice(0, MAX_PREVIEW_SIZE);
  }

  const half = Math.floor(MAX_PREVIEW_SIZE / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(content.length, index + safeNeedle.length + half);

  return content.slice(start, end);
}

function applyPatchToContent(content, search, replace) {
  if (!search) {
    throw new Error("Patch inválido: campo search vazio.");
  }

  const count = content.split(search).length - 1;

  if (count === 0) {
    throw new Error("Patch inválido: trecho search não encontrado no arquivo real.");
  }

  if (count > 1) {
    throw new Error(
      `Patch inseguro: trecho search encontrado ${count} vezes. O search deve ser único.`
    );
  }

  return content.replace(search, replace);
}

function applyChanges(projectRoot, allowedFiles, changes) {
  const allowedSet = new Set(allowedFiles.map(normalizeRelativePath));
  const applied = [];

  for (const change of changes) {
    const relativePath = normalizeRelativePath(change.path);

    if (!allowedSet.has(relativePath)) {
      throw new Error(`Executor tentou alterar arquivo fora do escopo: ${relativePath}`);
    }

    if (change.operation !== "patch") {
      throw new Error(`Operação inválida no executor: ${change.operation}`);
    }

    const safe = assertSafeProjectPath(projectRoot, relativePath);

    if (!fs.existsSync(safe.absolutePath)) {
      throw new Error(`Arquivo alvo do patch não existe: ${relativePath}`);
    }

    const before = fs.readFileSync(safe.absolutePath, "utf-8");
    const after = applyPatchToContent(before, change.search, change.replace);

    ensureDir(path.dirname(safe.absolutePath));
    fs.writeFileSync(safe.absolutePath, after, "utf-8");

    applied.push({
      operation: change.operation,
      path: relativePath,
      reason: change.reason,
      before_length: before.length,
      after_length: after.length,
      search_length: change.search.length,
      replace_length: change.replace.length,
      preview: createPreviewAround(after, change.replace),
      search: change.search,
      replace: change.replace
    });
  }

  return applied;
}

function updateAgentMetadata(outputDir, agentMeta) {
  const metadataPath = path.join(outputDir, "metadata.json");

  if (!fs.existsSync(metadataPath)) return;

  const metadata = readJson(metadataPath);

  metadata.agents = {
    ...metadata.agents,
    executor: agentMeta
  };

  metadata.llm = {
    ...(metadata.llm || {}),
    executor: {
      model: getModelForStep("executor")
    }
  };

  writeJson(metadataPath, metadata);
}

function trimMsg(value, maxLen = 1200) {
  const t = String(value || "").trim();

  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;
}

function classifyPatchFailure(err) {
  const message = err && err.message ? err.message : String(err || "");

  if (message.includes("trecho search não encontrado")) {
    return {
      type: "patch_search_not_found",
      cause: "search_not_found",
      title: "Trecho search não encontrado no arquivo real",
    };
  }

  if (message.includes("trecho search encontrado") && message.includes("vezes")) {
    return {
      type: "patch_search_not_unique",
      cause: "search_not_unique",
      title: "Trecho search ambíguo (não único)",
    };
  }

  if (message.includes("fora do escopo")) {
    return {
      type: "path_safety_block",
      cause: "out_of_allowed_files",
      title: "Alteração fora do escopo permitido",
    };
  }

  if (message.includes("Caminho inseguro") || message.includes("fora do projeto")) {
    return {
      type: "path_safety_block",
      cause: "path_unsafe",
      title: "Caminho bloqueado por segurança",
    };
  }

  if (message.includes("Caminho absoluto não permitido")) {
    return {
      type: "path_safety_block",
      cause: "absolute_path",
      title: "Caminho absoluto não permitido",
    };
  }

  if (message.includes("Operação inválida")) {
    return {
      type: "executor_blocked",
      cause: "invalid_operation",
      title: "Operação inválida no executor",
    };
  }

  if (message.includes("não existe")) {
    return {
      type: "missing_file",
      cause: "missing_file",
      title: "Arquivo alvo do patch não existe",
    };
  }

  return {
    type: "patch_apply_failed",
    cause: "apply_failed",
    title: "Falha ao aplicar patch",
  };
}

function inferModelBlockedType(result) {
  const br = String(result?.blocked_reason || "");
  const ev = (result?.evidence || []).join(" ");

  if (
    br.includes("objeto JSON") ||
    br.includes("não é um objeto") ||
    ev.includes("Resultado ausente ou inválido")
  ) {
    return {
      type: "llm_invalid_json",
      cause: "invalid_model_payload",
      title: "Resultado inválido do modelo",
      severity: "high",
    };
  }

  if (br.includes("sucesso sem patches") || ev.includes("changes vazia")) {
    return {
      type: "executor_blocked",
      cause: "no_changes_success",
      title: "Executor retornou sucesso sem patches aplicáveis",
      severity: "medium",
    };
  }

  return {
    type: "executor_blocked",
    cause: "executor_declined",
    title: "Executor bloqueado",
    severity: "medium",
  };
}

function logExecutorProblem({
  outputDir,
  metadata,
  projectRoot,
  hasUsableRunContext,
  model,
  usage,
  result,
  patchError,
  type,
  cause,
  title,
  summary,
  severity,
  files,
}) {
  const blockedReason = result?.blocked_reason || patchError || null;

  appendProblemHistoryEntry({
    outputDir,
    projectRoot,
    metadata,
    step: "executor",
    status: "blocked",
    severity: severity || "high",
    type: type || "executor_blocked",
    title: title || "Executor bloqueado",
    summary: summary || result?.summary || trimMsg(patchError, 900) || null,
    cause: cause || null,
    evidence: Array.isArray(result?.evidence)
      ? result.evidence.map((e) => trimMsg(e, 600))
      : patchError
        ? [trimMsg(patchError, 900)]
        : [],
    files: files || [],
    model,
    usage,
    runId: metadata?.runId,
    extra: {
      context_mode: hasUsableRunContext ? "run-context" : "legacy-fallback",
      blocked_reason: blockedReason,
      changes_count: Array.isArray(result?.changes) ? result.changes.length : 0,
      ...(patchError
        ? { patch_error: trimMsg(patchError, 800), failed_operation: "patch" }
        : {}),
    },
  });
}

function writeBlockedOutput(outputDir, result) {
  writeJson(path.join(outputDir, "executor-result.json"), result);

  fs.writeFileSync(
    path.join(outputDir, "executor-output.md"),
    `# Executor Output

## Status

blocked

## Arquivos alterados

- _(nenhum arquivo escrito nesta execução — estado bloqueado)._

## Reason

${result.blocked_reason}

## Evidence

${(result.evidence || []).map((e) => `- ${e}`).join("\n")}
`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(outputDir, "executor-changes.json"),
    JSON.stringify([], null, 2),
    "utf-8"
  );
}

function normalizeExecutorResult(result) {
  if (!result || typeof result !== "object") {
    return {
      status: "blocked",
      summary: "Executor retornou resultado inválido.",
      blocked_reason: "Resposta do modelo não é um objeto JSON válido.",
      evidence: ["Resultado ausente ou inválido."],
      changes: []
    };
  }

  if (!Array.isArray(result.evidence)) {
    result.evidence = [];
  }

  if (!Array.isArray(result.changes)) {
    result.changes = [];
  }

  if (result.status === "success" && result.changes.length === 0) {
    result.status = "blocked";
    result.blocked_reason =
      "Executor retornou sucesso sem patches — inválido para tasks de implementação.";
    result.evidence.push("Lista changes vazia para task que exige implementação.");
  }

  if (result.status !== "success" && result.status !== "blocked") {
    result.status = "blocked";
    result.blocked_reason = "Status inválido retornado pelo executor.";
    result.evidence.push("Status deve ser success ou blocked.");
    result.changes = [];
  }

  if (result.status === "blocked") {
    result.changes = [];
    result.blocked_reason =
      result.blocked_reason || "Executor bloqueou sem motivo detalhado.";
  }

  return result;
}

function isUsableRunContext(runContext) {
  if (!runContext || typeof runContext !== "object") return false;

  const allowedFiles =
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
      ? runContext.execution_context.allowed_files
      : runContext.architect && Array.isArray(runContext.architect.allowed_files)
        ? runContext.architect.allowed_files
        : [];

  return allowedFiles.length > 0;
}

function getAllowedFilesFromRunContext(runContext) {
  if (!runContext || typeof runContext !== "object") return [];

  if (
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
  ) {
    return uniqueNormalizedPaths(runContext.execution_context.allowed_files);
  }

  if (
    runContext.architect &&
    Array.isArray(runContext.architect.allowed_files)
  ) {
    return uniqueNormalizedPaths(runContext.architect.allowed_files);
  }

  return [];
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
        stop_criteria: runContext.architect && runContext.architect.stop_criteria
      },
      execution_context: runContext.execution_context
    },
    null,
    2
  );
}

function buildFallbackRunContext({
  task,
  scan,
  architect,
  allowedFiles,
}) {
  return JSON.stringify(
    {
      mode: "legacy_fallback",
      warning:
        "run-context.json ausente ou inválido. Contexto legado foi truncado para reduzir custo.",
      task_excerpt: compactText(task, MAX_LEGACY_TASK_CHARS),
      scan_excerpt: compactText(scan, MAX_LEGACY_SCAN_CHARS),
      architect_excerpt: compactText(architect, MAX_LEGACY_ARCHITECT_CHARS),
      allowed_files: allowedFiles
    },
    null,
    2
  );
}

async function main() {
  const outputName = process.argv[2];

  if (!outputName) {
    console.log("Uso: npm run executor <runId>");
    return;
  }

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputName);
  } catch (err) {
    console.error(err.message || err);
    return;
  }

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const architectPath = path.join(outputDir, "architect-output.md");
  const runContextPath = path.join(outputDir, "run-context.json");

  ensureFile(metadataPath, "metadata.json");

  const metadata = readJson(metadataPath);
  const projectRoot = metadata.projectRoot;

  ensureFile(projectRoot, "Projeto alvo");

  const runContext = readJsonIfExists(runContextPath, null);
  const hasUsableRunContext = isUsableRunContext(runContext);

  let task = "";
  let scan = "";
  let architect = "";
  let allowedFiles = [];

  if (hasUsableRunContext) {
    allowedFiles = getAllowedFilesFromRunContext(runContext);
  } else {
    const taskPath = path.join(outputDir, "task.md");

    ensureFile(taskPath, "task.md");
    ensureFile(architectPath, "architect-output.md");

    task = readIfExists(taskPath);
    scan = readIfExists(path.join(outputDir, "scan-output.md"));
    architect = readIfExists(architectPath);
    allowedFiles = uniqueNormalizedPaths(extractAllowedFiles(architect));
  }

  if (allowedFiles.length === 0) {
    const msg = hasUsableRunContext
      ? "run-context.json não informou arquivos permitidos para o executor."
      : "Architect não informou arquivos prováveis para o executor.";

    appendProblemHistoryEntry({
      outputDir,
      metadata,
      projectRoot,
      step: "executor",
      status: "blocked",
      severity: "high",
      type: "executor_blocked",
      title: hasUsableRunContext
        ? "Run-context sem arquivos permitidos"
        : "Architect sem arquivos prováveis",
      summary: msg,
      cause: "no_allowed_files",
      evidence: [msg],
      files: [],
      model: getModelForStep("executor"),
      extra: {
        context_mode: hasUsableRunContext ? "run-context" : "legacy-fallback",
      },
    });

    throw new Error(msg);
  }

  const correction = readIfExists(path.join(outputDir, "correction-instructions.md"));
  const projectFiles = readAllowedProjectFiles(projectRoot, allowedFiles);

  const agentPath = path.join(ROOT_DIR, "agents", "executor.md");
  const { content: agent, metadata: agentMeta } = loadAgent(agentPath);

  updateAgentMetadata(outputDir, agentMeta);

  const promptContext = hasUsableRunContext
    ? buildCompactRunContextForPrompt(runContext)
    : buildFallbackRunContext({
        task,
        scan,
        architect,
        allowedFiles,
      });

  const prompt = `
${agent}

## PROJECT ROOT

${projectRoot}

## CONTEXT MODE

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

## RUN CONTEXT

\`\`\`json
${promptContext}
\`\`\`

## CORRECTION INSTRUCTIONS

${correction || "(nenhuma correção pendente)"}

## CURRENT FILE SNIPPETS

Os arquivos abaixo foram truncados para reduzir tokens.
Use os snippets apenas para localizar o ponto de alteração.
Você NÃO deve retornar arquivo completo.

${projectFiles
  .map((file) => {
    return `### ${file.path}

Exists: ${file.exists ? "yes" : "no"}
Size: ${file.size} chars

\`\`\`
${file.snippet}
\`\`\``;
  })
  .join("\n\n")}

## EXECUTION RULE

Resposta só JSON (schema). Paths permitidos: \`allowed_files\` no RUN CONTEXT (relativos ao PROJECT ROOT).

- \`operation\`: \`patch\` apenas.
- \`path\`: relativo, ∈ \`allowed_files\`.
- \`search\`: texto exato presente no ficheiro real, **uma** ocorrência.
- \`replace\`: texto final do trecho.
- Não reescrever ficheiro inteiro nem usar caminhos fora de \`allowed_files\`.
- Implementação exige alteração: \`success\` com \`changes\` não vazio; se não aplicável, \`blocked\` + motivo.
- Snippet insuficiente para patch seguro → \`blocked\`.
`.trim();

  writePromptSizeRecord(outputDir, "executor", {
    total_prompt_chars: prompt.length,
    user_chars: prompt.length,
    blocks: {
      agent: agent.length,
    },
  });

  fs.writeFileSync(path.join(outputDir, "executor-input.md"), prompt, "utf-8");

  const executorModel = getModelForStep("executor");

  const response = await client.responses.create({
    model: executorModel,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "executor_result",
        strict: true,
        schema: EXECUTOR_SCHEMA
      }
    }
  });

  recordLLMUsage({
    outputDir,
    step: "executor",
    model: executorModel,
    usage: response.usage,
  });

  const result = normalizeExecutorResult(JSON.parse(response.output_text));

  if (result.status === "blocked") {
    writeBlockedOutput(outputDir, result);

    const metaBlocked = inferModelBlockedType(result);

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result,
      type: metaBlocked.type,
      cause: metaBlocked.cause,
      title: metaBlocked.title,
      summary: result.summary,
      severity: metaBlocked.severity,
    });

    console.log("⛔ Executor bloqueado.");
    return;
  }

  let applied;

  try {
    applied = applyChanges(projectRoot, allowedFiles, result.changes);
  } catch (error) {
    const blocked = {
      status: "blocked",
      summary: "Patch não pôde ser aplicado com segurança.",
      blocked_reason: error.message || String(error),
      evidence: [
        "Nenhum arquivo foi considerado aprovado pelo executor após falha de aplicação.",
        "A correção deve gerar um patch com search único e existente no arquivo real."
      ],
      changes: []
    };

    const patchClass = classifyPatchFailure(error);
    const filesFromAttempt = Array.isArray(result.changes)
      ? result.changes
          .map((c) => normalizeRelativePath(c.path))
          .filter(Boolean)
      : [];

    writeBlockedOutput(outputDir, blocked);

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result: blocked,
      patchError: error.message,
      type: patchClass.type,
      cause: patchClass.cause,
      title: patchClass.title,
      summary: blocked.summary,
      severity: "high",
      files: filesFromAttempt,
    });

    console.log("⛔ Executor bloqueado durante aplicação do patch.");
    return;
  }

  result.evidence = applied.map((item) => `${item.path} atualizado com patch seguro`);

  writeJson(path.join(outputDir, "executor-result.json"), result);

  writeJson(path.join(outputDir, "executor-changes.json"), applied);

  fs.writeFileSync(
    path.join(outputDir, "executor-output.md"),
    `# Executor Output

## Status

success

## Context Mode

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

## Model

${executorModel}

## Arquivos alterados

${applied.length ? applied.map((item) => `- \`${item.path}\``).join("\n") : "- _(lista vazia em changes — estado inesperado)._"}

## Summary

${result.summary}

## Applied Patches

${applied
  .map(
    (item) => `
### ${item.path}

Operation:
${item.operation}

Reason:
${item.reason}

Before length:
${item.before_length}

After length:
${item.after_length}

Search length:
${item.search_length}

Replace length:
${item.replace_length}

Snippet da alteração:
\`\`\`
${item.preview}
\`\`\`
`
  )
  .join("\n")}
`,
    "utf-8"
  );

  console.log(
    `✅ Executor concluído com PATCH (${hasUsableRunContext ? "run-context" : "legacy-fallback"})`
  );
}

main().catch((error) => {
  console.error("❌ Erro no executor:", error.message || error);

  const errorLogPath = path.join(ROOT_DIR, ".setup-boss", "executor-error.log");

  try {
    const outputName = process.argv[2];

    if (outputName) {
      let outputDir;

      try {
        outputDir = resolveOutputDir(outputName, { warnLegacy: false });
      } catch (_) {
        outputDir = null;
      }

      if (outputDir) {
        const metaPath = path.join(outputDir, "metadata.json");
        const metadata = fs.existsSync(metaPath)
          ? readJson(metaPath)
          : {};

        if (metadata.projectRoot) {
          appendProblemHistoryEntry({
            outputDir,
            metadata,
            projectRoot: metadata.projectRoot,
            step: "executor",
            status: "error",
            severity: "critical",
            type: "unknown_error",
            title: "Erro fatal no executor",
            summary: trimMsg(error.message || String(error)),
            cause: "exception",
            evidence: [trimMsg(error.stack || error.message, 2000)],
            files: [],
            model: getModelForStep("executor"),
            extra: {},
          });
        }

        fs.writeFileSync(
          path.join(outputDir, "executor-error.log"),
          String(error.stack || error),
          "utf-8"
        );
        process.exit(0);
        return;
      }
    }
  } catch (_) {
    /* noop */
  }

  fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
  fs.writeFileSync(errorLogPath, String(error.stack || error), "utf-8");

  process.exit(0);
});