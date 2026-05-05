const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");

const IA_DIR_NAME = ".IA";

const IA_FILES = [
  "00-project-profile.md",
  "01-architecture.md",
  "02-stack.md",
  "03-coding-standards.md",
  "04-domain-context.md",
  "05-folder-map.md",
  "06-runbook.md",
  "07-decisions.md",
  "08-activity-history.md",
  "09-known-issues.md",
  "10-ai-rules.md",
];

function envMaxChars(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const IA_CONTEXT_AI_RULES_MAX_CHARS = envMaxChars(
  "IA_CONTEXT_AI_RULES_MAX_CHARS",
  2000,
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

const IA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documents"],
  properties: {
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "content"],
        properties: {
          file: {
            type: "string",
            enum: IA_FILES,
          },
          content: {
            type: "string",
          },
        },
      },
    },
  },
};

/** Atualização determinística só por evidência em disco/execução (sem LLM). */
const FACT_DRIVEN_IA_FILES = ["02-stack.md", "05-folder-map.md", "06-runbook.md"];

/** Ficheiros enriquecidos por LLM de forma incremental (merge com baseline). */
const SEMANTIC_IA_FILES = IA_FILES.filter(
  (f) =>
    f !== "08-activity-history.md" && !FACT_DRIVEN_IA_FILES.includes(f),
);

const SEMANTIC_LEARNING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documents"],
  properties: {
    documents: {
      type: "array",
      minItems: SEMANTIC_IA_FILES.length,
      maxItems: SEMANTIC_IA_FILES.length,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "content"],
        properties: {
          file: {
            type: "string",
            enum: SEMANTIC_IA_FILES,
          },
          content: {
            type: "string",
          },
        },
      },
    },
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeRead(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  }

  return false;
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
    ".setup-boss",
    ".IA",
  ]);

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let result = [];

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(projectRoot, fullPath).replace(/\\/g, "/");

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

function collectImportantFiles(projectRoot) {
  const files = [
    "package.json",
    "README.md",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".env.example",
    "tsconfig.json",
    "vite.config.js",
    "vite.config.ts",
    "next.config.js",
    "next.config.ts",
    "src/main.js",
    "src/main.jsx",
    "src/main.ts",
    "src/main.tsx",
    "src/App.js",
    "src/App.jsx",
    "src/App.tsx",
  ];

  let content = "";

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);

    if (!fs.existsSync(fullPath)) continue;

    const raw = fs.readFileSync(fullPath, "utf-8");
    content += `\n\n## FILE: ${file}\n\n${raw.slice(0, 8000)}`;
  }

  return content;
}

function getFallbackContent(projectRoot, fileName, projectScan) {
  const projectName = path.basename(projectRoot);

  const fallback = {
    "00-project-profile.md": `# Project Profile

## Nome

${projectName}

## Objetivo do projeto

Não confirmado ainda.

## Tipo de sistema

Não confirmado ainda.

## Status atual

Baseline inicial criado automaticamente pela Setup Boss.

## Principais módulos

A confirmar conforme análise do projeto.

## Como rodar

Ver \`06-runbook.md\`.

## Como validar

Ver \`06-runbook.md\`.

## Observações importantes

Este documento deve ser mantido atualizado ao fim das atividades relevantes.
`,

    "01-architecture.md": `# Architecture

## Visão geral

A confirmar com base no código real.

## Fluxo principal

A confirmar.

## Camadas

A confirmar.

## Integrações

A confirmar.

## Banco de dados

A confirmar.

## Autenticação

A confirmar.

## Jobs / Workers

A confirmar.

## Pontos críticos

A confirmar.
`,

    "02-stack.md": `# Stack

## Frontend

A confirmar.

## Backend

A confirmar.

## Database

A confirmar.

## Infra

A confirmar.

## Libs principais

A confirmar.

## Versões relevantes

A confirmar.

## Comandos úteis

A confirmar.
`,

    "03-coding-standards.md": `# Coding Standards

## Nomenclatura

A confirmar.

## Estrutura de arquivos

A confirmar.

## Padrões de componentes

A confirmar.

## Padrões de API

A confirmar.

## Padrões de erro

A confirmar.

## O que evitar

A confirmar.
`,

    "04-domain-context.md": `# Domain Context

## O que o sistema resolve

A confirmar.

## Entidades principais

A confirmar.

## Fluxos de negócio

A confirmar.

## Regras importantes

A confirmar.

## Termos usados no projeto

A confirmar.
`,

    "05-folder-map.md": `# Folder Map

## Pastas principais

A confirmar.

## Responsabilidade de cada pasta

A confirmar.

## Arquivos sensíveis

A confirmar.

## Arquivos que normalmente não devem ser alterados

A confirmar.
`,

    "06-runbook.md": `# Runbook

## Como instalar

A confirmar.

## Como rodar local

A confirmar.

## Como rodar testes

A confirmar.

## Como rodar build

A confirmar.

## Como debugar

A confirmar.

## Docker

A confirmar.

## Variáveis de ambiente

A confirmar.
`,

    "07-decisions.md": `# Technical Decisions

Este arquivo registra decisões técnicas permanentes do projeto.

Não usar como log operacional.

---

## ADR-0001 — Baseline de documentação IA

### Contexto

O projeto passou a usar a pasta \`.IA\` como base local de conhecimento para execução assistida.

### Decisão

Manter documentação persistente do projeto dentro de \`.IA\`.

### Motivo

Evitar reinvestigar o projeto do zero a cada atividade.

### Impacto

Architect, Executor, Review e Knowledge passam a ter contexto local mais estável.

### Data

${new Date().toISOString().slice(0, 10)}
`,

    "08-activity-history.md": `# Activity History

Este arquivo registra o histórico objetivo das atividades executadas no projeto.

Formato esperado:

\`\`\`md
## YYYY-MM-DD — Nome da atividade

### Objetivo

### Arquivos alterados

### O que foi feito

### Validação

### Pendências

### Observações
\`\`\`
`,

    "09-known-issues.md": `# Known Issues

Este arquivo registra problemas conhecidos que podem impactar próximas atividades.

Formato esperado:

\`\`\`md
## Problema

### Sintoma

### Causa provável

### Status

### Workaround

### Próximo passo
\`\`\`
`,

    "10-ai-rules.md": `# AI Rules

## Regras obrigatórias

- Não alterar arquitetura sem aprovação explícita.
- Não alterar arquivos fora do escopo definido pelo Architect.
- Não inventar contexto.
- Consultar esta pasta antes de planejar alterações.
- Atualizar \`08-activity-history.md\` ao fim de atividades executadas.
- Registrar decisões permanentes em \`07-decisions.md\` quando necessário.
- Registrar problemas recorrentes em \`09-known-issues.md\` quando necessário.

## Restrições

- Não tratar output temporário como fonte de verdade permanente.
- Não misturar documentação do Setup Boss com documentação local do projeto.

## Fonte local de verdade

A pasta \`.IA\` representa a base semântica local do projeto.

## Project Scan Inicial

${projectScan ? projectScan.slice(0, 4000) : "Não informado."}
`,
  };

  return fallback[fileName] || `# ${fileName}\n\nA confirmar.\n`;
}

