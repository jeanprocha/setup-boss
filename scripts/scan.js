const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { ensureIA, collectIAContext } = require("./ensure-ia");
const { resolveOutputDir } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");
const { resolveProjectIaDir } = require("./shared/ia-path-resolver");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  projectSetupDirName: ".setup-boss",
};

function envMaxChars(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const SCAN_FILE_TREE_MAX_CHARS = envMaxChars(
  "SCAN_FILE_TREE_MAX_CHARS",
  12000,
);
const SCAN_OPERATIONAL_DOCS_MAX_CHARS = envMaxChars(
  "SCAN_OPERATIONAL_DOCS_MAX_CHARS",
  12000,
);
const SCAN_GLOBAL_CONTEXT_MAX_CHARS = envMaxChars(
  "SCAN_GLOBAL_CONTEXT_MAX_CHARS",
  6000,
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

  let resolvedPipelineOutput = null;

  if (options.outputDir) {
    resolvedPipelineOutput = path.resolve(options.outputDir);
  } else if (outputDirArg) {
    const raw = outputDirArg.trim();

    try {
      resolvedPipelineOutput = path.isAbsolute(raw)
        ? path.resolve(raw)
        : resolveOutputDir(raw);
    } catch (err) {
      console.error("[SCAN] Não foi possível resolver outputDir:", err.message || err);
      process.exit(1);
    }
  }

  const projectRoot = path.resolve(ROOT_DIR, projectArg);
  const iaResolved = resolveProjectIaDir(projectRoot);
  const projectIARelPath =
    path.relative(projectRoot, iaResolved.iaDir).replace(/\\/g, "/") ||
    "docs/.IA";
  const projectOutputsRelPath = `${projectIARelPath}/outputs/<run-id>`;

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

  const fileTreeRaw = listFiles(projectRoot, projectRoot)
    .slice(0, 500)
    .join("\n");
  const fileTree = compactBlock(
    "file tree",
    fileTreeRaw,
    SCAN_FILE_TREE_MAX_CHARS,
  );
  const importantFiles = collectImportantFiles(projectRoot);
  const globalContext = compactBlock(
    "global_context",
    collectGlobalContext(),
    SCAN_GLOBAL_CONTEXT_MAX_CHARS,
  );
  const operationalDocs = compactBlock(
    "operational_docs",
    collectOperationalDocs(),
    SCAN_OPERATIONAL_DOCS_MAX_CHARS,
  );
  const projectLocalTruth = collectProjectLocalTruth(projectSetupDir);
  const projectIAContext = collectIAContext(projectRoot);

  const prompt = `${agent}

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade técnica local do pipeline
project/${projectIARelPath} = verdade semântica local do projeto
project/${projectOutputsRelPath} = histórico da execução

## SOURCE OF TRUTH RULES

- Use setup-boss/context apenas como verdade global do sistema.
- Use setup-boss/docs apenas como documentação operacional.
- Use project/.setup-boss como verdade técnica local do pipeline.
- Use project/${projectIARelPath} como base semântica persistente do projeto (padrão docs/.IA; legado .IA na raiz quando aplicável).
- Não misture knowledge global com knowledge local do projeto.
- Não escreva informações locais do projeto em setup-boss/context.
- Não trate outputs antigos como fonte de verdade permanente.

${globalContext}

${operationalDocs}

${projectLocalTruth}

## PROJECT IA CONTEXT
${projectIAContext || "(documentação IA local ainda ausente ou vazia — padrão docs/.IA; legado .IA na raiz)"}

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

  if (resolvedPipelineOutput) {
    writePromptSizeRecord(resolvedPipelineOutput, "scan", {
      total_prompt_chars: prompt.length,
      user_chars: prompt.length,
      blocks: {
        agent: agent.length,
        global_context: globalContext.length,
        operational_docs: operationalDocs.length,
        project_local_truth: projectLocalTruth.length,
        file_tree: fileTree.length,
        important_files: importantFiles.length,
        project_ia_context: String(
          projectIAContext ||
            "(documentação IA local ainda ausente ou vazia — padrão docs/.IA; legado .IA na raiz)"
        ).length,
      },
    });
  }

  const scanModel = getModelForStep("scan");

  const response = await client.responses.create({
    model: scanModel,
    input: prompt,
  });

  console.log("[SCAN] after OpenAI responses.create");

  const scanOutput = response.output_text || "";

  if (resolvedPipelineOutput) {
    recordLLMUsage({
      outputDir: resolvedPipelineOutput,
      step: "scan",
      model: scanModel,
      usage: response.usage,
    });
  }

  const projectScanPath = path.join(projectSetupDir, "project-scan.md");
  console.log("[SCAN] saving project-scan.md");
  console.log("[SCAN] saving scan-output.md if outputDir exists");
  fs.writeFileSync(projectScanPath, scanOutput, "utf-8");

  const iaMode = resolvedPipelineOutput ? "diagnostic" : "minimal";

  console.log(
    `[SCAN] garantindo documentação IA (baseline, sem LLM) + diagnóstico: modo=${iaMode}`,
  );

  const iaResult = await ensureIA(projectRoot, {
    projectScan: scanOutput,
    outputDir: resolvedPipelineOutput,
    mode: iaMode,
  });

  console.log("[SCAN] IA dir:", iaResult.iaDir);
  if (iaResult.created.length > 0) {
    console.log("[SCAN] IA baseline files created:", iaResult.created.join(", "));
  }

  if (resolvedPipelineOutput) {
    ensureDir(resolvedPipelineOutput);

    fs.writeFileSync(
      path.join(resolvedPipelineOutput, "scan-output.md"),
      scanOutput,
      "utf-8"
    );

    fs.writeFileSync(
      path.join(resolvedPipelineOutput, "scan-input.md"),
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
    projectIADir: iaResult.iaDir,
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