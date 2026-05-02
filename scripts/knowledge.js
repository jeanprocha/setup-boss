const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  outputsDir: path.join(ROOT_DIR, "outputs"),
  projectSetupDirName: ".setup-boss"
};

const outputArg = process.argv[2];

if (!outputArg) {
  console.log("Uso: npm run knowledge NOME-DA-PASTA");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.log("❌ OPENAI_API_KEY não encontrada no .env");
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function assertNotWritingGlobal(filePath) {
  const resolved = path.resolve(filePath);
  const globalContextDir = path.resolve(SOURCE_OF_TRUTH.globalContextDir);

  if (
    resolved === globalContextDir ||
    resolved.startsWith(globalContextDir + path.sep)
  ) {
    console.log("❌ Tentativa de escrever no contexto global bloqueada.");
    console.log(`Arquivo bloqueado: ${resolved}`);
    console.log("setup-boss/context é verdade global e não pode ser alterado por execução de projeto.");
    process.exit(1);
  }
}

function assertInsideProjectSetup(filePath, projectSetupDir) {
  const resolved = path.resolve(filePath);
  const allowedDir = path.resolve(projectSetupDir);

  if (
    resolved !== allowedDir &&
    !resolved.startsWith(allowedDir + path.sep)
  ) {
    console.log("❌ Tentativa de escrever fora da verdade local do projeto bloqueada.");
    console.log(`Arquivo: ${resolved}`);
    console.log(`Permitido apenas em: ${allowedDir}`);
    process.exit(1);
  }
}

function collectMarkdownFiles(dir, title) {
  if (!fs.existsSync(dir)) return "";

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"));

  let content = "";

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const raw = safeRead(fullPath);

    if (!raw.trim()) continue;

    content += `\n\n## ${title}: ${entry.name}\n\n${raw}`;
  }

  return content;
}

function resolveProjectSetupDir(metadata) {
  const projectRoot = metadata.projectRoot;

  if (!projectRoot) {
    console.log("❌ metadata.projectRoot não encontrado.");
    process.exit(1);
  }

  const expectedProjectSetupDir = path.join(
    projectRoot,
    SOURCE_OF_TRUTH.projectSetupDirName
  );

  if (
    metadata.projectSetupDir &&
    path.resolve(metadata.projectSetupDir) !== path.resolve(expectedProjectSetupDir)
  ) {
    console.log("❌ Divergência de Source of Truth local detectada.");
    console.log(`metadata.projectSetupDir: ${metadata.projectSetupDir}`);
    console.log(`esperado: ${expectedProjectSetupDir}`);
    console.log(
      "Pare e reporte: project/.setup-boss deve ser a única verdade local do projeto."
    );
    process.exit(1);
  }

  return expectedProjectSetupDir;
}

function updateMetadataWithKnowledgeAgent(metadataPath, agentMeta) {
  const metadata = readJson(metadataPath);

  metadata.agents = {
    ...metadata.agents,
    knowledge: agentMeta
  };

  metadata.source_of_truth = {
    ...(metadata.source_of_truth || {}),
    hierarchy: {
      "setup-boss/context": "verdade global do sistema",
      "setup-boss/docs": "documentação operacional",
      "project/.setup-boss": "verdade local do projeto",
      "outputs/<run-id>": "histórico da execução"
    },
    knowledge_rules: [
      "knowledge global é somente leitura durante execuções de projeto",
      "knowledge local do projeto é atualizado apenas em project/.setup-boss/knowledge-base.md",
      "knowledge global e knowledge local não devem ser misturados",
      "execuções de projeto não podem escrever em setup-boss/context"
    ]
  };

  writeJson(metadataPath, metadata);

  return metadata;
}

