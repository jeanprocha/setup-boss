const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { resolveOutputDir } = require("../core/run-resolver");
const { measureChatInput, writePromptSizeRecord } = require("../core/prompt-sizes");
const {
  compactText,
  extractSection,
  normalizeRelativePath,
  assertSafeProjectPath,
  summaryDeclaresNoOpImplementation,
  isConcreteNoOpEvidence,
  isUsableRunContext,
  getAllowedFilesFromRunContext,
  buildCompactRunContextForPrompt,
} = require("./shared-utils");
const { createStageContextFromOutputDir } = require("./runtime/runtime-context");
const { createOutputFs } = require("./runtime/output-fs");
const { readProjectUtf8 } = require("./runtime/virtual-file-state");
const { isDeterministicReviewEnabled, getReviewEngineMode } = require("./review-runtime/feature-flags");
const { runReviewOrchestration } = require("./review-runtime/orchestration/review-orchestrator");
const { finalizeDeterministicReviewObservability } = require("./review-runtime/deterministic-review-runtime");
const { applyDeterministicReviewGateCliEffects } = require("./review-runtime/deterministic-review-gate");
const {
  finalizeBaselineRegressionForRun,
  applyBaselineRegressionGateCliEffects,
} = require("./review-runtime/deterministic-review-baseline");

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