async function generateDocumentsWithAI(projectRoot, projectScan) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const agentPath = path.join(path.resolve(__dirname, ".."), "agents", "project-profile.md");
  const agent = safeRead(agentPath);

  if (!agent.trim()) {
    return null;
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const fileTree = listFiles(projectRoot, projectRoot).slice(0, 500).join("\n");
  const importantFiles = collectImportantFiles(projectRoot);

  const prompt = `${agent}

## PROJECT TARGET

${projectRoot}

## PROJECT SCAN

${projectScan || "(project-scan ainda não informado)"}

## FILE TREE

${fileTree}

## IMPORTANT FILE CONTENT

${importantFiles}

## REQUIRED FILES

${IA_FILES.map((file) => `- ${file}`).join("\n")}

Gere exatamente um documento para cada arquivo listado em REQUIRED FILES.
Não invente fatos sem evidência.
Quando algo não estiver confirmado, escreva "A confirmar".
`;

  const bootstrapModel = getModelForStep("ensure_ia");

  const response = await client.responses.create({
    model: bootstrapModel,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "project_ia_documents",
        strict: true,
        schema: IA_SCHEMA,
      },
    },
  });

  recordLLMUsage({
    step: "ensure_ia",
    model: bootstrapModel,
    usage: response.usage,
  });

  return JSON.parse(response.output_text);
}

/**
 * Ensures `.IA/` exists with deterministic stub files only.
 * Never calls the LLM (no enrichment at pipeline start).
 */
async function ensureIAMinimal(projectRoot, options = {}) {
  if (!projectRoot) {
    throw new Error("projectRoot obrigatório para ensureIAMinimal.");
  }

  const resolvedProjectRoot = path.resolve(projectRoot);

  if (!fs.existsSync(resolvedProjectRoot)) {
    throw new Error(`Projeto alvo não encontrado: ${resolvedProjectRoot}`);
  }

  const iaDir = path.join(resolvedProjectRoot, IA_DIR_NAME);
  const existedBefore = fs.existsSync(iaDir);

  ensureDir(iaDir);

  const created = [];
  const projectScan = options.projectScan || "";

  for (const fileName of IA_FILES) {
    const filePath = path.join(iaDir, fileName);
    const content = getFallbackContent(
      resolvedProjectRoot,
      fileName,
      projectScan,
    );

    if (writeIfMissing(filePath, content)) {
      created.push(fileName);
    }
  }

  return {
    projectRoot: resolvedProjectRoot,
    iaDir,
    existedBefore,
    created,
    mode: "minimal",
  };
}

