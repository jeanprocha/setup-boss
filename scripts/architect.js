const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const runScan = require("./scan");
const { loadAgent } = require("../core/agent-metadata");
const { validateArchitectOutput, extractArchitectDecisionJson } = require("./validate-architect");
const { classifyPrimaryReference } = require("./runtime/context-router");
const { ensureIA, collectIAContext } = require("./ensure-ia");
const { getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { getRunId, writeRunIndex } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");
const { validateTask, extractSection } = require("./shared-utils");
const { createRuntimeContext } = require("./runtime/runtime-context");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

function envMaxChars(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const ARCHITECT_PROJECT_SCAN_MAX_CHARS = envMaxChars(
  "ARCHITECT_PROJECT_SCAN_MAX_CHARS",
  8000,
);

function compactBlock(name, content, maxChars) {
  const text = content == null ? "" : String(content);
  if (!Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) {
    return text;
  }
  const originalChars = text.length;
  const warn = `\n\n[truncated ${name}: original_chars=${originalChars} max_chars=${maxChars}]\n\n`;
  const budget = maxChars - warn.length;
  if (budget <= 1) {
    return warn.slice(0, maxChars);
  }
  const headLen = Math.floor(budget / 2);
  const tailLen = budget - headLen;
  const head = text.slice(0, headLen);
  const tail = text.slice(-tailLen);
  return `${head}${warn}${tail}`;
}

function ensureExistsOrThrow(file, label) {
  if (!fs.existsSync(file)) {
    const msg = `${label} não encontrado: ${file}`;
    console.log(`❌ ${msg}`);
    throw new Error(msg);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function getArgValue(prefix) {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function compactText(value, maxLength = 600) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function markdownListFromSection(section, maxItems = 20) {
  return String(section || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.replace(/`/g, "").trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTaskAcceptanceLevel(token) {
  if (!token) return null;

  const x = String(token).toLowerCase().trim();

  if (x === "development" || x === "dev") {
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

  if (x === "production" || x === "prod") {
    return "production";
  }

  return null;
}

function extractExpectedAcceptanceLevel(taskContent) {
  const section = extractSection(taskContent, "Acceptance Level");
  const selectedLine = section
    .split("\n")
    .find((line) => /\[(x|X)\]/.test(line));

  if (!selectedLine) return null;

  const cleanLine = selectedLine
    .replace(/\[(x|X)\]/g, "")
    .replace(/^[-*]\s*/, "")
    .trim();

  const token = cleanLine.split(/\s+/)[0];

  return normalizeTaskAcceptanceLevel(token);
}

function extractTaskTitle(taskContent, fallback) {
  const titleLine = String(taskContent || "")
    .split("\n")
    .find((line) => line.trim().startsWith("# "));

  if (!titleLine) return fallback;

  return titleLine.replace(/^#\s*/, "").trim() || fallback;
}

function extractTaskSummary(taskContent, fallback) {
  const preferredSections = [
    "Objetivo",
    "Descrição",
    "Descricao",
    "Task",
    "Contexto",
  ];

  for (const sectionName of preferredSections) {
    const section = extractSection(taskContent, sectionName);

    if (section.trim()) {
      return compactText(section, 700);
    }
  }

  const withoutTitle = String(taskContent || "")
    .replace(/^#\s+[^\n]+\n?/, "")
    .trim();

  return compactText(withoutTitle || fallback, 700);
}

function extractAllowedFilesFromArchitect(architectOutput) {
  return markdownListFromSection(
    extractSection(architectOutput, "Arquivos prováveis"),
    50
  );
}

function extractPlanSummary(architectOutput) {
  const plan = extractSection(architectOutput, "Plano");

  if (!plan.trim()) {
    return compactText(architectOutput, 900);
  }

  return compactText(plan, 900);
}

function extractRisks(architectOutput) {
  return markdownListFromSection(extractSection(architectOutput, "Riscos"), 12)
    .map((item) => compactText(item, 220));
}

function extractStopCriteria(architectOutput) {
  const section = extractSection(architectOutput, "Critério de parada");

  if (!section.trim()) return [];

  const list = markdownListFromSection(section, 12);

  if (list.length > 0) {
    return list.map((item) => compactText(item, 220));
  }

  return [compactText(section, 300)];
}

function extractAcceptanceCriteria(taskContent) {
  const section = extractSection(taskContent, "Acceptance Criteria");

  if (!section.trim()) return [];

  const list = markdownListFromSection(section, 20);

  if (list.length > 0) {
    return list.map((item) => compactText(item, 260));
  }

  return [compactText(section, 500)];
}

function buildRunContext({
  outputDirName,
  projectName,
  projectRoot,
  taskArg,
  taskContent,
  architectOutput,
  skipScan,
  violations,
  architectDecision,
  architectDecisionJson,
}) {
  const taskTitle = extractTaskTitle(taskContent, path.basename(taskArg, ".md"));
  const acceptanceLevel = extractExpectedAcceptanceLevel(taskContent);
  const allowedFiles = extractAllowedFilesFromArchitect(architectOutput);
  const classification = classifyPrimaryReference(
    allowedFiles,
    architectDecisionJson || null,
  );
  const risks = extractRisks(architectOutput);
  const stopCriteria = extractStopCriteria(architectOutput);
  const acceptanceCriteria = extractAcceptanceCriteria(taskContent);

  return {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    run_id: outputDirName,
    project: {
      name: projectName,
      root: projectRoot,
    },
    task: {
      path: taskArg,
      title: taskTitle,
      summary: extractTaskSummary(taskContent, taskTitle),
      acceptance_level: acceptanceLevel,
      acceptance_criteria: acceptanceCriteria,
    },
    architect: {
      status: violations.length === 0 ? "approved" : "blocked",
      violations,
      task_valid:
        architectDecision &&
        typeof architectDecision.task_valid === "boolean"
          ? architectDecision.task_valid
          : null,
      allowed_files: allowedFiles,
      plan_summary: extractPlanSummary(architectOutput),
      risks,
      stop_criteria: stopCriteria,
    },
    execution_context: {
      scan_skipped: Boolean(skipScan),
      allowed_files: allowedFiles,
      primary_files: classification.primary_files,
      reference_files: classification.reference_files,
      file_classification_source: classification.source,
      review_focus: [
        ...acceptanceCriteria.slice(0, 8),
        ...risks.slice(0, 4),
      ].filter(Boolean),
    },
  };
}

function loadPreservedLlmUsage(outputDir, io) {
  const metaPath = path.join(outputDir, "metadata.json");
  const emptyTotal = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null,
  };

  const exists = io ? io.existsSync(metaPath) : fs.existsSync(metaPath);

  if (!exists) {
    return { llm_usage: {}, llm_usage_total: { ...emptyTotal } };
  }

  try {
    const raw = io
      ? io.readFileSync(metaPath, "utf-8")
      : fs.readFileSync(metaPath, "utf-8");
    const prev = JSON.parse(raw);
    const llm_usage =
      prev.llm_usage && typeof prev.llm_usage === "object"
        ? prev.llm_usage
        : {};
    const llm_usage_total =
      prev.llm_usage_total && typeof prev.llm_usage_total === "object"
        ? prev.llm_usage_total
        : { ...emptyTotal };

    return { llm_usage, llm_usage_total };
  } catch (_) {
    return { llm_usage: {}, llm_usage_total: { ...emptyTotal } };
  }
}

async function runArchitect(ctx, opts = {}) {
  const io = ctx.cache;
  const skipScan = opts.skipScan === true;
  const exitOnFailure = opts.exitOnFailure === true;

  const taskArg = ctx.taskArg;
  const projectArg = ctx.projectArg;
  const outputDirName = ctx.runId;
  const outputDir = ctx.outputDir;
  const rootDir = ctx.rootDir;

  console.log("[ARCHITECT] start");
  console.log("[ARCHITECT] taskArg:", taskArg);
  console.log("[ARCHITECT] projectArg:", projectArg);
  console.log("[ARCHITECT] skipScan:", skipScan);
  ctx.telemetry.stepStart("architect");

  const taskPath = path.resolve(rootDir, taskArg);
  const projectRoot = path.resolve(rootDir, projectArg);
  const projectSetupDir = path.join(projectRoot, ".setup-boss");
  const projectName = path.basename(projectRoot);

  if (!taskArg || !projectArg) {
    const msg = "Uso: npm run architect tasks/exemplo.md ../landing-sofas";
    console.log(msg);
    if (exitOnFailure) process.exit(1);
    throw new Error(msg);
  }

  if (!process.env.OPENAI_API_KEY) {
    const msg = "OPENAI_API_KEY não encontrada no .env";
    console.log(`❌ ${msg}`);
    if (exitOnFailure) process.exit(1);
    throw new Error(msg);
  }

  if (!fs.existsSync(taskPath)) {
    console.log(`❌ Task não encontrado: ${taskPath}`);
    if (exitOnFailure) process.exit(1);
    throw new Error(`Task não encontrado: ${taskPath}`);
  }

  if (!fs.existsSync(projectRoot)) {
    console.log(`❌ Projeto alvo não encontrado: ${projectRoot}`);
    if (exitOnFailure) process.exit(1);
    throw new Error(`Projeto alvo não encontrado: ${projectRoot}`);
  }

  const task = io.readFileSync(taskPath, "utf-8");
  validateTask(task);

  const projectIADir = path.join(projectRoot, ".IA");
  const outputsDirBase = path.join(projectIADir, "outputs");

  ensureDir(projectIADir);
  ensureDir(outputsDirBase);
  ensureDir(outputDir);

  writeRunIndex({ runId: outputDirName, projectRoot, outputDir });

  console.log("[ARCHITECT] outputDir:", outputDir);

  if (!skipScan) {
    console.log("🔍 Rodando Project Scan...");
    console.log("[ARCHITECT] before runScan");
    await runScan(projectArg, { outputDir });
    console.log("[ARCHITECT] after runScan");
  } else {
    console.log("⏭️ Scan pulado por cache recente — baseline .IA + ia-diagnostics");
    await ensureIA(projectRoot, {
      mode: "diagnostic",
      outputDir,
    });
  }

  const agentPath = path.join(rootDir, "agents", "architect.md");
  const projectScanPath = path.join(projectSetupDir, "project-scan.md");

  ensureExistsOrThrow(agentPath, "agents/architect.md");
  ensureExistsOrThrow(projectScanPath, "project-scan.md");

  const { content: architectPrompt, metadata: agentMeta } = loadAgent(agentPath);
  const projectScan = io.readFileSync(projectScanPath, "utf-8");
  const limitedProjectScan = compactBlock(
    "project_scan",
    projectScan,
    ARCHITECT_PROJECT_SCAN_MAX_CHARS,
  );
  const projectIAContext = collectIAContext(projectRoot);
  const projectIAContextBlock =
    projectIAContext || "(pasta .IA ainda não existente ou vazia)";

  const fullPrompt = `${architectPrompt}

## ENFORCEMENT REQUIREMENTS

Sua resposta DEVE conter obrigatoriamente estas seções:

## Entendimento
## Riscos
## Arquivos prováveis
## Plano
## Critério de parada

Regras invioláveis:

- Não proponha alteração arquitetural sem aprovação explícita.
- Não proponha troca de stack.
- Não proponha instalação de dependência sem justificativa explícita.
- Não proponha refatoração fora do escopo.
- Em "## Arquivos prováveis", liste caminhos relativos ao projeto, um por linha.
- Se houver divergência entre task, scan, .IA e código, pare e reporte em "## Critério de parada".
- Use PROJECT IA CONTEXT como base semântica persistente do projeto.
- Use PROJECT SCAN como evidência técnica atual.
- Se PROJECT IA CONTEXT e PROJECT SCAN divergirem, priorize evidência atual do código e aponte a divergência.

## PROJECT SCAN

${limitedProjectScan}

## PROJECT IA CONTEXT

${projectIAContextBlock}

## TASK

${task}
`;

  const measuredBlocksTotal =
    architectPrompt.length +
    limitedProjectScan.length +
    projectIAContextBlock.length +
    task.length;

  const enforcementAndHeadersChars = Math.max(
    0,
    fullPrompt.length - measuredBlocksTotal,
  );

  writePromptSizeRecord(outputDir, "architect", {
    total_prompt_chars: fullPrompt.length,
    user_chars: fullPrompt.length,
    blocks: {
      agent: architectPrompt.length,
      project_scan: limitedProjectScan.length,
      project_ia_context: projectIAContextBlock.length,
      task: task.length,
      enforcement_and_headers: enforcementAndHeadersChars,
    },
  });

  io.writeFileSync(
    path.join(outputDir, "architect-input.md"),
    fullPrompt,
    "utf-8"
  );

  console.log("[ARCHITECT] prompt length:", fullPrompt.length);
  console.log("[ARCHITECT] before OpenAI responses.create");

  const architectModel = getModelForStep("architect");

  ctx.telemetry.llmCall({ step: "architect", model: architectModel });

  const response = await client.responses.create({
    model: architectModel,
    input: fullPrompt,
  });

  ctx.telemetry.llmResponse({ step: "architect", model: architectModel });

  console.log("[ARCHITECT] after OpenAI responses.create");

  const architectOutput = response.output_text || "";
  console.log("[ARCHITECT] before validateArchitectOutput");
  const validationResult = validateArchitectOutput(architectOutput);
  const violations = validationResult.violations;
  console.log("[ARCHITECT] violations:", violations);

  const preservedLlm = loadPreservedLlmUsage(outputDir, io);

  const metadata = {
    runId: outputDirName,
    projectName,
    projectRoot,
    projectSetupDir,
    projectIADir,
    outputsDir: outputsDirBase,
    outputDir,
    taskPath,
    taskArg,
    projectArg,
    createdAt: new Date().toISOString(),
    scan: {
      skipped: skipScan,
      output_file: path.join(outputDir, "scan-output.md"),
      project_scan_file: projectScanPath,
    },
    source_of_truth: {
      hierarchy: {
        "setup-boss/context": "verdade global do sistema",
        "setup-boss/docs": "documentação operacional",
        "project/.setup-boss": "verdade técnica local do pipeline",
        "project/.IA": "verdade semântica local do projeto",
        "project/.IA/outputs/<run-id>": "histórico da execução",
      },
    },
    enforcement: {
      architect: {
        status: violations.length === 0 ? "approved" : "blocked",
        violations,
        invalid_task: Boolean(validationResult.invalid_task),
      },
    },
    agents: {
      architect: agentMeta,
    },
    llm_usage: preservedLlm.llm_usage,
    llm_usage_total: preservedLlm.llm_usage_total,
  };

  const fullDecisionExtract = extractArchitectDecisionJson(architectOutput);

  const runContext = buildRunContext({
    outputDirName,
    projectName,
    projectRoot,
    taskArg,
    taskContent: task,
    architectOutput,
    skipScan,
    violations,
    architectDecision: validationResult.architect_decision || null,
    architectDecisionJson: fullDecisionExtract.ok ? fullDecisionExtract.decision : null,
  });

  io.writeJsonSync(path.join(outputDir, "metadata.json"), metadata);

  recordLLMUsage({
    outputDir,
    step: "architect",
    model: architectModel,
    usage: response.usage,
  });

  io.invalidate(path.join(outputDir, "metadata.json"));

  io.writeFileSync(path.join(outputDir, "task.md"), task, "utf-8");

  io.writeFileSync(
    path.join(outputDir, "architect-output.md"),
    architectOutput,
    "utf-8"
  );

  io.writeJsonSync(path.join(outputDir, "run-context.json"), runContext);

  io.writeJsonSync(path.join(outputDir, "architect-validation.json"), {
    status: violations.length === 0 ? "approved" : "blocked",
    violations,
    checked_at: new Date().toISOString(),
    invalid_task: Boolean(validationResult.invalid_task),
    task_valid:
      validationResult.architect_decision &&
      typeof validationResult.architect_decision.task_valid === "boolean"
        ? validationResult.architect_decision.task_valid
        : null,
    architect_decision: validationResult.architect_decision || null,
  });

  if (violations.length > 0) {
    if (validationResult.invalid_task) {
      console.log("\n" + violations[0]);
      console.log(
        "\nEscopo inconsistente, definições em falta ou impossível validar/executar com segurança. Corrija a task antes de prosseguir."
      );

      appendProblemHistoryEntry({
        outputDir,
        step: "architect",
        status: "blocked",
        severity: "medium",
        type: "invalid_task",
        title: "Task inválida para execução automática (task_valid=false)",
        summary: String(violations[0] || "").slice(0, 1200),
        cause: "task_valid_false",
        evidence: [
          String(violations[0] || "").slice(0, 2000),
          ...(validationResult.architect_decision &&
          Array.isArray(validationResult.architect_decision.risks)
            ? validationResult.architect_decision.risks.map((x) =>
                String(x).slice(0, 400)
              )
            : []),
        ].slice(0, 25),
        files: [],
        model: architectModel,
        usage: response.usage,
        extra: {
          invalid_task: true,
          architect_decision: validationResult.architect_decision || null,
        },
      });
    } else {
      console.log("❌ Architect bloqueado por enforcement:");
      for (const violation of violations) {
        console.log(`- ${violation}`);
      }

      appendProblemHistoryEntry({
        outputDir,
        step: "architect",
        status: "blocked",
        severity: "high",
        type: "architect_blocked",
        title: "Architect bloqueado por enforcement",
        summary: `Violações de enforcement: ${violations.length}`,
        cause: "enforcement_violations",
        evidence: violations.map((v) => String(v).slice(0, 600)),
        files: [],
        model: architectModel,
        usage: response.usage,
        extra: {
          violation_count: violations.length,
        },
      });
    }

    const runContextPath = path.join(outputDir, "run-context.json");

    const failureResult = {
      success: false,
      retryable: false,
      errorType: validationResult.invalid_task
        ? "ARCHITECT_INVALID_TASK"
        : "ARCHITECT_BLOCKED",
      message: String(violations[0] || "Architect bloqueado"),
      outputDir,
      runContextPath,
      validation: {
        status: "blocked",
        violations,
        invalid_task: Boolean(validationResult.invalid_task),
      },
      metadata,
      runContext,
    };

    ctx.telemetry.stepEnd("architect");

    if (exitOnFailure) {
      process.exit(1);
    }

    return failureResult;
  }

  console.log("✅ Architect concluído:", outputDirName);
  console.log(`npm run executor ${outputDirName}`);

  ctx.metadata = metadata;
  ctx.runContext = runContext;

  ctx.telemetry.stepEnd("architect");

  return {
    success: true,
    outputName: outputDirName,
    outputDir,
    runContextPath: path.join(outputDir, "run-context.json"),
    validation: {
      status: "approved",
      violations: [],
    },
    metadata,
    runContext,
  };
}

async function main() {
  const taskArg = process.argv[2];
  const projectArg = process.argv[3];

  const skipScan = process.argv.includes("--skip-scan");
  const providedRunId = getArgValue("--run-id=");

  console.log("[ARCHITECT] providedRunId:", providedRunId);

  if (!taskArg || !projectArg) {
    console.log("Uso: npm run architect tasks/exemplo.md ../landing-sofas");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ OPENAI_API_KEY não encontrada no .env");
    process.exit(1);
  }

  const taskPath = path.resolve(ROOT_DIR, taskArg);
  const projectRoot = path.resolve(ROOT_DIR, projectArg);

  if (!fs.existsSync(taskPath)) {
    console.log(`❌ Task não encontrado: ${taskPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(projectRoot)) {
    console.log(`❌ Projeto alvo não encontrado: ${projectRoot}`);
    process.exit(1);
  }

  validateTask(fs.readFileSync(taskPath, "utf-8"));

  const outputDirName = providedRunId || getRunId(taskArg);
  const projectIADir = path.join(projectRoot, ".IA");
  const outputsDirBase = path.join(projectIADir, "outputs");
  const outputDir = path.join(outputsDirBase, outputDirName);

  ensureDir(projectIADir);
  ensureDir(outputsDirBase);
  ensureDir(outputDir);

  const ctx = createRuntimeContext({
    rootDir: ROOT_DIR,
    runId: outputDirName,
    taskArg,
    projectArg,
    projectRoot,
    projectPath: projectArg,
    taskPath,
    outputDir,
  });

  await runArchitect(ctx, { skipScan, exitOnFailure: true });
}

module.exports = { runArchitect };

if (require.main === module) {
main().catch((error) => {
  console.error("❌ Erro:", error.message || error);

  try {
    const projectArg = process.argv[3];

    if (projectArg) {
      const projectRoot = path.resolve(ROOT_DIR, projectArg);
      const taskArg = process.argv[2];
      const taskTitle =
        taskArg && fs.existsSync(path.resolve(ROOT_DIR, taskArg))
          ? (() => {
              try {
                const first = fs
                  .readFileSync(path.resolve(ROOT_DIR, taskArg), "utf-8")
                  .split("\n")
                  .find((l) => l.trim().startsWith("# "));

                return first ? first.replace(/^#\s*/, "").trim() : null;
              } catch (_) {
                return null;
              }
            })()
          : null;

      appendProblemHistoryEntry({
        projectRoot,
        metadata: {
          taskArg,
          projectName: path.basename(projectRoot),
        },
        task: {
          path: taskArg || null,
          title: taskTitle,
          summary: null,
        },
        step: "architect",
        status: "error",
        severity: "high",
        type:
          error.message && String(error.message).includes("TASK_INVALID")
            ? "architect_blocked"
            : "unknown_error",
        title:
          error.message && String(error.message).includes("TASK_INVALID")
            ? "Task inválida no architect"
            : "Erro no architect",
        summary: String(error.message || error).slice(0, 1500),
        cause:
          error.message && String(error.message).includes("TASK_INVALID")
            ? "task_validation"
            : "exception",
        evidence: [String(error.stack || error.message).slice(0, 2000)],
        files: [],
        runId: null,
        extra: {},
      });
    }
  } catch (_) {
    /* não interrompe o exit */
  }

  process.exit(1);
});
}