/** JSON numa linha para o prompt (sem pretty-print). */
function compactJson(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function updateAgentMetadata(outputDir, agentMeta, out) {
  const metadataPath = path.join(outputDir, "metadata.json");

  if (out) {
    if (!out.exists(metadataPath)) return;
  } else if (!fs.existsSync(metadataPath)) {
    return;
  }

  const metadata = out
    ? out.readJson(metadataPath)
    : JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

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

  if (out) out.writeJson(metadataPath, metadata);
  else
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
}

function writeReviewOutputs(out, outputDir, jsonObj, mdText) {
  const jPath = path.join(outputDir, "review-output.json");
  const mPath = path.join(outputDir, "review-output.md");
  if (out) {
    out.writeJson(jPath, jsonObj);
    out.writeUtf8(mPath, mdText);
  } else {
    fs.writeFileSync(jPath, JSON.stringify(jsonObj, null, 2), "utf-8");
    fs.writeFileSync(mPath, mdText, "utf-8");
  }
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

function extractArchitectAllowedFiles(architectOutput) {
  const section = extractSection(architectOutput, "Arquivos prováveis");

  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.replace(/`/g, "").trim());
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

function buildChangedFilesEvidence(changedFiles, executorResult, projectRoot, overlay) {
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

    let st;

    try {
      st = fs.statSync(safe.absolutePath);
    } catch (_) {
      return {
        path: relPath,
        exists: false,
        reason: change.reason || "",
        operation: change.operation || "patch",
        evidence: "Não foi possível ler o estado do caminho no projeto.",
        snippet: ""
      };
    }

    if (st.isDirectory()) {
      return {
        path: relPath,
        exists: true,
        reason: change.reason || "",
        operation: change.operation || "patch",
        evidence:
          "Caminho é diretório — não é ficheiro aplicável a PATCH / estado real.",
        snippet: "[blocked: path is a directory]",
      };
    }

    const content = readProjectUtf8(projectRoot, relPath, overlay || null);
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

function buildFallbackRealState(architectOutput, projectRoot, overlay) {
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

    let stFallback;

    try {
      stFallback = fs.statSync(safe.absolutePath);
    } catch (_) {
      return {
        path: safe.relativePath,
        exists: false,
        operation: "(fallback)",
        evidence: "Não foi possível ler o caminho indicado pelo Architect.",
        snippet: ""
      };
    }

    if (stFallback.isDirectory()) {
      return {
        path: safe.relativePath,
        exists: true,
        operation: "(fallback)",
        evidence:
          "Caminho é diretório — Architect não deve listar pastas em Arquivos prováveis.",
        snippet: "[blocked: path is a directory]",
      };
    }

    const content = readProjectUtf8(projectRoot, safe.relativePath, overlay || null);

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

function buildRunContextFallbackRealState(runContext, projectRoot, overlay) {
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

    let stRc;

    try {
      stRc = fs.statSync(safe.absolutePath);
    } catch (_) {
      return {
        path: safe.relativePath,
        exists: false,
        operation: "(run-context-fallback)",
        evidence: "Não foi possível ler o caminho indicado pelo run-context.",
        snippet: ""
      };
    }

    if (stRc.isDirectory()) {
      return {
        path: safe.relativePath,
        exists: true,
        operation: "(run-context-fallback)",
        evidence:
          "Caminho é diretório — allowed_files deve listar apenas ficheiros concretos.",
        snippet: "[blocked: path is a directory]",
      };
    }

    const content = readProjectUtf8(projectRoot, safe.relativePath, overlay || null);

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

function buildDeterministicNoOpInsufficientEvidenceReviewResult(
  acceptanceLevel,
) {
  return {
    status: "blocked",
    acceptance_level: acceptanceLevel,
    blocking_issues: [
      "NO-OP sem evidência concreta suficiente: `executor-result` deve incluir marcadores NO-OP no summary e cada evidence com ficheiro (.tsx/.ts/.js/.md), termo técnico (placeholder, filter, busca…) e texto substantivo — ver `scripts/review.js` / `executor.js`.",
    ],
    warnings: [],
    requires_correction: false,
    summary:
      "NO-OP rejeitado (determinístico): evidência concreta insuficiente para aprovar sem LLM.",
    markdown_report:
      "**Blocked (deterministic NO-OP gate).**\n\nO executor retornou `success` sem patches, mas faltam critérios mínimos de evidence concreta (ficheiro + termo técnico + texto substantivo distribuíveis nas linhas de `evidence`) ou marcadores esperados em `summary`.",
  };
}

function resolveAcceptanceLevelForReview(expectedLevel) {
  return expectedLevel &&
    ACCEPTANCE_LEVEL_ENUM.includes(expectedLevel)
    ? expectedLevel
    : "development";
}

function buildDeterministicNoOpReviewResult(executorResult, acceptanceLevel) {
  const execSummary = String(executorResult?.summary ?? "").trim();

  const summary = execSummary.startsWith("NO-OP validado.")
    ? execSummary
    : `NO-OP validado. ${execSummary || "Executor concluiu sem alterações em disco — estado atual aceite."}`;

  return {
    status: "approved",
    acceptance_level: acceptanceLevel,
    blocking_issues: [],
    warnings: [
      "NO-OP determinístico: executor retornou `success` sem patches aplicados (`executor-changes` vazio).",
    ],
    requires_correction: false,
    summary,
    markdown_report:
      "**Approved (deterministic NO-OP).**\n\nO executor registou `success` com lista de alterações vazia, `summary` com marcador NO-OP e evidence concreta (ficheiro + trecho técnico), pelo que esta passagem aceita-se sem ciclo de correção.",
  };
}

async function runReview(ctx) {
  const out = createOutputFs(ctx.cache);
  const telemetry = ctx.telemetry;

  telemetry.stepStart("review");

  try {
  const outputDir = ctx.outputDir;

  ensureDir(outputDir);

  const reviewerAgentPath = path.join(ROOT_DIR, "agents", "reviewer.md");
  const { content: reviewerAgent, metadata: agentMeta } =
    loadAgent(reviewerAgentPath);

  updateAgentMetadata(outputDir, agentMeta, out);

  const metadataPath = path.join(outputDir, "metadata.json");
  const pipelineMetadata = out
    ? out.readJson(metadataPath)
    : JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  const projectRoot = pipelineMetadata.projectRoot;

  const virtualOverlay =
    ctx.state && ctx.state.virtual_project_overlay
      ? ctx.state.virtual_project_overlay
      : null;

  const dryRunReview =
    pipelineMetadata.execution &&
    pipelineMetadata.execution.mode === "dry_run";

  const runContextPath = path.join(outputDir, "run-context.json");
  const runContext = out
    ? out.readJsonIfExists(runContextPath, null)
    : readJsonIfExists(runContextPath, null);

  const hasUsableRunContext = isUsableRunContext(runContext);

  const executor = compactText(
    out
      ? out.readIfExists(path.join(outputDir, "executor-output.md"))
      : readIfExists(path.join(outputDir, "executor-output.md")),
    MAX_EXECUTOR_OUTPUT_CHARS
  );

  const changedFiles = out
    ? out.readJsonIfExists(path.join(outputDir, "executor-changes.json"), [])
    : readJsonIfExists(path.join(outputDir, "executor-changes.json"), []);

  const executorResult = out
    ? out.readJsonIfExists(path.join(outputDir, "executor-result.json"), null)
    : readJsonIfExists(path.join(outputDir, "executor-result.json"), null);

  let task = "";
  let scan = "";
  let architect = "";
  let expectedLevel = null;
  let promptContext = "";

  if (hasUsableRunContext) {
    expectedLevel = extractExpectedAcceptanceLevelFromRunContext(runContext);
    promptContext = buildCompactRunContextForPrompt(runContext, {
      mode: "review",
      includeArchitectViolations: true,
      safeWhitespaceCompact: true,
    });
  } else {
    task = out
      ? out.readIfExists(path.join(outputDir, "task.md"))
      : readIfExists(path.join(outputDir, "task.md"));
    scan = out
      ? out.readIfExists(path.join(outputDir, "scan-output.md"))
      : readIfExists(path.join(outputDir, "scan-output.md"));
    architect = out
      ? out.readIfExists(path.join(outputDir, "architect-output.md"))
      : readIfExists(path.join(outputDir, "architect-output.md"));
    expectedLevel = extractExpectedAcceptanceLevelFromTask(task);

    promptContext = buildLegacyContextForPrompt({
      task,
      scan,
      architect
    });
  }

  const acceptanceLevelResolved = resolveAcceptanceLevelForReview(expectedLevel);

  let deterministicReviewBundle = null;
  if (isDeterministicReviewEnabled()) {
    deterministicReviewBundle = runReviewOrchestration({
      outputDir,
      telemetry,
      reviewEngineMode: getReviewEngineMode(),
      outputFs: out,
    });
    if (!deterministicReviewBundle.ok) {
      console.warn(
        `⚠️ Review engine (${getReviewEngineMode()}) falhou — fallback LLM: ${deterministicReviewBundle.error || "unknown"}`,
      );
    }
  }

  const executorSuccessWithoutPatches =
    executorResult &&
    executorResult.status === "success" &&
    Array.isArray(changedFiles) &&
    changedFiles.length === 0;

  if (executorSuccessWithoutPatches) {
    const okSummaryMarkers = summaryDeclaresNoOpImplementation(
      executorResult.summary,
    );
    const okConcreteEvidence = isConcreteNoOpEvidence(
      executorResult.evidence,
    );

    if (!okSummaryMarkers || !okConcreteEvidence) {
      const blockedDeterministic =
        buildDeterministicNoOpInsufficientEvidenceReviewResult(
          acceptanceLevelResolved,
        );

      const validationBlocked = validateReviewResult(
        blockedDeterministic,
        expectedLevel,
      );

      if (validationBlocked.length === 0) {
        writePromptSizeRecord(outputDir, "review", {
          total_prompt_chars: 0,
          user_chars: 0,
          system_chars: 0,
          blocks: {
            reviewer_agent: 0,
            user_context: 0,
            deterministic_no_op_insufficient_evidence: 1,
          },
        });

        writeReviewOutputs(out, outputDir, blockedDeterministic, blockedDeterministic.markdown_report);

        appendProblemHistoryEntry({
          outputDir,
          projectRoot,
          step: "review",
          status: "blocked",
          severity: "high",
          type: "review_blocked",
          title: "NO-OP determinístico rejeitado",
          summary: blockedDeterministic.summary,
          cause: "no_op_concrete_evidence_gate",
          evidence: blockedDeterministic.blocking_issues.map((x) =>
            String(x).slice(0, 600),
          ),
          files: [],
          model: getModelForStep("review"),
          usage: null,
          extra: {
            acceptance_level: blockedDeterministic.acceptance_level,
            requires_correction: blockedDeterministic.requires_correction,
            blocking_issues: blockedDeterministic.blocking_issues || [],
            warnings: blockedDeterministic.warnings || [],
          },
        });

        console.log(
          "⛔ Review bloqueado (deterministico): evidence de NO-OP insuficiente.",
        );
        return;
      }
    }

    if (okSummaryMarkers && okConcreteEvidence) {
      const deterministic = buildDeterministicNoOpReviewResult(
        executorResult,
        acceptanceLevelResolved,
      );

      const validationErrors = validateReviewResult(
        deterministic,
        expectedLevel,
      );

      if (validationErrors.length === 0) {
        writePromptSizeRecord(outputDir, "review", {
          total_prompt_chars: 0,
          user_chars: 0,
          system_chars: 0,
          blocks: {
            reviewer_agent: 0,
            user_context: 0,
            deterministic_no_op: 1,
          },
        });

        let legacyNoOp = deterministic;
        if (deterministicReviewBundle && deterministicReviewBundle.ok) {
          const s = deterministicReviewBundle.review_results.summary;
          if (
            s &&
            (s.status === "rejected" ||
              s.status === "blocked" ||
              (s.status === "partial" &&
                (s.requires_correction || s.requires_manual_review)))
          ) {
            legacyNoOp = deterministicReviewBundle.legacy_review;
          }
        }

        writeReviewOutputs(out, outputDir, legacyNoOp, legacyNoOp.markdown_report);

        console.log("✅ Review aprovado em NO-OP determinístico (sem LLM).");
        return;
      }
    }
  }

  if (
    isDeterministicReviewEnabled() &&
    deterministicReviewBundle &&
    deterministicReviewBundle.ok
  ) {
    writePromptSizeRecord(outputDir, "review", {
      total_prompt_chars: 0,
      user_chars: 0,
      system_chars: 0,
      blocks: {
        reviewer_agent: 0,
        user_context: 0,
        deterministic_review_engine: 1,
      },
    });
    const lr = deterministicReviewBundle.legacy_review;
    writeReviewOutputs(out, outputDir, lr, lr.markdown_report);
    console.log(
      `📋 Review determinístico (${getReviewEngineMode()}): ${lr.status}`,
    );
    return;
  }

  const realState =
    Array.isArray(changedFiles) && changedFiles.length > 0
      ? buildChangedFilesEvidence(changedFiles, executorResult, projectRoot, virtualOverlay)
      : hasUsableRunContext
        ? buildRunContextFallbackRealState(runContext, projectRoot, virtualOverlay)
        : buildFallbackRealState(architect, projectRoot, virtualOverlay);

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
- ${dryRunReview ? "Modo **dry-run**: quando há patches nesta passagem, os snippets em REAL FILE STATE PATCH EVIDENCE são **virtuais (overlay)** — representam o conteúdo após patches simulados, não necessariamente o disco físico até um apply posterior." : "APPROVED só com evidência suficiente; estado real em disco é a fonte principal quando disponível."}
- REJECTED implica requires_correction = true (entrega insuficiente para o nível).
- BLOCKED só por falta de definição, ambiente ou evidência impeditiva (não é ciclo de correção).
        `.trim(),
    },
    {
      role: "user",
      content: `
${dryRunReview ? `# EXECUTION MODE\n\nDRY RUN — patches desta run **não** foram gravados no projeto-alvo; use executor-changes.json / patch-preview.md para auditoria antes do apply físico.\n\n` : ""}# CONTEXT MODE

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

  telemetry.llmCall({ step: "review", model: reviewModel });

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

  telemetry.llmResponse({ step: "review", model: reviewModel });

  recordLLMUsage({
    outputDir,
    step: "review",
    model: reviewModel,
    usage: response.usage,
  });

  if (ctx.cache) {
    ctx.cache.invalidate(metadataPath);
  }

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

    writeReviewOutputs(out, outputDir, fallback, fallback.markdown_report);

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

  writeReviewOutputs(out, outputDir, result, result.markdown_report);

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
  } finally {
    let drDoc = null;
    try {
      drDoc = finalizeDeterministicReviewObservability(ctx.outputDir, out);
    } catch (_) {
      /* Fase 4.11 — evidência apenas; falhas ignoradas */
    }
    try {
      if (drDoc) applyDeterministicReviewGateCliEffects(drDoc);
    } catch (_) {
      /* gate best-effort */
    }
    try {
      if (drDoc) {
        const baselineSummary = finalizeBaselineRegressionForRun(ctx.outputDir, drDoc, out);
        applyBaselineRegressionGateCliEffects(baselineSummary);
      }
    } catch (_) {
      /* baseline regression gate best-effort */
    }
    telemetry.stepEnd("review");
  }
}

async function main() {
  const outputArg = process.argv[2];

  if (!outputArg) {
    console.error("Usage: node scripts/review.js <output-dir>");
    process.exit(1);
  }

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputArg);
  } catch (err) {
    console.error(
      `Usage: node scripts/review.js <runId> — ${err.message || err}`
    );
    process.exit(1);
  }

  const ctx = createStageContextFromOutputDir(outputDir, { runId: outputArg });
  await runReview(ctx);
}

module.exports = { runReview };

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Erro no review:", err.message || err);
    process.exit(1);
  });
}