function writeJsonStable(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Avalia apenas o estado atual de `.IA` no disco — não escreve nada nem chama IA.
 * @returns {{ status: string, checked_at: string, ia_dir: string, summary: string, weak_files: Array<{file: string, reason: string}>, recommendations: string[] }}
 */
function analyzeIAQuality(projectRoot) {
  const resolved = path.resolve(projectRoot);
  const iaDirAbs = path.join(resolved, IA_DIR_NAME);
  const checked_at = new Date().toISOString();
  const weak_files = [];
  const recommendations = [];
  const ia_dir = iaDirAbs.replace(/\\/g, "/");

  if (!fs.existsSync(iaDirAbs)) {
    return {
      status: "missing",
      checked_at,
      ia_dir,
      summary: "Documentação incompleta: pasta .IA ausente.",
      weak_files: IA_FILES.map((file) => ({
        file,
        reason: "Pasta .IA não existe neste projeto.",
      })),
      recommendations: [
        "Rodar o Setup Boss para criar `.IA/` e arquivos base (somente placeholders, sem enriquecimento por IA até aprovação).",
      ],
    };
  }

  const stubPhrases = [
    "a confirmar",
    "não confirmado ainda",
    "baseline inicial criado automaticamente",
  ];

  for (const fileName of IA_FILES) {
    const fp = path.join(iaDirAbs, fileName);

    if (!fs.existsSync(fp)) {
      weak_files.push({
        file: fileName,
        reason: "Arquivo ausente na pasta .IA.",
      });
      recommendations.push(`Garantir criação de \`${fileName}\` (baseline automático).`);
      continue;
    }

    const trimmed = safeRead(fp).trim();

    if (!trimmed) {
      weak_files.push({
        file: fileName,
        reason: "Arquivo existente mas vazio.",
      });
      continue;
    }

    const lower = trimmed.toLowerCase();
    const suspicious = stubPhrases.some((p) => lower.includes(p));
    const veryShort =
      trimmed.length < 120 && fileName !== "08-activity-history.md";

    if (fileName === "08-activity-history.md") {
      const hasDatedRuns = /\d{4}-\d{2}-\d{2}/.test(trimmed);
      const paragraphBlocks = trimmed.split(/\n(?=## )/).length;

      if (!hasDatedRuns || paragraphBlocks < 2) {
        weak_files.push({
          file: fileName,
          reason:
            "Só modelo inicial ou sem registros claros ## YYYY-MM-DD — nome da atividade.",
        });
      }
    } else if (veryShort || suspicious) {
      weak_files.push({
        file: fileName,
        reason: suspicious ?
          "Contém 'A confirmar' ou placeholders típicos."
        : "Conteúdo curto para documento de referência.",
      });
    }
  }

  const hasStructuralGap = weak_files.some((w) =>
    w.reason.includes("Arquivo ausente na pasta"),
  );

  if (weak_files.length === 0) {
    return {
      status: "ok",
      checked_at,
      ia_dir,
      summary: "Documentação .IA presente e dentro do esperado para execução.",
      weak_files: [],
      recommendations: [
        "Após próximas tarefas aprovadas, o enriquecimento pós-review manterá a pasta alinhada ao código.",
      ],
    };
  }

  recommendations.unshift(
    "Enriquecer com base em execuções aprovadas quando o projeto estiver sob Setup Boss.",
  );

  const summary = hasStructuralGap
    ? "Documentação incompleta (estrutura .IA incompleta)."
    : "Documentação incompleta (placeholders ou conteúdo fraco detectados).";

  return {
    status: "weak",
    checked_at,
    ia_dir,
    summary,
    weak_files,
    recommendations,
  };
}

/**
 * Grava apenas `<projeto>/.IA/outputs/<run-id>/ia-diagnostics.json` — não altera `.IA` além do permitido.
 */
function writeIADiagnostics(projectRoot, outputDir) {
  if (!outputDir) {
    return null;
  }

  const resolvedOut = path.resolve(outputDir);

  ensureDir(resolvedOut);
  const payload = analyzeIAQuality(path.resolve(projectRoot));
  const outPath = path.join(resolvedOut, "ia-diagnostics.json");

  writeJsonStable(outPath, payload);

  return outPath;
}

/**
 * Baseline .IA: só cria o que falta (`writeIfMissing`). Sem IA.
 * Com `mode: "diagnostic"` e `outputDir`, grava `ia-diagnostics.json` (sem alterar .IA além da criação inicial).
 */
async function ensureIA(projectRoot, options = {}) {
  const mode = options.mode || "minimal";
  const bootstrap = await ensureIAMinimal(projectRoot, options);

  if (mode === "diagnostic" && options.outputDir) {
    writeIADiagnostics(projectRoot, options.outputDir);
  }

  return bootstrap;
}

function assertPathInsideDir(fileAbsolute, dirAbsolute, label) {
  const resolvedFile = path.resolve(fileAbsolute);
  const resolvedDir = path.resolve(dirAbsolute);

  if (
    resolvedFile !== resolvedDir &&
    !resolvedFile.startsWith(resolvedDir + path.sep)
  ) {
    throw new Error(`${label}: escrita fora da pasta permitida (${resolvedDir}).`);
  }
}

const IA_MARK = {
  stackStart: "<!-- IA:AUTO:FACTS_STACK -->",
  stackEnd: "<!-- /IA:AUTO:FACTS_STACK -->",
  folderStart: "<!-- IA:AUTO:FACTS_FOLDER_MAP -->",
  folderEnd: "<!-- /IA:AUTO:FACTS_FOLDER_MAP -->",
  scriptsStart: "<!-- IA:AUTO:FACTS_PACKAGE_SCRIPTS -->",
  scriptsEnd: "<!-- /IA:AUTO:FACTS_PACKAGE_SCRIPTS -->",
};

/** Regexp que casa cada bloco FACT completo para não o alterarmos fora dos injectMarkedSection. */
function buildFactRegionsCombinedRegex() {
  const chunks = [
    `${escapeRegexSegment(IA_MARK.stackStart)}[\\s\\S]*?${escapeRegexSegment(IA_MARK.stackEnd)}`,
    `${escapeRegexSegment(IA_MARK.folderStart)}[\\s\\S]*?${escapeRegexSegment(IA_MARK.folderEnd)}`,
    `${escapeRegexSegment(IA_MARK.scriptsStart)}[\\s\\S]*?${escapeRegexSegment(IA_MARK.scriptsEnd)}`,
  ];

  return new RegExp(`(${chunks.join("|")})`, "gm");
}

function escapeRegexSegment(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMdTablePipe(s) {
  return String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function injectMarkedSection(existing, markerStart, markerEnd, bodyMarkdown) {
  const trimmedStart = markerStart.trim();
  const trimmedEnd = markerEnd.trim();

  const block = `${trimmedStart}\n${String(bodyMarkdown || "").trim()}\n${trimmedEnd}`;
  const re = new RegExp(
    `${escapeRegexSegment(trimmedStart)}[\\s\\S]*?${escapeRegexSegment(trimmedEnd)}`,
    "m",
  );

  if (re.test(existing)) {
    return existing.replace(re, block);
  }

  return `${String(existing || "").trimEnd()}\n\n${block}\n`;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return null;
  }
}

function normalizeComparableChunk(chunk) {
  return String(chunk)
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-ZÀ-ÿ0-9\s\-_.\/()]/g, "")
    .toLowerCase()
    .trim();
}

function isSubstantiveParagraph(p) {
  const t = p.trim();

  if (!t) return false;
  if (/^#{1,6}\s+.*/m.test(t) && !t.includes("\n")) return false;
  if (/^---+$/m.test(t)) return false;

  const lower = t.toLowerCase();

  if (/\b(a confirmar|não confirmado ainda)\b/i.test(lower)) return false;

  const cleaned = normalizeComparableChunk(t).replace(/\s+/g, "");

  return cleaned.length >= 52;
}

function paragraphBlocks(text) {
  return text.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
}

function stripPreservedBaselineSections(text) {
  let s = String(text || "");

  while (/\n(?:---\s*)?\n\s*#{1,6}\s+Preservado do baseline/i.test(s)) {
    s =
      s
        .replace(/\n(?:---\s*)?\n\s*#{1,6}\s+Preservado do baseline[\s\S]*$/im, "")
        .trimEnd();
  }

  return String(s || "").trimEnd();
}

/** Aplica um mutador só fora das regiões FACT marcadas (FACTS_STACK, FOLDER_MAP, PACKAGE_SCRIPTS). */
function transformMarkdownOutsideFactRegions(markdown, mutator) {
  const re = buildFactRegionsCombinedRegex();
  const parts = String(markdown || "").split(re);

  return parts.map((part, idx) => (idx % 2 === 1 ? part : mutator(part))).join("");
}

function sanitizeEvidenceChunk(s, maxLen) {
  return String(s || "").replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function tokenHints(blob) {
  const raw =
    String(blob || "")
      .toLowerCase()
      .match(/[a-zà-ÿ]{4,}/gi) || [];

  const uniq = [];

  for (const w of raw) {
    if (w.length > 42 || uniq.includes(w)) continue;

    uniq.push(w);

    if (uniq.length > 26) break;
  }

  return uniq;
}

function bestScanFragment(scanText, hints) {
  const scan = stripPreservedBaselineSections(String(scanText || ""));

  if (!scan.trim()) return "";

  const paras = scan
    .split(/\n\s*\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 32);

  if (!paras.length) return sanitizeEvidenceChunk(scan.slice(0, 820), 480);

  const hintLc = hints.map((h) => String(h).toLowerCase());
  let best = paras[0];
  let score = -1;

  for (const p of paras) {
    const low = p.toLowerCase();
    let sc = 0;

    for (const h of hintLc) {
      if (low.includes(h)) sc++;
    }

    if (sc > score) {
      score = sc;
      best = p;
    }
  }

  return sanitizeEvidenceChunk(score <= 0 ? paras[0] : best, 520);
}

function synthesizeFromBundleSnippet(headingBlob, bundle) {
  const h = `${headingBlob} `.toLowerCase();
  const bits = [];

  if (/\b(run|npm|pnpm|yarn|instal|test|build|script|execu|comando)\b/i.test(h)) {
    bits.push(
      `${bundle.runner.name}: instalação \`${bundle.runner.install}\`; detalhes de scripts em FACTS_PACKAGE_SCRIPTS (06-runbook).`,
    );
  }

  if (/\b(stack|depend|pacote|package|frontend|backend|typescript|javascript|node|runtime|lib)\b/i.test(h)) {
    if (bundle.packageJsonPresent && bundle.pkg && bundle.pkg.name) {
      bits.push(`Pacote raiz \`${bundle.pkg.name}\` — estruturas completas apenas em FACTS_STACK (02).`);
    }
  }

  if (/\b(folder|pastas|estrutura|path|arvore|[tT]ree|map)\b/i.test(h)) {
    bits.push("Mapa canónico apenas em FACTS_FOLDER_MAP (05).");
  }

  if (
    /\b(estilo|c[oó]digo|coding|eslint|formatter|indent|tsx?|jsx?|ext\b|extensions?|extens[oõ]es)\b/i.test(h)
  ) {
    bits.push(`Extensões amostradas: ${sanitizeEvidenceChunk(String(bundle.codingEvidence || "").replace(/\n/g, "; "), 320)}`);
  }

  return bits.join(" ").trim();
}

function pickEvidenceForWeak(ctx, bundle, scanText) {
  const hints = tokenHints(ctx);
  const fromScan = bestScanFragment(scanText, hints);
  const fromBund = synthesizeFromBundleSnippet(ctx, bundle);

  return sanitizeEvidenceChunk([fromBund, fromScan].filter(Boolean).join(" "), 720).trim();
}

function mostlyWeakLineCore(line) {
  const core =
    line
      .replace(/^([ \t]*)[>*]+[ \t]*/, "")
      .replace(/^([ \t]*)([-*+]|\d+\.[ \t]+)/, "")
      .trim();

  const stripped =
    core
      .replace(/\b(A confirmar|Não confirmado ainda|Não confirmado)\b\.?/gi, " ");

  const words = stripped.match(/[a-zà-ÿ]{3,}/gi) || [];

  return words.length < 18;
}

function weakPhraseCount(line) {
  return [...String(line).matchAll(/\b(A confirmar|Não confirmado ainda|Não confirmado)\b/gi)].length;
}

/** Substitui “A confirmar” / não confirmado por evidências fora dos FACT blocks (segmento já isolado por transformMarkdownOutsideFactRegions). */
function substituteWeakPlaceholdersInSegment(segment, bundle, scanText) {
  const scan = String(scanText || "");
  let ctx = "";
  const lines = String(segment || "").split("\n");
  const out = [];

  for (const line of lines) {
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) ctx = `${ctx}\n${hm[1]} ${hm[2]}`;

    if (!/\b(A confirmar|Não confirmado ainda|Não confirmado)\b/i.test(line)) {
      out.push(line);

      continue;
    }

    const ev = pickEvidenceForWeak(ctx, bundle, scan);
    if (!ev) {
      out.push(line);

      continue;
    }

    const nWeak = weakPhraseCount(line);

    if (mostlyWeakLineCore(line)) {
      const indent = (line.match(/^([ \t>]*)/) || ["", ""])[1];
      const bullet = line.match(/^\s{0,40}([-*+] |\d+[.)]\s+)/);

      out.push(`${indent}${bullet ? bullet[1] : ""}${sanitizeEvidenceChunk(ev, 620)}`);

      continue;
    }

    if (nWeak > 1) {
      const indent = (line.match(/^([ \t>]*)/) || ["", ""])[1];

      out.push(`${indent}${sanitizeEvidenceChunk(ev, 480)}`);

      continue;
    }

    const snippet = sanitizeEvidenceChunk(ev, 340);

    out.push(
      line.replace(/\b(A confirmar|Não confirmado ainda|Não confirmado)\b\.?/gi, () => snippet.trim()),
    );
  }

  return out.join("\n");
}

/** Remove parágrafos substantivos repetidos dentro de um segmento não-FACT. */
function dedupeRepeatedParagraphSegments(segment) {
  const blocks = String(segment || "").split(/\n\n+/);
  const kept = [];
  const seenParagraph = new Set();

  for (const block of blocks) {
    const trimmed = block.trim();

    if (!trimmed) {
      continue;
    }

    if (/^#{1,6}\s[^\n]*$/m.test(trimmed)) {
      kept.push(trimmed);

      continue;
    }

    if (/^```/m.test(trimmed)) {
      kept.push(trimmed);

      continue;
    }

    if (trimmed.length < 72) {
      kept.push(trimmed);

      continue;
    }

    const collapsed =
      normalizeComparableChunk(trimmed)
        .replace(/\s+/g, "");

    const sig = collapsed.slice(0, Math.min(collapsed.length, 420));

    if (collapsed.length >= 72 && sig.length >= 52) {
      if (seenParagraph.has(sig)) continue;

      seenParagraph.add(sig);
    }

    kept.push(trimmed);
  }

  return kept.join("\n\n");
}

/** Pós-merge: tirar cópias empilhadas de “Preservado”, aplicar placeholders fracos só fora FACT, deduplicate. */
function postProcessEnrichedMarkdown(markdown, bundle, scanText) {
  let t = stripPreservedBaselineSections(String(markdown || ""));
  const scan = stripPreservedBaselineSections(String(scanText || ""));

  t =
    transformMarkdownOutsideFactRegions(t, (seg) =>
      substituteWeakPlaceholdersInSegment(seg, bundle, scan),
    );

  t =
    transformMarkdownOutsideFactRegions(t, (seg) =>
      dedupeRepeatedParagraphSegments(seg),
    );

  return t.trimEnd() + "\n";
}

function filterRedundantOrphans(orphans, suggestedBody) {
  const ncol =
    normalizeComparableChunk(suggestedBody)
      .replace(/\s+/g, "");

  const seen = new Set();
  const out = [];

  for (const p of orphans) {
    const col =
      normalizeComparableChunk(p)
        .replace(/\s+/g, "");

    const sig = col.slice(0, 140);

    if (sig.length < 48) continue;
    if (seen.has(sig)) continue;

    seen.add(sig);

    if (col.length >= 55 && ncol.includes(col)) continue;

    out.push(p);
  }

  return out;
}

function mergePreserveSubstantiveBlocks(existingRaw, suggestedFromLLM) {
  const existing = stripPreservedBaselineSections(String(existingRaw || ""));
  const suggestedBase = stripPreservedBaselineSections(String(suggestedFromLLM || ""));

  if (!existing.trim()) {
    return String(suggestedBase || "").trim() + "\n";
  }

  if (!suggestedBase.trim()) {
    return existing.trimEnd() + "\n";
  }

  const normalizedMerged = normalizeComparableChunk(suggestedBase);
  const orphaned = [];

  for (const p of paragraphBlocks(existing)) {
    if (!isSubstantiveParagraph(p)) continue;

    const key = normalizeComparableChunk(p).slice(0, 260);

    if (key.length < 40) continue;

    const probeA = normalizedMerged.includes(key.slice(0, Math.min(key.length, 140)));
    const probeB = normalizedMerged.includes(
      key.slice(40, Math.min(key.length, 220)),
    );

    const found = probeA || probeB;

    if (!found) {
      orphaned.push(p);
    }
  }

  const filtered = filterRedundantOrphans(orphaned, suggestedBase);

  if (filtered.length === 0) {
    return suggestedBase.trimEnd() + "\n";
  }

  return `${suggestedBase.trimEnd()}\n\n---\n\n## Preservado do baseline — blocos antes existentes não espelhados no merge atual\n\n${filtered.join("\n\n")}\n`;
}

function inferPrimaryPackageCommand(projectRoot) {
  const root = path.resolve(projectRoot);

  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    return { name: "pnpm", install: "pnpm install", exec: "pnpm exec" };
  }

  if (fs.existsSync(path.join(root, "yarn.lock"))) {
    return { name: "yarn", install: "yarn", exec: "yarn" };
  }

  if (
    fs.existsSync(path.join(root, "package-lock.json")) ||
    fs.existsSync(path.join(root, "npm-shrinkwrap.json"))
  ) {
    return { name: "npm", install: "npm install", exec: "npx" };
  }

  return { name: "(npm/yarn — inferir pela equipa)", install: "npm install", exec: "npx" };
}

function collectCodingEvidenceFromPaths(relPathsAll) {
  const extBuckets = {};

  for (const rel of relPathsAll) {
    if (rel.endsWith("/")) continue;

    const ext = path.extname(rel).toLowerCase() || "(sem extensão)";

    extBuckets[ext] = (extBuckets[ext] || 0) + 1;
  }

  const top = Object.entries(extBuckets).sort((a, b) => b[1] - a[1]).slice(0, 14);

  if (top.length === 0) {
    return "(sem amostragem suficiente)";
  }

  return top.map(([ext, count]) => `- ${ext}: ${count} ficheiros`).join("\n");
}

function executorChangedRelativePaths(execChangesJsonPath) {
  const parsed = readJsonIfExists(execChangesJsonPath);

  if (!parsed || !Array.isArray(parsed)) return [];

  return parsed.map((entry) => entry && entry.path).filter(Boolean);
}

function synthesizeFactsBundle(projectRoot, outputDirResolved) {
  const root = path.resolve(projectRoot);
  const pjPath = path.join(root, "package.json");
  let pkg = null;

  if (fs.existsSync(pjPath)) {
    pkg = readJsonIfExists(pjPath);
  }

  const relPathsAll = listFiles(root, root, 0, 3);
  const execPaths = executorChangedRelativePaths(
    path.join(outputDirResolved, "executor-changes.json"),
  );

  const runner = inferPrimaryPackageCommand(root);

  return {
    packageJsonPresent: !!pkg,
    pkg,
    runner,
    relPathsAll,
    executorChangedPaths: execPaths,
    codingEvidence: collectCodingEvidenceFromPaths(relPathsAll),
  };
}

function renderFactsStackMarkdown(bundle) {
  if (!bundle.pkg) {
    return "> Não há `package.json` no root — evidência limitada.";
  }

  const p = bundle.pkg;
  const lines = [];

  lines.push("| Campo | Valor |");
  lines.push("| --- | --- |");

  if (p.name) {
    lines.push(`| nome | ${p.name} |`);
  }

  if (p.version) {
    lines.push(`| versão declarada | ${p.version} |`);
  }

  if (p.type) {
    lines.push(`| type | ${p.type} |`);
  }

  if (p.private) {
    lines.push(`| privado | sim |`);
  }

  if (p.engines && typeof p.engines === "object") {
    const eng = Object.entries(p.engines)
      .map(([k, v]) => `${k} ${v}`)
      .join("; ");

    if (eng.trim()) {
      lines.push(`| engines | ${eng} |`);
    }
  }

  const deps = p.dependencies ? Object.keys(p.dependencies) : [];
  const devDeps = p.devDependencies ? Object.keys(p.devDependencies) : [];

  if (deps.length) {
    lines.push(`| dependências (${deps.length}) | ${deps.slice(0, 40).join(", ")}${deps.length > 40 ? ", …" : ""} |`);
  }

  if (devDeps.length) {
    lines.push(`| devDependencies (${devDeps.length}) | ${devDeps.slice(0, 35).join(", ")}${devDeps.length > 35 ? ", …" : ""} |`);
  }

  return lines.join("\n");
}

function renderFactsFolderMarkdown(bundle) {
  const tree = [...bundle.relPathsAll].sort();

  let body = ""

    + "> Árvore amostrada (nível até 3) exclui pastas grandes — fonte disco.\n\n"

    + "```text\n";

  body += tree.slice(0, 420).join("\n");

  if (tree.length > 420) {
    body += `\n… (+${tree.length - 420} entradas)\n`;
  }

  body += "\n```\n";

  if (bundle.executorChangedPaths.length) {
    body += "\n### Última execução aprovada — caminhos tocados pelo executor\n\n";

    body += bundle.executorChangedPaths
      .slice(0, 60)
      .map((rel) => `- \`${rel}\``)
      .join("\n");

    if (bundle.executorChangedPaths.length > 60) {
      body += `\n\n_… (${bundle.executorChangedPaths.length} no total)._`;
    }

    body += "\n";
  }

  return body;
}

function renderFactsRunbookMarkdown(bundle, projectRoot) {
  const root = path.resolve(projectRoot);
  const lines = [];

  lines.push(`> Gestor recomendado: **${bundle.runner.name}**\n`);

  lines.push("| Comando típico | Descrição |");
  lines.push("| --- | --- |");
  lines.push(`| ${bundle.runner.install} | Instalar dependências |`);

  const scripts =
    bundle.pkg && bundle.pkg.scripts && typeof bundle.pkg.scripts === "object" ?
      bundle.pkg.scripts
    : null;

  if (scripts && Object.keys(scripts).length) {
    lines.push("| --- | Scripts em `package.json` |");

    const keys = Object.keys(scripts).sort();
    const pkgCmd =
      bundle.runner.name === "pnpm" ? "pnpm"
      : bundle.runner.name === "yarn" ? "yarn"
      : "npm";

    for (const key of keys) {
      const cell = escapeMdTablePipe(String(scripts[key]).slice(0, 120));

      lines.push(`| \`${pkgCmd} run ${key}\` | ${cell} |`);
    }
  } else {
    lines.push("| — | _(sem campo `scripts` no package.json)._ |");
  }

  lines.push("| --- | Projeto na raíz |");

  lines.push(`| ler \`${path.join(root, "README.md").replace(/\\/g, "/")}\` | Instruções humanas quando existentes |`);

  lines.push("| --- | Artefactos relacionados ao scan |");

  lines.push("| Reutilizar comandos já descritos em `scan-output.md` desta corrida quando existente | Orientação oficial do scan |");

  return lines.join("\n");
}

function applyDeterministicFactBlocks(iaDir, projectRoot, outputDirResolved) {
  const bundle = synthesizeFactsBundle(projectRoot, outputDirResolved);

  function applyPair(fileName, transform) {
    const filePath = path.join(iaDir, fileName);
    assertPathInsideDir(filePath, path.resolve(projectRoot), "applyDeterministicFactBlocks");

    const before = safeRead(filePath);
    let next =
      transform(before.trim() ?
        `${before}`
      : `# ${fileName.replace(/\.md$/, "")}\n\n`);

    if (next.trim() === before.trim()) return null;

    fs.writeFileSync(filePath, `${next.trim()}\n`, "utf-8");

    return fileName;
  }

  const mutated = [];

  const s = applyPair("02-stack.md", (existing) =>
    injectMarkedSection(
      existing.includes("# Stack") ? `${existing}`
        : `# Stack\n\n## Evidências automáticas\n\n${existing}\n`,
      IA_MARK.stackStart,
      IA_MARK.stackEnd,
      renderFactsStackMarkdown(bundle),
    ));

  if (s) mutated.push(s);

  const fm = applyPair(
    "05-folder-map.md",

    (existing) =>
      injectMarkedSection(
        existing.includes("# Folder Map") ?
          `${existing}`
        : `# Folder Map\n\n## Evidências automáticas\n\n${existing}\n`,
        IA_MARK.folderStart,
        IA_MARK.folderEnd,
        renderFactsFolderMarkdown(bundle),
      ),
  );

  if (fm) mutated.push(fm);

  const rb = applyPair(
    "06-runbook.md",

    (existing) =>
      injectMarkedSection(
        existing.includes("# Runbook") ?
          `${existing}`
        : `# Runbook\n\n## Evidências automáticas\n\n${existing}\n`,
        IA_MARK.scriptsStart,
        IA_MARK.scriptsEnd,
        renderFactsRunbookMarkdown(bundle, projectRoot),
      ),
  );

  if (rb) mutated.push(rb);

  return mutated;
}

function readIAFileBaseline(projectRoot) {
  const iaDir = path.join(path.resolve(projectRoot), IA_DIR_NAME);
  const parts = [];

  for (const fileName of IA_FILES) {
    const filePath = path.join(iaDir, fileName);
    const raw = safeRead(filePath);

    if (!raw.trim()) {
      parts.push(`\n\n## ARQUIVO: ${fileName}\n\n(vazio)`);
      continue;
    }

    parts.push(
      `\n\n## ARQUIVO: ${fileName}\n\n${raw.slice(0, 12000)}${
        raw.length > 12000 ? "\n\n…(truncado para o prompt)…" : ""
      }`,
    );
  }

  return parts.join("\n");
}

function buildFactsDigestForSemanticLLM(bundle) {
  const lines = [];

  lines.push("### Inventário sintético (evite repetir blobs que já existem sob `IA:AUTO:FACT_*`)\n");

  lines.push(`- Gestor típico: **${bundle.runner.name}**\n`);

  if (bundle.packageJsonPresent && bundle.pkg) {
    if (bundle.pkg.name) lines.push(`- Pacote declarado: \`${bundle.pkg.name}\`\n`);

    const depN = bundle.pkg.dependencies ?
      Object.keys(bundle.pkg.dependencies).length
    : 0;

    const devN = bundle.pkg.devDependencies ?
      Object.keys(bundle.pkg.devDependencies).length
    : 0;

    lines.push(`- Dependências (${depN}), dev (${devN}).\n`);
  } else {
    lines.push("- Sem `package.json` — stack não declarada via npm.\n");
  }

  lines.push("\n### Tipos / extensões mais frequentes (para `03-coding-standards.md`)\n");
  lines.push(bundle.codingEvidence);
  lines.push("\n");

  if (bundle.executorChangedPaths.length) {
    lines.push("\n### Caminhos recentemente alterados pelo executor\n");
    lines.push(bundle.executorChangedPaths.map((rel) => `- \`${rel}\``).join("\n"));

    lines.push("\n");
  }

  return lines.filter(Boolean).join("\n").trim();
}

async function generateSemanticLearningEnrichment(
  projectRoot,
  projectScan,
  approvedRunEvidence,
  factsDigest,
  llmUsageOutputDir,
) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const agentPath = path.join(
    path.resolve(__dirname, ".."),
    "agents",
    "project-profile.md",
  );
  const agent = safeRead(agentPath);

  if (!agent.trim()) {
    return null;
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const fileTree = listFiles(projectRoot, projectRoot).slice(0, 500).join("\n");
  const importantFiles = collectImportantFiles(projectRoot);
  const baseline = readIAFileBaseline(projectRoot);

  const semanticList = SEMANTIC_IA_FILES.map((file) => `- ${file}`).join("\n");

  const prompt = `${agent}

## PROJECT TARGET

${path.resolve(projectRoot)}

## RESUMO DE FACTOS EXTRAÍDOS (estrutura; não reinventar onde já há IA:AUTO nos ficheiros 02 / 05 / 06)

${factsDigest}

## PROJECT SCAN (referência textual)

${projectScan || "(sem scan consolidado)"}

## ÁRVORE (amostra)

${fileTree}

## IMPORTANT FILE CONTENT (amostra)

${importantFiles}

## BASELINE DA PASTA .IA AGORA — inclui já blocos FACTS automáticos

${baseline}

## EVIDÊNCIA DE EXECUÇÃO APROVADA (task, scan, architect, executor, executor-changes, review)

${approvedRunEvidence}

## FUNÇÃO: MOTOR DE APRENDIZADO INCREMENTAL (semânticos apenas)

Este passo atualiza apenas estes paths (lista fechada, sem \`08-activity-history\`, sem sobrescrever \`02-stack\`, \`05-folder-map\`, \`06-runbook\` — já têm marcadores FACTS atualizados de forma incremental):

${semanticList}

### Regras obrigatórias

1. Produz merge **inteligente** em cima do baseline: preserva texto substantivo válido **sem** remover parágrafos ou bullets já corretos.
2. Onde aparecer "**A confirmar**" ou "Não confirmado ainda" e houver **evidência directa** (scan, código, evidência de execução, FACT digests), substitui por afirmação curta fundamentada ou bullet concreto.
3. Mantém formato Markdown organizado (\`#\`, \`##\`) e evita fluff.
4. **Sem duplicação entre ficheiros**: não voltes a enumerar todas as dependências (isso já está sob \`<!-- IA:AUTO:FACTS_STACK -->\`). Noutros docs, no máximo frases pontuais.
5. Para \`03-coding-standards.md\`: adicionar secção curta "**Padrões observados neste run**" com convenções compatíveis com o inventário de extensões e com o código amostrado, sem apagar bullets existentes válidos — apenas complemente ou refinie placeholders.
6. Devolve **exactamente** ${SEMANTIC_IA_FILES.length} objetos (\`documents\`), um por ficheiro acima sem duplicados de \`file\`.
7. **Não cries** cabeçalhos tipo \`## Preservado do baseline\`; isso só o pipeline faz ao fundir texto existente substancial.
8. **Não dupliques** tabelas, listagens longas nem corpo já presente dentro dos blocos FACT (\`<!-- IA:AUTO:FACTS_* -->\`). Em texto por fora desses marcadores usa no máximo remissões pontuais (ex.: “ver 02-stack / FACTS_STACK”).
9. Elimina **conteúdo duplicado** repetido dentro do próprio Markdown de cada documento quando isso apenas repete FACT digests já entregues no prompt — uma menção suficiente vence dois parágrafos iguais.

## FORMATO DA RESPOSTA

JSON válido segundo o schema solicitado apenas com esses paths.
`;

  const semanticModel = getModelForStep("semantic_ia");

  const response = await client.responses.create({
    model: semanticModel,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "semantic_ia_learning_documents",
        strict: true,
        schema: SEMANTIC_LEARNING_SCHEMA,
      },
    },
  });

  if (llmUsageOutputDir) {
    recordLLMUsage({
      outputDir: llmUsageOutputDir,
      step: "semantic_ia",
      model: semanticModel,
      usage: response.usage,
    });
  }

  return JSON.parse(response.output_text);
}

/**
 * Apenas se `reviewOutput.status === "approved"`. Escreve só dentro de `.IA` (exceto `08`, mantido só por append antes desta chamada).
 */
async function enrichIAAfterApprovedRun({
  projectRoot,
  outputDir,
  metadata: _metadata,
  reviewOutput,
}) {
  if (!projectRoot || !outputDir) {
    throw new Error(
      "enrichIAAfterApprovedRun: projectRoot e outputDir são obrigatórios.",
    );
  }

  if (!reviewOutput || reviewOutput.status !== "approved") {
    return { skipped: true, reason: "review_not_approved" };
  }

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedOut = path.resolve(outputDir);

  const iaDir = path.join(resolvedRoot, IA_DIR_NAME);

  assertPathInsideDir(iaDir, resolvedRoot, "enrichIAAfterApprovedRun");

  await ensureIAMinimal(resolvedRoot);

  const deterministicFiles = applyDeterministicFactBlocks(
    iaDir,
    resolvedRoot,
    resolvedOut,
  );

  const bundle = synthesizeFactsBundle(resolvedRoot, resolvedOut);
  const factsDigest = buildFactsDigestForSemanticLLM(bundle);

  const taskMd = safeRead(path.join(resolvedOut, "task.md"));
  const architectMd = safeRead(path.join(resolvedOut, "architect-output.md"));
  const executorMd = safeRead(path.join(resolvedOut, "executor-output.md"));
  const reviewJson = safeRead(path.join(resolvedOut, "review-output.json"));
  const scanRun = safeRead(path.join(resolvedOut, "scan-output.md"));
  const scanForEnrichment =
    scanRun.trim() ?
      scanRun
    : safeRead(path.join(resolvedRoot, ".setup-boss", "project-scan.md"));

  const changesPath = path.join(resolvedOut, "executor-changes.json");
  let changesText = "";

  if (fs.existsSync(changesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(changesPath, "utf-8"));
      changesText = JSON.stringify(parsed, null, 2).slice(0, 8000);
    } catch (_) {
      changesText = "(executor-changes.json inválido)";
    }
  }

  const approvedRunEvidence = `
### metadata.runId / task
Projeto alvo em disco: ${resolvedRoot}

### task.md
${taskMd.slice(0, 12000)}

### architect-output.md
${architectMd.slice(0, 12000)}

### executor-output.md (deve mencionar lista de mudanças)
${executorMd.slice(0, 12000)}

### review-output.json (aprovado — evidência oficial)
${reviewJson.slice(0, 8000)}

### scan (scan-output.md do run ou project-scan consolidado em .setup-boss)
${scanForEnrichment.slice(0, 8000)}

### executor-changes.json (estrutura)
${changesText || "(vazio)"}
`.trim();

  if (!process.env.OPENAI_API_KEY) {
    console.log(
      "⚠️ enrichIAAfterApprovedRun: OPENAI ausente — fact blocks determinísticos aplicados; passo LLM omitido.",
    );

    return {
      skipped: false,
      deterministic_updates: deterministicFiles,
      semantic_updates: [],
      semantic_skipped_reason: "no_api_key",
    };
  }

  let generated;

  try {
    generated = await generateSemanticLearningEnrichment(
      resolvedRoot,
      scanForEnrichment,
      approvedRunEvidence,
      factsDigest,
      resolvedOut,
    );
  } catch (error) {
    console.log("⚠️ enrichIAAfterApprovedRun: falha na IA semântica — baseline FACTS mantido.");
    console.log(error.message || error);

    return {
      skipped: false,
      deterministic_updates: deterministicFiles,
      semantic_updates: [],
      semantic_skipped_reason: "ai_error",
      semantic_error: String(error.message || error),
    };
  }

  if (!generated || !Array.isArray(generated.documents)) {
    console.log("⚠️ enrichIAAfterApprovedRun: resposta semântica vazia.");

    return {
      skipped: false,
      deterministic_updates: deterministicFiles,
      semantic_updates: [],
      semantic_skipped_reason: "empty_response",
    };
  }

  const semanticWritten = [];

  for (const doc of generated.documents) {
    if (!doc || !SEMANTIC_IA_FILES.includes(doc.file)) continue;

    const filePath = path.join(iaDir, doc.file);

    assertPathInsideDir(filePath, iaDir, "enrichIAAfterApprovedRun");

    const before = safeRead(filePath);

    const mergedRaw = mergePreserveSubstantiveBlocks(
      before,
      String(doc.content || ""),
    );

    const merged = postProcessEnrichedMarkdown(
      mergedRaw,
      bundle,
      scanForEnrichment,
    );

    fs.writeFileSync(filePath, merged, "utf-8");

    semanticWritten.push(doc.file);
  }

  console.log(
    "✅ .IA atualizada (motor incremental): deterministic=",
    deterministicFiles.join(", ") || "(sem alteração visível)",
    "— semantic=",
    semanticWritten.join(", ") || "(omitido)",
  );

  return {
    skipped: false,

    deterministic_updates: deterministicFiles,

    semantic_updates: semanticWritten,

  };
}

/**
 * Geração completa via IA (uso manual: `npm run ensure-ia <projeto> -- --full`).
 * Sobrescreve arquivos .IA existentes com o resultado do modelo.
 */
async function bootstrapIAWithAI(projectRoot, projectScan) {
  const resolvedProjectRoot = path.resolve(projectRoot);

  if (!fs.existsSync(resolvedProjectRoot)) {
    throw new Error(`Projeto alvo não encontrado: ${resolvedProjectRoot}`);
  }

  const iaDir = path.join(resolvedProjectRoot, IA_DIR_NAME);
  ensureDir(iaDir);

  const generatedByAI = await generateDocumentsWithAI(
    resolvedProjectRoot,
    projectScan || "",
  );

  const generatedMap = new Map();

  if (generatedByAI && Array.isArray(generatedByAI.documents)) {
    for (const doc of generatedByAI.documents) {
      if (doc && IA_FILES.includes(doc.file)) {
        generatedMap.set(doc.file, String(doc.content || "").trim() + "\n");
      }
    }
  }

  const written = [];

  for (const fileName of IA_FILES) {
    const filePath = path.join(iaDir, fileName);
    const content =
      generatedMap.get(fileName) ||
      getFallbackContent(resolvedProjectRoot, fileName, projectScan || "");

    fs.writeFileSync(filePath, content, "utf-8");
    written.push(fileName);
  }

  return {
    projectRoot: resolvedProjectRoot,
    iaDir,
    written,
    mode: "full_ai",
  };
}

function collectIAContext(projectRoot) {
  const iaDir = path.join(path.resolve(projectRoot), IA_DIR_NAME);

  if (!fs.existsSync(iaDir)) return "";

  let content = "";

  for (const fileName of IA_FILES) {
    const filePath = path.join(iaDir, fileName);
    const raw = safeRead(filePath);

    if (!raw.trim()) continue;

    const body =
      fileName === "10-ai-rules.md"
        ? compactBlock("10-ai-rules.md", raw, IA_CONTEXT_AI_RULES_MAX_CHARS)
        : raw;

    content += `\n\n## PROJECT IA: ${fileName}\n\n${body}`;
  }

  return content;
}

module.exports = {
  IA_DIR_NAME,
  IA_FILES,
  ensureIAMinimal,
  ensureIA,
  analyzeIAQuality,
  writeIADiagnostics,
  enrichIAAfterApprovedRun,
  bootstrapIAWithAI,
  collectIAContext,
};

if (require.main === module) {
  const projectArg = process.argv[2];

  if (!projectArg || projectArg.startsWith("-")) {
    console.log("Uso: npm run ensure-ia ../meu-projeto [-- --full]");
    console.log(
      "  default: apenas .IA mínima (determinística, sem enriquecer com IA).",
    );
    console.log(
      "  --full: gera/sobrescreve .IA inteira via IA (precisa OPENAI_API_KEY e project-scan em .setup-boss).",
    );
    process.exit(1);
  }

  const ROOT_DIR = path.resolve(__dirname, "..");
  const projectRoot = path.resolve(ROOT_DIR, projectArg);
  const wantsFullAi = process.argv.includes("--full");
  const projectSetupDir = path.join(projectRoot, ".setup-boss");
  const embeddedScan = safeRead(path.join(projectSetupDir, "project-scan.md"));

  const runner = wantsFullAi
    ? bootstrapIAWithAI(projectRoot, embeddedScan)
    : ensureIA(projectRoot);

  runner
    .then((result) => {
      console.log(`✅ .IA ${wantsFullAi ? "(modo IA completo)" : "(modo mínimo)"}`);
      console.log(result.iaDir);

      const key = wantsFullAi ? "written" : "created";
      const list = result[key] || [];

      if (Array.isArray(list) && list.length > 0) {
        console.log(wantsFullAi ? "Arquivos gravados:" : "Arquivos criados:");
        for (const file of list) {
          console.log(`- ${file}`);
        }
      } else if (!wantsFullAi) {
        console.log("Nenhum arquivo novo criado.");
      }
    })
    .catch((error) => {
      console.error("❌ Erro ao garantir .IA:");
      console.error(error.message || error);
      process.exit(1);
    });
}