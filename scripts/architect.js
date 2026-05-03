const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const runScan = require("./scan");
const { loadAgent } = require("../core/agent-metadata");
const { validateArchitectOutput } = require("./validate-architect");
const { ensureIA, collectIAContext } = require("./ensure-ia");

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

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
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

  ensureFile(taskPath, "Task");
  ensureFile(projectRoot, "Projeto alvo");

  const task = fs.readFileSync(taskPath, "utf-8");
  validateTask(task);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const projectName = path.basename(projectRoot);
  const taskName = slugify(path.basename(taskArg, ".md"));

  const outputDirName =
    providedRunId || `${timestamp}-${projectName}-${taskName}`;

  const outputDir = path.join(ROOT_DIR, "outputs", outputDirName);

  ensureDir(outputDir);

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

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: fullPrompt,
  });

  console.log("[ARCHITECT] after OpenAI responses.create");

  const architectOutput = response.output_text || "";
  console.log("[ARCHITECT] before validateArchitectOutput");
  const violations = validateArchitectOutput(architectOutput);
  console.log("[ARCHITECT] violations:", violations);

  const metadata = {
    runId: outputDirName,
    projectName,
    projectRoot,
    projectSetupDir,
    projectIADir: path.join(projectRoot, ".IA"),
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
        "outputs/<run-id>": "histórico da execução",
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
  };

  writeJson(path.join(outputDir, "metadata.json"), metadata);

  fs.writeFileSync(path.join(outputDir, "task.md"), task, "utf-8");

  fs.writeFileSync(
    path.join(outputDir, "architect-output.md"),
    architectOutput,
    "utf-8"
  );

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
    process.exit(1);
  }

  console.log("✅ Architect concluído:", outputDirName);
  console.log(`npm run executor ${outputDirName}`);
}

main().catch((error) => {
  console.error("❌ Erro:", error.message || error);
  process.exit(1);
});