const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const runScan = require("./scan");
const { loadAgent } = require("../core/agent-metadata");
const { validateArchitectOutput } = require("./validate-architect");
const { ensureIA, collectIAContext } = require("./ensure-ia");
const { getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const { getRunId, writeRunIndex } = require("../core/run-resolver");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
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

function extractSection(content, sectionTitle) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `## ${escaped}\\s*([\\s\\S]*?)(?=\\n## |$)`,
    "i"
  );

  const match = content.match(regex);
  return match ? match[1] : "";
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
}) {
  const taskTitle = extractTaskTitle(taskContent, path.basename(taskArg, ".md"));
  const acceptanceLevel = extractExpectedAcceptanceLevel(taskContent);
  const allowedFiles = extractAllowedFilesFromArchitect(architectOutput);
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
      allowed_files: allowedFiles,
      plan_summary: extractPlanSummary(architectOutput),
      risks,
      stop_criteria: stopCriteria,
    },
    execution_context: {
      scan_skipped: Boolean(skipScan),
      allowed_files: allowedFiles,
      review_focus: [
        ...acceptanceCriteria.slice(0, 8),
        ...risks.slice(0, 4),
      ].filter(Boolean),
    },
  };
}

function validateTask(taskContent) {
  if (!taskContent.includes("## Acceptance Level")) {
    throw new Error("TASK_INVALID: Acceptance Level ausente");
  }

  if (!taskContent.includes("## Acceptance Criteria")) {
    throw new Error("TASK_INVALID: Acceptance Criteria ausente");
  }

  const acceptanceLevelBody = extractSection(taskContent, "Acceptance Level");

  if (!acceptanceLevelBody.trim()) {
    throw new Error("TASK_INVALID: seção Acceptance Level vazia ou inválida");
  }

  const matches = acceptanceLevelBody.match(/\[x\]/gi) || [];

  if (matches.length !== 1) {
    throw new Error("TASK_INVALID: exatamente um Acceptance Level deve ser selecionado");
  }
}

function loadPreservedLlmUsage(outputDir) {
  const metaPath = path.join(outputDir, "metadata.json");
  const emptyTotal = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: null,
  };

  if (!fs.existsSync(metaPath)) {
    return { llm_usage: {}, llm_usage_total: { ...emptyTotal } };
  }

  try {
    const prev = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
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

async function main() {
  const taskArg = process.argv[2];
  const projectArg = process.argv[3];

  const skipScan = process.argv.includes("--skip-scan");
  const providedRunId = getArgValue("--run-id=");

  console.log("[ARCHITECT] start");
  console.log("[ARCHITECT] taskArg:", taskArg);
  console.log("[ARCHITECT] projectArg:", projectArg);
  console.log("[ARCHITECT] skipScan:", skipScan);
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
  const projectSetupDir = path.join(projectRoot, ".setup-boss");
  const projectName = path.basename(projectRoot);

  ensureFile(taskPath, "Task");
  ensureFile(projectRoot, "Projeto alvo");

  const task = fs.readFileSync(taskPath, "utf-8");
  validateTask(task);

  const outputDirName = providedRunId || getRunId(taskArg);
  const projectIADir = path.join(projectRoot, ".IA");
  const outputsDirBase = path.join(projectIADir, "outputs");
  const outputDir = path.join(outputsDirBase, outputDirName);

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

  const agentPath = path.join(ROOT_DIR, "agents", "architect.md");
  const projectScanPath = path.join(projectSetupDir, "project-scan.md");

  ensureFile(agentPath, "agents/architect.md");
  ensureFile(projectScanPath, "project-scan.md");

  const { content: architectPrompt, metadata: agentMeta } = loadAgent(agentPath);
  const projectScan = fs.readFileSync(projectScanPath, "utf-8");
  const projectIAContext = collectIAContext(projectRoot);

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

${projectScan}

## PROJECT IA CONTEXT

${projectIAContext || "(pasta .IA ainda não existente ou vazia)"}

## TASK

${task}
`;

  fs.writeFileSync(
    path.join(outputDir, "architect-input.md"),
    fullPrompt,
    "utf-8"
  );

  console.log("[ARCHITECT] prompt length:", fullPrompt.length);
  console.log("[ARCHITECT] before OpenAI responses.create");

  const architectModel = getModelForStep("architect");

  const response = await client.responses.create({
    model: architectModel,
    input: fullPrompt,
  });

  console.log("[ARCHITECT] after OpenAI responses.create");

  const architectOutput = response.output_text || "";
  console.log("[ARCHITECT] before validateArchitectOutput");
  const violations = validateArchitectOutput(architectOutput);
  console.log("[ARCHITECT] violations:", violations);

  const preservedLlm = loadPreservedLlmUsage(outputDir);

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
      },
    },
    agents: {
      architect: agentMeta,
    },
    llm_usage: preservedLlm.llm_usage,
    llm_usage_total: preservedLlm.llm_usage_total,
  };

  const runContext = buildRunContext({
    outputDirName,
    projectName,
    projectRoot,
    taskArg,
    taskContent: task,
    architectOutput,
    skipScan,
    violations,
  });

  writeJson(path.join(outputDir, "metadata.json"), metadata);

  recordLLMUsage({
    outputDir,
    step: "architect",
    model: architectModel,
    usage: response.usage,
  });

  fs.writeFileSync(path.join(outputDir, "task.md"), task, "utf-8");

  fs.writeFileSync(
    path.join(outputDir, "architect-output.md"),
    architectOutput,
    "utf-8"
  );

  writeJson(path.join(outputDir, "run-context.json"), runContext);

  writeJson(path.join(outputDir, "architect-validation.json"), {
    status: violations.length === 0 ? "approved" : "blocked",
    violations,
    checked_at: new Date().toISOString(),
  });

  if (violations.length > 0) {
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

    process.exit(1);
  }

  console.log("✅ Architect concluído:", outputDirName);
  console.log(`npm run executor ${outputDirName}`);
}

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