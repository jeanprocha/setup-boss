const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  projectSetupDirName: ".setup-boss",
};

function safeRead(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    console.log(`❌ ${label} não encontrado: ${targetPath}`);
    process.exit(1);
  }
}

function getArgValue(prefix) {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function listFiles(projectRoot, dir, depth = 0, maxDepth = 3) {
  if (!fs.existsSync(dir) || depth > maxDepth) return [];

  const ignored = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    "coverage",
    ".venv",
    "vendor",
    "target",
    "__pycache__",
  ]);

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let result = [];

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(projectRoot, fullPath);

    if (entry.isDirectory()) {
      result.push(rel + "/");
      result = result.concat(
        listFiles(projectRoot, fullPath, depth + 1, maxDepth)
      );
    } else {
      result.push(rel);
    }
  }

  return result;
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

function collectGlobalContext() {
  return collectMarkdownFiles(
    SOURCE_OF_TRUTH.globalContextDir,
    "GLOBAL SYSTEM CONTEXT"
  );
}

function collectOperationalDocs() {
  return collectMarkdownFiles(
    SOURCE_OF_TRUTH.operationalDocsDir,
    "OPERATIONAL DOC"
  );
}

function collectProjectLocalTruth(projectSetupDir) {
  const files = ["knowledge-base.md", "project-context.md", "project-scan.md"];

  let content = "";

  for (const file of files) {
    const fullPath = path.join(projectSetupDir, file);
    const raw = safeRead(fullPath);

    if (!raw.trim()) continue;

    content += `\n\n## PROJECT LOCAL TRUTH: ${file}\n\n${raw}`;
  }

  return content;
}

function collectImportantFiles(projectRoot) {
  const files = [
    "package.json",
    "README.md",
    "index.html",
    "src/main.js",
    "src/main.jsx",
    "src/main.ts",
    "src/main.tsx",
    "src/App.js",
    "src/App.jsx",
    "src/App.tsx",
    "js/main.js",
    "css/styles.css",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".env.example",
  ];

  let content = "";

  for (const file of files) {
    const full = path.join(projectRoot, file);

    if (fs.existsSync(full)) {
      const raw = fs.readFileSync(full, "utf-8");
      content += `\n\n## FILE: ${file}\n\n${raw.slice(0, 8000)}`;
    }
  }

  return content;
}

async function runScan(projectArg, options = {}) {
  console.log("[SCAN] start");

  if (!projectArg) {
    console.log("Uso:");
    console.log("npm run scan ../meu-projeto");
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ OPENAI_API_KEY não encontrada no .env");
    process.exit(1);
  }

  console.log("[SCAN] projectArg:", projectArg);
  console.log("[SCAN] outputDir:", options.outputDir ?? null);

  const outputDirArg = options.outputDir || getArgValue("--output-dir=");
  const projectRoot = path.resolve(ROOT_DIR, projectArg);
  const projectSetupDir = path.join(
    projectRoot,
    SOURCE_OF_TRUTH.projectSetupDirName
  );

  ensureExists(projectRoot, "Projeto alvo");
  ensureDir(projectSetupDir);

  const agentPath = path.join(ROOT_DIR, "agents", "project-scan.md");
  const agent = safeRead(agentPath);

  if (!agent.trim()) {
    console.log(`❌ Agent de scan não encontrado ou vazio: ${agentPath}`);
    process.exit(1);
  }

  const fileTree = listFiles(projectRoot, projectRoot).slice(0, 500).join("\n");
  const importantFiles = collectImportantFiles(projectRoot);
  const globalContext = collectGlobalContext();
  const operationalDocs = collectOperationalDocs();
  const projectLocalTruth = collectProjectLocalTruth(projectSetupDir);

  const prompt = `${agent}

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade local do projeto
outputs/<run-id> = histórico da execução

## SOURCE OF TRUTH RULES

- Use setup-boss/context apenas como verdade global do sistema.
- Use setup-boss/docs apenas como documentação operacional.
- Use project/.setup-boss como verdade local do projeto.
- Não misture knowledge global com knowledge local do projeto.
- Não escreva informações locais do projeto em setup-boss/context.
- Não trate outputs antigos como fonte de verdade permanente.

${globalContext}

${operationalDocs}

${projectLocalTruth}

## PROJECT TARGET
${projectRoot}

## FILE TREE
${fileTree}

## IMPORTANT FILE CONTENT
${importantFiles}
`;

  const inputPath = path.join(projectSetupDir, "project-scan-input.md");
  fs.writeFileSync(inputPath, prompt, "utf-8");

  console.log("[SCAN] prompt length:", prompt.length);
  console.log("[SCAN] before OpenAI responses.create");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: prompt,
  });

  console.log("[SCAN] after OpenAI responses.create");

  const scanOutput = response.output_text || "";

  const projectScanPath = path.join(projectSetupDir, "project-scan.md");
  console.log("[SCAN] saving project-scan.md");
  console.log("[SCAN] saving scan-output.md if outputDir exists");
  fs.writeFileSync(projectScanPath, scanOutput, "utf-8");

  if (outputDirArg) {
    const outputDir = path.isAbsolute(outputDirArg)
      ? outputDirArg
      : path.join(ROOT_DIR, "outputs", outputDirArg);

    ensureDir(outputDir);

    fs.writeFileSync(
      path.join(outputDir, "scan-output.md"),
      scanOutput,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(outputDir, "scan-input.md"),
      prompt,
      "utf-8"
    );
  }

  console.log("✅ Project Scan atualizado");
  console.log(projectScanPath);

  return {
    projectRoot,
    projectSetupDir,
    projectScanPath,
    scanOutput,
  };
}

module.exports = runScan;

if (require.main === module) {
  const arg = process.argv[2];

  runScan(arg).catch((err) => {
    console.error("❌ Erro ao executar scan:");
    console.error(err.message || err);
    process.exit(1);
  });
}