const fs = require("fs");
const path = require("path");
const { loadAgent } = require("../core/agent-metadata");
const { extractAllowedFiles } = require("./validate-cursor");
const { resolveOutputDir } = require("../core/run-resolver");

const ROOT_DIR = path.resolve(__dirname, "..");
const outputArg = process.argv[2];

if (!outputArg) {
  console.log("Uso: npm run cursor NOME-DA-PASTA");
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

function safeRead(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) {
    console.log(`❌ ${label} não encontrado: ${file}`);
    process.exit(1);
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function replaceAllTemplate(content, replacements) {
  let output = content;

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, value || "");
  }

  return output;
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
const architectOutputPath = path.join(outputDir, "architect-output.md");
const taskPath = path.join(outputDir, "task.md");
const cursorTemplatePath = path.join(ROOT_DIR, "agents", "cursor-template.md");

ensureFile(metadataPath, "metadata.json");
ensureFile(architectOutputPath, "architect-output.md");
ensureFile(taskPath, "task.md");
ensureFile(cursorTemplatePath, "agents/cursor-template.md");

const metadata = JSON.parse(read(metadataPath));

const { content: cursorTemplate, metadata: agentMeta } =
  loadAgent(cursorTemplatePath);

metadata.agents = {
  ...metadata.agents,
  cursor: agentMeta
};

const projectRoot = metadata.projectRoot;
const projectSetupDir = metadata.projectSetupDir;
const projectName = metadata.projectName;

if (!projectRoot || !projectSetupDir) {
  console.log("❌ metadata inválido: projectRoot/projectSetupDir ausente.");
  process.exit(1);
}

const task = read(taskPath);
const plan = read(architectOutputPath);

const allowedFiles = extractAllowedFiles(plan);

metadata.enforcement = {
  ...(metadata.enforcement || {}),
  cursor: {
    allowed_files: allowedFiles,
    rule: "Cursor deve alterar apenas arquivos declarados em ## Arquivos prováveis."
  }
};

writeJson(metadataPath, metadata);

const projectContext = safeRead(path.join(projectSetupDir, "project-context.md"));
const projectScan = safeRead(path.join(projectSetupDir, "project-scan.md"));
const projectDecisions = safeRead(path.join(projectSetupDir, "decisions.md"));
const projectKnowledge = safeRead(path.join(projectSetupDir, "knowledge-base.md"));

const targetFiles = allowedFiles.length > 0
  ? allowedFiles.map((file) => `- ${file}`).join("\n")
  : "- Nenhum arquivo permitido identificado. Pare e reporte divergência.";

const cursorPrompt = replaceAllTemplate(cursorTemplate, {
  PROJECT_NAME: projectName,
  PROJECT_PATH: projectRoot,
  PROJECT_SETUP_DIR: projectSetupDir,
  TASK_PATH: taskPath,
  TASK: task,
  ARCHITECT_OUTPUT: plan,
  PLAN: plan,
  TARGET_FILES: targetFiles,
  PROJECT_CONTEXT: projectContext,
  PROJECT_SCAN: projectScan,
  PROJECT_DECISIONS: projectDecisions,
  PROJECT_KNOWLEDGE: projectKnowledge
});

fs.writeFileSync(
  path.join(outputDir, "cursor-prompt.md"),
  cursorPrompt,
  "utf-8"
);

fs.writeFileSync(
  path.join(outputDir, "cursor-allowed-files.json"),
  JSON.stringify(
    {
      allowed_files: allowedFiles,
      generated_at: new Date().toISOString()
    },
    null,
    2
  ),
  "utf-8"
);

console.log("✅ Cursor pronto");
console.log("📄 Prompt gerado em:");
console.log(path.join(outputDir, "cursor-prompt.md"));