async function main() {
  const outputDir = path.isAbsolute(outputArg)
    ? outputArg
    : path.join(SOURCE_OF_TRUTH.outputsDir, outputArg);

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const taskPath = path.join(outputDir, "task.md");
  const architectPath = path.join(outputDir, "architect-output.md");
  const cursorPath = path.join(outputDir, "cursor-output.md");
  const reviewMarkdownPath = path.join(outputDir, "review-output.md");
  const reviewJsonPath = path.join(outputDir, "review-output.json");

  const knowledgeAgentPath = path.join(ROOT_DIR, "agents", "knowledge.md");

  ensureFile(metadataPath, "metadata.json");
  ensureFile(taskPath, "task.md");
  ensureFile(architectPath, "architect-output.md");
  ensureFile(cursorPath, "cursor-output.md");
  ensureFile(knowledgeAgentPath, "agents/knowledge.md");

  if (!fs.existsSync(reviewMarkdownPath) && !fs.existsSync(reviewJsonPath)) {
    console.log("❌ Nenhum output de review encontrado.");
    console.log(`Esperado: ${reviewMarkdownPath}`);
    console.log(`Ou: ${reviewJsonPath}`);
    process.exit(1);
  }

  const { content: knowledgeAgent, metadata: agentMeta } =
    loadAgent(knowledgeAgentPath);

  const metadata = updateMetadataWithKnowledgeAgent(metadataPath, agentMeta);

  const projectSetupDir = resolveProjectSetupDir(metadata);
  const projectRoot = metadata.projectRoot;
  const projectName = metadata.projectName || path.basename(projectRoot);

  ensureDir(projectSetupDir);

  const projectKnowledgeBasePath = path.join(
    projectSetupDir,
    "knowledge-base.md"
  );

  assertNotWritingGlobal(projectKnowledgeBasePath);
  assertInsideProjectSetup(projectKnowledgeBasePath, projectSetupDir);

  const globalContext = collectMarkdownFiles(
    SOURCE_OF_TRUTH.globalContextDir,
    "GLOBAL SYSTEM CONTEXT"
  );

  const operationalDocs = collectMarkdownFiles(
    SOURCE_OF_TRUTH.operationalDocsDir,
    "OPERATIONAL DOC - NON AUTHORITATIVE"
  );

  const currentProjectKnowledge = safeRead(projectKnowledgeBasePath);

  const reviewOutput = fs.existsSync(reviewJsonPath)
    ? read(reviewJsonPath)
    : read(reviewMarkdownPath);

  const fullPrompt = `${knowledgeAgent}

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade local do projeto
outputs/<run-id> = histórico da execução

## NON-NEGOTIABLE KNOWLEDGE RULES

- Gere atualização apenas para o knowledge local do projeto.
- O destino permitido é somente project/.setup-boss/knowledge-base.md.
- Não gere conteúdo para alterar setup-boss/context.
- Não misture knowledge global com knowledge local.
- Use setup-boss/context apenas como referência global do sistema.
- Use setup-boss/docs apenas como documentação operacional, não como fonte de decisão.
- Registre apenas decisões e padrões reutilizáveis do projeto.
- Não registre passo a passo da execução.
- Não trate outputs/<run-id> como fonte de verdade permanente.

${globalContext}

## OPERATIONAL DOCUMENTATION - NON AUTHORITATIVE
${operationalDocs}

## PROJECT TARGET
Projeto: ${projectName}
Caminho: ${projectRoot}

## CURRENT PROJECT KNOWLEDGE
${currentProjectKnowledge}

## TASK
${read(taskPath)}

## PLANO / ARCHITECT OUTPUT
${read(architectPath)}

## EXECUÇÃO / CURSOR OUTPUT
${read(cursorPath)}

## REVIEW OUTPUT
${reviewOutput}
`;

  console.log("🧠 Gerando atualização da Project Knowledge Base...");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: fullPrompt,
  });

  const knowledgeUpdate = response.output_text || "";
  const knowledgeUpdatePath = path.join(outputDir, "knowledge-update.md");

  fs.writeFileSync(knowledgeUpdatePath, knowledgeUpdate, "utf-8");

  fs.appendFileSync(
    projectKnowledgeBasePath,
    `\n\n---\n\n${knowledgeUpdate}`,
    "utf-8"
  );

  console.log("✅ Knowledge update gerado:");
  console.log(path.relative(ROOT_DIR, knowledgeUpdatePath));

  console.log("\n✅ Project knowledge base atualizada:");
  console.log(projectKnowledgeBasePath);

  console.log("\n🔒 Knowledge global preservado:");
  console.log(SOURCE_OF_TRUTH.globalContextDir);
}

main().catch((err) => {
  console.error("❌ Erro ao gerar Knowledge Update:");
  console.error(err.message || err);
  process.exit(1);
});