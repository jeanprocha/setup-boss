const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");

const ROOT_DIR = path.resolve(__dirname, "..");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
        required: ["operation", "path", "content", "reason"],
        properties: {
          operation: {
            type: "string",
            enum: ["write_file"]
          },
          path: {
            type: "string"
          },
          content: {
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

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
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
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
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

function readAllowedProjectFiles(projectRoot, allowedFiles) {
  return allowedFiles.map((filePath) => {
    const safe = assertSafeProjectPath(projectRoot, filePath);

    return {
      path: safe.relativePath,
      exists: fs.existsSync(safe.absolutePath),
      content: fs.existsSync(safe.absolutePath)
        ? fs.readFileSync(safe.absolutePath, "utf-8")
        : ""
    };
  });
}

function extractRelevantSnippet(content, keyword) {
  if (!content) return "";

  const lines = content.split("\n");

  const index = lines.findIndex((line) => line.includes(keyword));

  if (index === -1) {
    return lines.slice(0, 30).join("\n");
  }

  const start = Math.max(0, index - 5);
  const end = Math.min(lines.length, index + 15);

  return lines.slice(start, end).join("\n");
}

function applyChanges(projectRoot, allowedFiles, changes) {
  const allowedSet = new Set(allowedFiles.map(normalizeRelativePath));
  const applied = [];

  for (const change of changes) {
    const relativePath = normalizeRelativePath(change.path);

    if (!allowedSet.has(relativePath)) {
      throw new Error(`Executor tentou alterar arquivo fora do escopo: ${relativePath}`);
    }

    const safe = assertSafeProjectPath(projectRoot, relativePath);

    ensureDir(path.dirname(safe.absolutePath));

    const before = fs.existsSync(safe.absolutePath)
      ? fs.readFileSync(safe.absolutePath, "utf-8")
      : "";

    fs.writeFileSync(safe.absolutePath, change.content, "utf-8");

    let keyword = "";

    if (change.content.includes("Aurora")) {
      keyword = "Aurora";
    } else if (change.content.includes('section id="destaque"')) {
      keyword = 'section id="destaque"';
    } else if (change.content.includes('section id="promocao"')) {
      keyword = 'section id="promocao"';
    } else if (change.content.includes("Sofá")) {
      keyword = "Sofá";
    } else {
      keyword = change.path;
    }

    let snippet = extractRelevantSnippet(change.content, keyword);

    if (!snippet || snippet.length < 50) {
      snippet = change.content.slice(0, 500);
    }

    applied.push({
      operation: change.operation,
      path: relativePath,
      reason: change.reason,
      before_length: before.length,
      after_length: change.content.length,
      preview: snippet
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

  writeJson(metadataPath, metadata);
}

async function main() {
  const outputName = process.argv[2];

  if (!outputName) {
    console.log("Uso: npm run executor <outputName>");
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não encontrada no .env");
  }

  const outputDir = path.join(ROOT_DIR, "outputs", outputName);

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const taskPath = path.join(outputDir, "task.md");
  const architectPath = path.join(outputDir, "architect-output.md");

  ensureFile(metadataPath, "metadata.json");
  ensureFile(taskPath, "task.md");
  ensureFile(architectPath, "architect-output.md");

  const metadata = readJson(metadataPath);
  const projectRoot = metadata.projectRoot;

  ensureFile(projectRoot, "Projeto alvo");

  const task = readIfExists(taskPath);
  const scan = readIfExists(path.join(outputDir, "scan-output.md"));
  const architect = readIfExists(architectPath);
  const correction = readIfExists(path.join(outputDir, "correction-instructions.md"));

  const allowedFiles = extractAllowedFiles(architect);

  if (allowedFiles.length === 0) {
    throw new Error("Architect não informou arquivos prováveis para o executor.");
  }

  const projectFiles = readAllowedProjectFiles(projectRoot, allowedFiles);

  const agentPath = path.join(ROOT_DIR, "agents", "executor.md");
  const { content: agent, metadata: agentMeta } = loadAgent(agentPath);

  updateAgentMetadata(outputDir, agentMeta);

  const prompt = `
${agent}

## PROJECT ROOT

${projectRoot}

## TASK

${task}

## PROJECT SCAN

${scan}

## ARCHITECT PLAN

${architect}

## CORRECTION INSTRUCTIONS

${correction || "(nenhuma correção pendente)"}

## ALLOWED FILES

${allowedFiles.map((file) => `- ${file}`).join("\n")}

## CURRENT FILE CONTENTS

${projectFiles
  .map((file) => {
    return `### ${file.path}

Exists: ${file.exists ? "yes" : "no"}

\`\`\`
${file.content}
\`\`\``;
  })
  .join("\n\n")}

## EXECUTION RULE

### CRITICAL RULE — HTML MODIFICATION

Quando precisar alterar um arquivo HTML existente:

- NÃO reescreva o arquivo inteiro do zero
- PRESERVE todo o conteúdo existente
- LOCALIZE a seção alvo (ex: <section id="destaque">)
- INSIRA o novo conteúdo DENTRO dessa seção
- NÃO remova conteúdo existente
- NÃO altere outras seções

Exemplo esperado:

ANTES:
<section id="destaque">
  conteúdo existente
</section>

DEPOIS:
<section id="destaque">
  conteúdo existente
  NOVO BLOCO AQUI
</section>

Você DEVE garantir que o conteúdo final contenha claramente o novo item solicitado.

O produto deve ser VISÍVEL no conteúdo final do arquivo.

Retorne JSON.

Se a task exigir implementação ou evolução do código:

- É OBRIGATÓRIO gerar alterações
- NÃO é permitido retornar sucesso com changes vazio
- Se nenhuma alteração for necessária, você deve retornar status = "blocked" e justificar

Se conseguir executar:
- status = "success"
- changes deve conter os arquivos completos atualizados
- cada alteração deve usar operation = "write_file"

Se não conseguir:
- status = "blocked"
- changes = []
- blocked_reason preenchido
- evidence preenchido

Para cada alteração com sucesso:

- você deve garantir que o conteúdo final reflita claramente a mudança
- o conteúdo deve conter a nova seção ou bloco solicitado
- a alteração deve ser visível ao inspecionar o arquivo
`.trim();

  fs.writeFileSync(path.join(outputDir, "executor-input.md"), prompt, "utf-8");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
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

  const result = JSON.parse(response.output_text);

  if (result.status === "success" && (!result.changes || result.changes.length === 0)) {
    throw new Error(
      "Executor retornou sucesso sem alterações — inválido para tasks de implementação."
    );
  }

  if (
    (!result.changes || result.changes.length === 0) &&
    result.status !== "blocked"
  ) {
    result.status = "blocked";
    result.blocked_reason =
      "Nenhuma alteração proposta para task que exige implementação.";
    if (!Array.isArray(result.evidence)) {
      result.evidence = [];
    }
    if (result.evidence.length === 0) {
      result.evidence.push("Lista changes vazia para task que exige implementação.");
    }
  }

  if (result.status === "blocked") {
    writeJson(path.join(outputDir, "executor-result.json"), result);

    console.log("⛔ Executor bloqueado.");

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
      JSON.stringify([], null, 2)
    );

    return;
  }

  const applied = applyChanges(projectRoot, allowedFiles, result.changes);

  result.evidence = applied.map((item) => `${item.path} atualizado com sucesso`);

  writeJson(path.join(outputDir, "executor-result.json"), result);

  writeJson(path.join(outputDir, "executor-changes.json"), applied);

  fs.writeFileSync(
    path.join(outputDir, "executor-output.md"),
    `# Executor Output

## Status

success

## Arquivos alterados

${applied.length ? applied.map((item) => `- \`${item.path}\``).join("\n") : "- _(lista vazio em changes — estado inesperado)._"}

## Summary

${result.summary}

## Applied Changes

${applied
  .map(
    (item) => `
### ${item.path}

Reason:
${item.reason}

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

  console.log("✅ Executor concluído");
}

main().catch((error) => {
  console.error("❌ Erro no executor:", error.message || error);

  fs.writeFileSync(
    path.join(ROOT_DIR, "outputs", "executor-error.log"),
    String(error.stack || error),
    "utf-8"
  );

  process.exit(0);
});