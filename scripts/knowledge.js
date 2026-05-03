const fs = require("fs");
const path = require("path");
require("dotenv").config();

const OpenAI = require("openai");
const { loadAgent } = require("../core/agent-metadata");
const { enrichIAAfterApprovedRun } = require("./ensure-ia");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_OF_TRUTH = {
  globalContextDir: path.join(ROOT_DIR, "context"),
  operationalDocsDir: path.join(ROOT_DIR, "docs"),
  outputsDir: path.join(ROOT_DIR, "outputs"),
  projectSetupDirName: ".setup-boss",
  projectIADirName: ".IA",
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

function assertInsideDir(filePath, allowedDir, label) {
  const resolved = path.resolve(filePath);
  const allowed = path.resolve(allowedDir);

  if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) {
    console.log(`❌ Tentativa de escrever fora de ${label} bloqueada.`);
    console.log(`Arquivo: ${resolved}`);
    console.log(`Permitido apenas em: ${allowed}`);
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
      "Pare e reporte: project/.setup-boss deve ser a verdade técnica local do pipeline."
    );
    process.exit(1);
  }

  return expectedProjectSetupDir;
}

function resolveProjectIADir(metadata) {
  const projectRoot = metadata.projectRoot;

  if (!projectRoot) {
    console.log("❌ metadata.projectRoot não encontrado.");
    process.exit(1);
  }

  return path.join(projectRoot, SOURCE_OF_TRUTH.projectIADirName);
}

function updateMetadataWithKnowledgeAgent(metadataPath, agentMeta) {
  const metadata = readJson(metadataPath);

  metadata.agents = {
    ...metadata.agents,
    knowledge: agentMeta,
  };

  metadata.source_of_truth = {
    ...(metadata.source_of_truth || {}),
    hierarchy: {
      "setup-boss/context": "verdade global do sistema",
      "setup-boss/docs": "documentação operacional",
      "project/.setup-boss": "verdade técnica local do pipeline",
      "project/.IA": "verdade semântica local do projeto",
      "outputs/<run-id>": "histórico da execução",
    },
    knowledge_rules: [
      "knowledge global é somente leitura durante execuções de projeto",
      "knowledge local técnico do projeto é atualizado em project/.setup-boss/knowledge-base.md",
      "histórico semântico do projeto é atualizado em project/.IA/08-activity-history.md",
      "knowledge global e knowledge local não devem ser misturados",
      "execuções de projeto não podem escrever em setup-boss/context",
    ],
  };

  writeJson(metadataPath, metadata);

  return metadata;
}

function extractTaskTitle(taskContent, fallback) {
  const lines = taskContent.split("\n");

  for (const line of lines) {
    if (line.startsWith("# ")) {
      return line.replace(/^#\s*/, "").trim();
    }
  }

  return fallback || "Atividade executada";
}

function readExecutorChanges(outputDir) {
  const changesPath = path.join(outputDir, "executor-changes.json");

  if (!fs.existsSync(changesPath)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(changesPath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/** Limite por entrada nova (defensivo; detalhes completos ficam em outputs/<run>). */
const MAX_ACTIVITY_ENTRY_CHARS = 4000;

/** Padrões de pipeline / AC integral — HARD (bloqueiam gravação). */
const ACTIVITY_HISTORY_HARD_LEAK_REGEXES = [
  /^\s*#\s+task\b/im,
  /^\s*#\s+(review\s+report|executor\s+output|review|executor|architect)\b/im,
  /\n#\s+task\b/i,
  /\n#\s+(review\s+report|executor\s+output|review|executor|architect)\b/i,
  /\n##+\s+acceptance(\s|$)/im,
  /\n##+\s+acceptance\s+criteria\b/im,
];

const ACTIVITY_HISTORY_HARD_SUBSTR_NEEDLES = [
  "# TASK",
  "# REVIEW REPORT",
  "# REVIEW",
  "# EXECUTOR OUTPUT",
  "# EXECUTOR",
  "# ARCHITECT",
];

/** Conteúdo colado típico de secções estruturais da task → SOFT (sanitiza ### Objetivo). */
const ACTIVITY_HISTORY_SOFT_LEAK_SUBSTRS = [
  "## ACCEPTANCE",
  "## IMPACTO",
  "## FORA DE ESCOPO",
  "## OBSERVAÇÕES",
  "## OBSERVACOES",
];

const ACTIVITY_HISTORY_LONG_FENCE_INNER_CHARS = 360;

function hasLongMarkdownCodeFenceLeak(markdownText) {
  const t = String(markdownText || "").replace(/\r\n/g, "\n");

  const re = /\n?```[^\n]*\n([\s\S]*?)```/g;

  let m;

  while ((m = re.exec(t)) !== null) {
    if (
      typeof m[1] === "string" &&
      m[1].replace(/\s+/g, " ").trim().length >= ACTIVITY_HISTORY_LONG_FENCE_INNER_CHARS
    ) {
      return true;
    }
  }

  return false;
}

/**
 * NONE = limpo estruturalmente nesta heurística;
 * SOFT = trechos típicos de task colados (sanitizar objetivo);
 * HARD = outputs brutos ou AC integral — entrada não deve ser gravada.
 */
function classifyActivityHistoryLeak(text) {
  const t = String(text || "");

  if (!t.trim()) return "NONE";

  const folded = asciiFoldUpper(t).replace(/\s+/g, " ");

  const hardNeedleHits = ACTIVITY_HISTORY_HARD_SUBSTR_NEEDLES.some((n) =>
    folded.includes(
      asciiFoldUpper(n.trim()).replace(/\s+/g, " "),
    ),
  );

  if (hardNeedleHits) return "HARD";

  if (ACTIVITY_HISTORY_HARD_LEAK_REGEXES.some((re) => re.test(t))) return "HARD";

  if (hasLongMarkdownCodeFenceLeak(t)) return "HARD";

  const softHits = ACTIVITY_HISTORY_SOFT_LEAK_SUBSTRS.some((s) =>
    folded.includes(
      asciiFoldUpper(s.trim()).replace(/\s+/g, " "),
    ),
  );

  if (softHits) return "SOFT";

  return "NONE";
}

function activityHistorySnippetLooksLikeLeak(snippet) {
  return classifyActivityHistoryLeak(`\n${String(snippet || "").trim()}`) !==
    "NONE";
}

function sanitizeActivityObjectiveSection(entryMarkdown, objectiveText) {
  return String(entryMarkdown || "").replace(
    /(^|\r?\n)(### Objetivo\s*\r?\n+)[\s\S]*?(\r?\n### Arquivos alterados\b)/m,
    (_, lead, hdr, footer) =>
      `${lead}${hdr}${String(objectiveText || "").trim()}${footer}`,
  );


}

/**
 * Elimina '#' de linhas e cercas que possam disparar classificadores de leak no fallback.
 */
function activityHistoryNeutralizeForMinimalFallback(markdownChunk) {
  return String(markdownChunk || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s[^\n]+\n?/gm, "")
    .replace(/^```[^\n]*\n[\s\S]*?```\n?/gm, "")
    .replace(/```+/g, "");
}

/** Resumo de validação seguro só a partir dos campos estruturais do review (sem MD bruto). */
function activityHistorySafeValidationSummaryForFallback(reviewOutput) {
  const raw = String(reviewOutput?.summary || "").trim();

  if (!raw) return "Execução aprovada.";

  const scrubbed = activityHistoryNeutralizeForMinimalFallback(raw);

  let out = scrubbed.replace(/\s+/g, " ").trim();

  if (
    classifyActivityHistoryLeak(`\n${out}`) !== "NONE" ||
    !out.length
  ) {
    out = "Execução aprovada.";
  }

  return clipParagraph(out, 420);
}

/**
 * Fallback mínimo: só metadados (review JSON), lista de paths e texto neutro —
 * não incorpora task.md / architect-output.md / executor-output.md / review-output.md crus.
 */
function buildMinimalSafeActivityEntry({
  date,
  title,
  filesChangedLinesText,
  reviewOutput,
  runId,
}) {
  const level =
    typeof reviewOutput?.acceptance_level === "string"
      ?
        reviewOutput.acceptance_level.trim()
      : "—";

  const status =
    typeof reviewOutput?.status === "string"
      ?
        reviewOutput.status.trim()
      : "unknown";

  const validationSummary =
    activityHistorySafeValidationSummaryForFallback(reviewOutput);

  const titleSafe =
    clipParagraph(
      activityHistoryNeutralizeForMinimalFallback(
        String(title || "Execução aprovada"),
      ).trim() ||
        String(title || "Execução aprovada"),
      160,
    );

  const runIdEscaped = String(runId || "").replace(/`/g, "'").trim();

  return `---

## ${String(date)} — ${titleSafe}

### Objetivo

Atividade executada com sucesso. Detalhes completos permanecem em \`outputs/${runIdEscaped}\`.

### Arquivos alterados

${String(filesChangedLinesText || "").trim()}

### Validação

- Review: \`${status}\`
- Acceptance level: \`${level}\`
- Resumo: ${validationSummary}

### Run

\`${runIdEscaped}\`
`.trim();
}

/**
 * Produz entrada mínima + truncação e verifica NONE; registra aviso de fallback usado só em sucesso.
 */
function finalizeActivityHistoryWithMinimalFallbackOrNull(context) {
  const {
    date,
    headingTitle,
    filesChangedJoin,
    reviewOutput,
    runId,
  } = context;

  let entryBody = buildMinimalSafeActivityEntry({
    date,
    title: headingTitle,
    filesChangedLinesText: filesChangedJoin,
    reviewOutput,
    runId,
  });

  entryBody = truncateActivityEntryIfNeeded(
    entryBody.trim() + "\n",
    MAX_ACTIVITY_ENTRY_CHARS,
  );

  if (classifyActivityHistoryLeak(entryBody) !== "NONE") {
    console.warn(
      "[ActivityHistory] Fallback mínimo também contém leak. Entrada descartada.",
      runId,
    );

    return null;
  }

  console.warn(
    "[ActivityHistory] SOFT residual após sanitização. Usando fallback mínimo.",
    runId,
  );

  console.warn(
    "[ActivityHistory] Utilizado fallback mínimo seguro (entrada garantida NONE).",
    runId,
  );

  return entryBody;
}

/**
 * Até 2 rondas de sanitização de ### Objetivo + truncar; distinguir clean / HARD / necessidade de fallback.
 */
function sanitizeActivityHistoryEntryUntilClean(
  entryBody,
  fallbackObjective,
  _context = {},
) {
  let current = String(entryBody || "");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const leakLevel = classifyActivityHistoryLeak(current);

    if (leakLevel === "NONE") {
      return {
        status: "clean",
        entryBody: current,
        attempts: attempt - 1,
      };
    }

    if (leakLevel === "HARD") {
      return {
        status: "hard_leak",
        entryBody: current,
        attempts: attempt - 1,
      };
    }

    current = sanitizeActivityObjectiveSection(current, fallbackObjective);

    current = truncateActivityEntryIfNeeded(
      current.trim() + "\n",
      MAX_ACTIVITY_ENTRY_CHARS,
    );
  }

  const finalLeakLevel = classifyActivityHistoryLeak(current);

  if (finalLeakLevel === "NONE") {
    return {
      status: "clean",
      entryBody: current,
      attempts: 2,
    };
  }

  return {
    status: "fallback_required",
    entryBody: current,
    attempts: 2,
  };
}

function clipParagraph(s, maxChars) {
  const t =
    String(s || "")
      .replace(/\s+/g, " ")
      .trim();

  if (t.length <= maxChars) return t;

  return `${t.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function readExecutorResultJson(outputDir) {
  const p = path.join(outputDir, "executor-result.json");

  if (!fs.existsSync(p)) return null;

  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function normalizeMarkdownNewlines(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function asciiFoldUpper(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*\*/g, "")
    .trim()
    .toUpperCase();
}

function parseMarkdownLeadingHeading(line) {
  const m = line.trim().match(/^(#{1,6})\s+(.+)$/);

  if (!m) return null;

  return {
    level: m[1].length,
    title: String(m[2] || "").trim(),
  };
}

function isRawPipelineRawBlockLevel1Start(headerInfo) {
  if (!headerInfo || headerInfo.level !== 1) return false;

  const slug = asciiFoldUpper(headerInfo.title).replace(/\s+/g, " ");

  return (
    slug === "TASK" ||
    slug === "REVIEW REPORT" ||
    slug === "REVIEW" ||
    slug === "EXECUTOR OUTPUT" ||
    slug === "EXECUTOR" ||
    slug === "ARCHITECT"
  );
}

/** Remove `# TASK`, `# Review`, `# Architect`, … até ao próximo cabeçalho `#` (mesmo nivel). */
function stripMarkdownRawPipelineBlocks(markdownText) {
  const lines = normalizeMarkdownNewlines(markdownText).split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const h = parseMarkdownLeadingHeading(lines[i]);

    if (h && isRawPipelineRawBlockLevel1Start(h)) {
      const startLevel = h.level;

      i += 1;

      while (i < lines.length) {
        const nh = parseMarkdownLeadingHeading(lines[i]);

        if (nh && nh.level <= startLevel) break;

        i += 1;
      }

      continue;
    }

    out.push(lines[i]);
    i += 1;
  }

  return out.join("\n");
}

function cutMarkdownAtHardStopHeaders(markdownText) {
  const HARD_STOP_LINE_RES = [
    /^#\s+task\b/i,
    /^#\s+review\s+report\b/i,
    /^#\s+executor\s+output\b/i,
    /^#\s+review\b/i,
    /^#\s+executor\b/i,
    /^#\s+architect\b/i,
    /^#{2}\s+acceptance\b/i,
    /^#{2}\s+impacto\b/i,
    /^#{2}\s+fora\s+de\s+escopo\b/i,
    /^#{2}\s+observa(coes|cões)?\b/i,
  ];

  const text = normalizeMarkdownNewlines(markdownText);

  if (!text.trim()) return text;

  const lines = text.split("\n");
  const kept = [];

  for (const ln of lines) {
    const trimmed = ln.trim();

    let stop = false;

    for (const re of HARD_STOP_LINE_RES) {
      if (re.test(trimmed)) {
        stop = true;

        break;
      }
    }

    if (stop) break;

    kept.push(ln);
  }

  return kept.join("\n").trimEnd();
}

/** Ordem obrigatória: strip nivel-1 bruto → hard-stop → texto limpo para o resumo do objetivo. */
function preprocessTaskMarkdownForObjectivePipeline(markdownFull) {

  let t = normalizeMarkdownNewlines(markdownFull);

  

  t = stripMarkdownRawPipelineBlocks(t);



  

  t = cutMarkdownAtHardStopHeaders(t);



  

  return t.trim();


}

function stripMarkdownHeadingLinesFromBody(bodyText) {
  return String(bodyText || "")
    .split("\n")
    .filter((ln) => !/^#{1,6}\s+/.test(ln.trim()))
    .join("\n");
}

/**
 * HARD-stop já aplicado no fragmento; cortam-se headings tipo AC antes do texto útil.
 */
function truncateFragmentBeforeExcludedTaskSections(fragment) {
  let text = cutMarkdownAtHardStopHeaders(normalizeMarkdownNewlines(fragment));

  const searchSurface = `\n${text}`;
  let cutAt = searchSurface.length;
  const re = /\n(#{1,6}\s+[^\n]+)/g;
  let m;

  while ((m = re.exec(searchSurface)) !== null) {
    const titleText =
      m[1]
        .replace(/^#{1,6}\s+/, "")
        .trim()
        .replace(/\*\*/g, "");

    const slug =
      titleText
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    let blocked =
      /^acceptance(\s|$)/.test(slug) ||
      slug.includes("acceptance level") ||
      slug.includes("acceptance criteria");

    blocked =
      blocked ||
      (slug.includes("criterio") && slug.includes("aceite")) ||
      (slug.includes("aceite") && slug.includes("nivel"));
    blocked = blocked || (slug.includes("aceite") && slug.includes("obrigator"));

    blocked =
      blocked ||
      /\bout of scope\b/.test(slug) ||
      /^fora de escopo/.test(slug) ||
      (slug.includes("fora") && slug.includes("escopo"));

    blocked =
      blocked ||
      /^implementation\b/.test(slug) ||
      /\bimplementacao\b.*\besperada\b/.test(slug);

    blocked = blocked || /^observa(co|cao|caoes)?/.test(slug);
    blocked = blocked || /^notes\b/.test(slug);

    if (blocked) {
      cutAt = Math.min(cutAt, m.index);
    }
  }

  return searchSurface.slice(1, cutAt).trim();
}

/** Objetivo curto para o histórico (sem TASK / AC / fora-de-escopo completos). */
function buildTaskObjectiveShort(taskMarkdown, titleFallback) {
  const staged = preprocessTaskMarkdownForObjectivePipeline(taskMarkdown);
  const raw =
    staged.trim().replace(/^```[\s\S]*?```/gm, (fence) =>
      " ".repeat(Math.min(fence.length, 120)),
    );

  if (!raw.trim()) return clipParagraph(titleFallback, 520);

  const descMatch = raw.match(
    /^#{1,6}\s*[Dd]escri[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s+)/m,
  );

  let body =
    descMatch ?
      truncateFragmentBeforeExcludedTaskSections(descMatch[1].trim())
    : (() => {
        const stripped = raw.replace(/^#\s[^\n]+\n+/, "").trim();
        const idxAcc = stripped.search(
          /\n#{1,6}\s*(Acceptance\b|Aceite\b|Aceitação\b)/im,
        );
        let sliceBefore =
          idxAcc >= 0 ? stripped.slice(0, idxAcc).trim() : stripped;

        sliceBefore = truncateFragmentBeforeExcludedTaskSections(sliceBefore);

        return sliceBefore.split(/\n#{1,6}\s+/)[0].trim();
      })();

  body = stripMarkdownHeadingLinesFromBody(body);
  body = clipParagraph(body.replace(/\s+/g, " ").trim(), 720);

  if (!body || body.length < 12) return clipParagraph(titleFallback, 520);

  const condensed =
    body
      .split(/\.\s+|;\s+|(?=\n[-*])/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(". ")
      .replace(/\.\s*\./g, ".");

  return clipParagraph(condensed, 720);
}

function summaryToBullets(summaryText, maxItems, clipEach) {
  const s = String(summaryText || "").trim();

  if (!s) return [];

  const lines =
    s
      .split(/\n+/)
      .map((l) =>
        l
          .replace(/^[-*+\d.]+\s+/, "")
          .trim(),
      )
      .filter((l) => l.length > 6);

  if (lines.length > 1) {
    return lines.slice(0, maxItems).map((l) => clipParagraph(l, clipEach));
  }

  /* Frase única → partir em sentenças */
  const parts =
    s
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 8);

  return (parts.length ? parts : [s]).slice(0, maxItems).map((l) =>
    clipParagraph(l, clipEach),
  );
}

/** O que foi feito: só summary + razões curtas (sem previews / código). */
function buildWhatWasDoneSection(executorResult, changedFiles, maxBullets = 14) {
  const bullets = [];
  const execSummary =
    executorResult &&
    typeof executorResult.summary === "string" ?
      executorResult.summary.trim()
    : "";

  if (execSummary) {
    bullets.push(...summaryToBullets(execSummary, 10, 360));
  }

  for (const item of changedFiles) {
    if (!item || bullets.length >= maxBullets) break;

    const p = item.path;
    const reason =
      typeof item.reason === "string" ?
        clipParagraph(item.reason.replace(/```[\s\S]*?```/g, " … "), 260)
      : "";

    if (reason.length > 20) bullets.push(`${p}: ${reason}`);
  }

  let kept = bullets.filter((b) => !activityHistorySnippetLooksLikeLeak(b));

  if (kept.length === 0) {
    kept.push("(Sem resumo textual do executor neste run — consultar executor-result.json nos outputs.)");
  }

  return kept.slice(0, maxBullets).map((b) => `- ${b}`);
}

/** Impacto inferido só de excertos não-estruturados do architect (sem colar relatório inteiro). */
function buildArchitectImpactBullets(architectMd, changedCount) {
  const t = architectMd.trim();

  if (!t && changedCount === 0) return ["Sem alterações registadas via executor nesta execução."];

  const sectionRes =
    t.match(/^#{1,6}\s*Impact[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s+|$)/mi) ||

    t.match(/^#{1,6}\s*Motivo[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s+|$)/mi) ||

    t.match(/^#{1,6}\s*Objective[^\n]*\n+([\s\S]*?)(?=\n#{1,6}\s+|$)/mi);

  const chunk = sectionRes ? sectionRes[1] : "";

  let lines =
    chunk
      .split(/\n+/)
      .map((l) => l.replace(/^[-*+\d.]+\s+/, "").trim())
      .filter(
        (l) =>
          l.length > 12 &&
          !l.startsWith("```") &&
          !/^#{1,6}\s/.test(l) &&
          !activityHistorySnippetLooksLikeLeak(l),
      );


  if (lines.length < 2 && t.length) {
    lines =
      t
        .split(/\n+/)
      .slice(1, 8)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l.length > 12 &&
          !/^#{1,6}\s/.test(l) &&
          !activityHistorySnippetLooksLikeLeak(l),
      );


  }


  lines = [...new Set(lines)].slice(0, 8).map((l) => clipParagraph(l, 320));

  if (changedCount && !lines.some((l) => /alter|implement|mudan/i.test(l))) {
    lines.unshift(`${changedCount} arquivos alterados neste run (lista em executor-changes.json).`);

  }


  const out = lines.slice(0, 6).filter(Boolean);

  

  return out.length ? out.map((x) => `- ${x}`) : [`${changedCount} arquivos alterados (ver lista em Arquivos alterados).`];
}

function buildValidationSection(reviewOutput) {
  const status =
    typeof reviewOutput.status === "string" ? reviewOutput.status : "unknown";
  const level =
    typeof reviewOutput.acceptance_level === "string" ?
      reviewOutput.acceptance_level
    : "—";

  

  const sum = clipParagraph(String(reviewOutput.summary || ""), 420);

  const lines = [
    `- Review: \`${status}\``,
    `- Acceptance level: \`${level}\``,
    sum ? `- Resumo: ${sum}` : `- Resumo: _(vazio)._`,
  ];

  const warns =
    Array.isArray(reviewOutput.warnings)

      ?
        reviewOutput.warnings.filter(Boolean).slice(0, 3).map((w) => clipParagraph(w, 220))
      : [];

  warns.forEach((w, i) => lines.push(`- Warning (${i + 1}): ${w}`));

  return lines;

}

function activityHistoryHasRunId(existingMd, runId) {
  const id = String(runId || "").trim();

  if (!id) return false;

  const needle = `\`${id}\``;

  let fromHeading = 0;

  while (true) {
    const ix = existingMd.indexOf("### Run", fromHeading);

    if (ix === -1) break;

    const slice = existingMd.slice(ix, Math.min(existingMd.length, ix + 520));

    if (slice.includes(needle)) return true;

    fromHeading = ix + 7;
  }

  if (/Run\s+ID\s*:.*/i.test(existingMd) && existingMd.includes(needle)) return true;

  const lines = existingMd.split(/\r?\n/);

  

  return lines.some((ln) => {
    const t = ln.trim();

    return (
      (t.startsWith("`") && t.endsWith("`") && t === needle) ||

      (/^run\s+id\s*:/i.test(t) && t.includes(id))
    );

  });


}

function truncateActivityEntryIfNeeded(markdownBody, hardMax) {
  if (markdownBody.length <= hardMax) return markdownBody;

  


  let m = markdownBody;

  


  const note = `\n\n_(${`Entrada truncada automaticamente (> ${hardMax}c). Detalhes em outputs/<run>/`})_\n`;

  

  while (m.length > hardMax) {


    /* Encolher primeiro o bloco "O que foi feito", depois "Impacto". */

  

    let next =




      m.replace(/(### O que foi feito\n\n)((?:-.*\n?)+)/m, (all, hdr, bullets) => {



        const bl = bullets



          .trim()



          .split(/\n+/)



          .slice(0, -1)



          .join("\n");



        

        return bl.trim() ? `${hdr}${bl}\n` : `${hdr}${bullets}`;

  


      });


    

    if (next === m) {


      next =




        m.replace(/(### Impacto\n\n)((?:-.*\n?)+)/m, (_, hdr, bullets) => {



          const bl = bullets



            .trim()



            .split(/\n+/)



            .slice(0, -1)



            .join("\n");


          

          return `${hdr}${bl}\n`;

  

        });


    }


    

    if (next === m) {


      next =




        `${m.slice(0, hardMax - note.length)}${note}`;


    

      break;

  

    }



    m = next;

  

  }



  if (m.length > hardMax) m = `${m.slice(0, hardMax - 12).trim()}…`;


  


  return m;

}

function appendActivityHistory({ outputDir, metadata, reviewOutput }) {
  const status = reviewOutput.status || "unknown";

  if (status !== "approved") {
    throw new Error(
      "appendActivityHistory: só é permitido quando review.status === approved",
    );
  }

  const projectRoot = metadata.projectRoot;
  const iaDir = path.join(projectRoot, SOURCE_OF_TRUTH.projectIADirName);
  const activityHistoryPath = path.join(iaDir, "08-activity-history.md");

  ensureDir(iaDir);

  assertNotWritingGlobal(activityHistoryPath);
  assertInsideDir(activityHistoryPath, iaDir, "project/.IA");

  const taskContent = safeRead(path.join(outputDir, "task.md"));
  const architectMarkdown = safeRead(path.join(outputDir, "architect-output.md"));
  const changedFiles = readExecutorChanges(outputDir);
  const executorResult = readExecutorResultJson(outputDir);

  const runId = String(metadata.runId || path.basename(outputDir)).trim();
  const titleBase = extractTaskTitle(taskContent, metadata.taskArg);
  const headingTitle = clipParagraph(titleBase, 160);
  const date = new Date().toISOString().slice(0, 10);

  const objectivesText = buildTaskObjectiveShort(taskContent, headingTitle);

  

  const filesChangedLines =
    changedFiles.length > 0 ?
      changedFiles



        .map((item) =>
          typeof item?.path === "string" ?
            `- \`${item.path.replace(/`/g, "'").trim()}\``


          : null,


        )



        .filter(Boolean)


    : ["- _(Nenhum arquivo em executor-changes.json — ver outputs do run)._"];

  

  

  const whatDoneLines =




    buildWhatWasDoneSection(executorResult, changedFiles);



  

  const impactLines =




    buildArchitectImpactBullets(architectMarkdown, changedFiles.length);


  

  const validationLines =




    buildValidationSection(reviewOutput);


  

  

  let entryBody =




    `





---






## ${date} — ${headingTitle}






### Objetivo







${objectivesText}






### Arquivos alterados







${filesChangedLines.join("\n")}






### O que foi feito







${whatDoneLines.join("\n")}






### Impacto







${impactLines.join("\n")}






### Validação







${validationLines.join("\n")}






### Run





\`${runId}\`



`;

  

  entryBody = truncateActivityEntryIfNeeded(entryBody.trim() + "\n", MAX_ACTIVITY_ENTRY_CHARS);

  let leakLevel = classifyActivityHistoryLeak(entryBody);

  if (leakLevel === "HARD") {
    console.warn(
      "[ActivityHistory] HARD leak detectado. Entrada descartada.",
      runId,
    );

    return null;
  }

  const objectiveFallbackShort = clipParagraph(
    `${headingTitle}: resumo curto apenas; relatórios em outputs/${runId}/.`,
    560,
  );

  const minimalFallbackCtx = {
    date,
    headingTitle,
    filesChangedJoin: filesChangedLines.join("\n"),
    reviewOutput,
    runId,
  };

  if (leakLevel === "SOFT") {
    console.warn(
      "[ActivityHistory] SOFT leak detectado. Tentando sanitização.",
      runId,
    );

    const sanOut = sanitizeActivityHistoryEntryUntilClean(
      entryBody,
      objectiveFallbackShort,
      { runId },
    );

    if (sanOut.status === "hard_leak") {
      console.warn(
        "[ActivityHistory] HARD leak detectado. Entrada descartada.",
        runId,
      );

      return null;
    }

    if (sanOut.status === "clean") {
      entryBody = sanOut.entryBody;

    }


    else if (sanOut.status === "fallback_required") {
      const fb =
        finalizeActivityHistoryWithMinimalFallbackOrNull(minimalFallbackCtx);

      if (!fb) return null;

      entryBody = fb;
    }

  }



  leakLevel = classifyActivityHistoryLeak(entryBody);

  if (leakLevel === "HARD") {
    console.warn(
      "[ActivityHistory] HARD leak detectado. Entrada descartada.",
      runId,
    );

    return null;
  }

  if (leakLevel !== "NONE") {
    const fb =
      finalizeActivityHistoryWithMinimalFallbackOrNull(minimalFallbackCtx);

    if (!fb) return null;

    entryBody = fb;
  }

  if (classifyActivityHistoryLeak(entryBody) !== "NONE") {
    console.warn(
      "[ActivityHistory] Fallback mínimo também contém leak. Entrada descartada.",
      runId,
    );

    return null;
  }

  


  let existing = "";

  


  if (fs.existsSync(activityHistoryPath)) {


    existing = fs.readFileSync(activityHistoryPath, "utf-8");

  

  }

  


  if (activityHistoryHasRunId(existing, runId)) {


    return activityHistoryPath;

  

  }

  


  if (!fs.existsSync(activityHistoryPath)) {


    fs.writeFileSync(


      activityHistoryPath,


      "# Activity History\n\nMemória resumida de atividades aprovadas. Detalhes completos em `outputs/<run-id>/`.\n",


      "utf-8",


    );

  

  }

  


  fs.appendFileSync(activityHistoryPath, `\n${entryBody}`, "utf-8");

  


  return activityHistoryPath;
}

async function main() {
  const outputDir = path.isAbsolute(outputArg)
    ? outputArg
    : path.join(SOURCE_OF_TRUTH.outputsDir, outputArg);

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const taskPath = path.join(outputDir, "task.md");
  const architectPath = path.join(outputDir, "architect-output.md");
  const executorPath = path.join(outputDir, "executor-output.md");
  const reviewMarkdownPath = path.join(outputDir, "review-output.md");
  const reviewJsonPath = path.join(outputDir, "review-output.json");

  const knowledgeAgentPath = path.join(ROOT_DIR, "agents", "knowledge.md");

  ensureFile(metadataPath, "metadata.json");
  ensureFile(taskPath, "task.md");
  ensureFile(architectPath, "architect-output.md");
  ensureFile(executorPath, "executor-output.md");
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
  const projectIADir = resolveProjectIADir(metadata);
  const projectRoot = metadata.projectRoot;
  const projectName = metadata.projectName || path.basename(projectRoot);

  ensureDir(projectSetupDir);

  const projectKnowledgeBasePath = path.join(
    projectSetupDir,
    "knowledge-base.md"
  );

  assertNotWritingGlobal(projectKnowledgeBasePath);
  assertInsideDir(projectKnowledgeBasePath, projectSetupDir, "project/.setup-boss");

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

  const parsedReviewOutput = fs.existsSync(reviewJsonPath)
    ? readJson(reviewJsonPath)
    : {
        status: "unknown",
        summary: reviewOutput,
        blocking_issues: [],
        warnings: [],
      };

  if (parsedReviewOutput.status !== "approved") {
    console.log(
      "❌ Knowledge + enriquecimento .IA esperam review com status approved.",
    );
    console.log(`Status atual: ${parsedReviewOutput.status || "unknown"}`);
    process.exit(1);
  }

  const fullPrompt = `${knowledgeAgent}

## SOURCE OF TRUTH HIERARCHY

setup-boss/context = verdade global do sistema
setup-boss/docs = documentação operacional
project/.setup-boss = verdade técnica local do pipeline
project/.IA = verdade semântica local do projeto
outputs/<run-id> = histórico da execução

## NON-NEGOTIABLE KNOWLEDGE RULES

- Gere atualização apenas para o knowledge técnico local do projeto.
- O destino permitido é somente project/.setup-boss/knowledge-base.md.
- Não gere conteúdo para alterar setup-boss/context.
- Não misture knowledge global com knowledge local.
- Use setup-boss/context apenas como referência global do sistema.
- Use setup-boss/docs apenas como documentação operacional, não como fonte de decisão.
- Registre apenas decisões e padrões reutilizáveis do projeto.
- Não registre passo a passo da execução.
- Não trate outputs/<run-id> como fonte de verdade permanente.
- O histórico operacional resumido será registrado separadamente em project/.IA/08-activity-history.md.

${globalContext}

## OPERATIONAL DOCUMENTATION - NON AUTHORITATIVE
${operationalDocs}

## PROJECT TARGET
Projeto: ${projectName}
Caminho: ${projectRoot}
IA Dir: ${projectIADir}

## CURRENT PROJECT KNOWLEDGE
${currentProjectKnowledge}

## TASK
${read(taskPath)}

## PLANO / ARCHITECT OUTPUT
${read(architectPath)}

## EXECUÇÃO / EXECUTOR OUTPUT
${read(executorPath)}

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

  const activityHistoryPath = appendActivityHistory({
    outputDir,
    metadata,
    reviewOutput: parsedReviewOutput,
  });

  const iaEnrichment = await enrichIAAfterApprovedRun({
    projectRoot,
    outputDir,
    metadata,
    reviewOutput: parsedReviewOutput,
  });

  console.log("✅ Knowledge update gerado:");
  console.log(path.relative(ROOT_DIR, knowledgeUpdatePath));

  console.log("\n✅ Project knowledge base atualizada:");
  console.log(projectKnowledgeBasePath);

  if (activityHistoryPath) {
    console.log("\n✅ Activity history atualizado:");
    console.log(activityHistoryPath);
  } else {
    console.log("\n⚠️ Activity history: entrada não registada (HARD leak ou validação falhou).");
    console.log(
      path.join(
        metadata.projectRoot,
        SOURCE_OF_TRUTH.projectIADirName,
        "08-activity-history.md",
      ),
    );
  }

  if (iaEnrichment.skipped) {
    console.log(
      "\n⚠️ Enriquecimento .IA omitido:",
      iaEnrichment.reason || "desconhecido",
    );
  } else {
    console.log("\n✅ .IA: fact blocks aplicados onde necessário.");

    if (Array.isArray(iaEnrichment.deterministic_updates) && iaEnrichment.deterministic_updates.length) {
      console.log(`   Determinístico: ${iaEnrichment.deterministic_updates.join(", ")}`);
    }

    if (
      Array.isArray(iaEnrichment.semantic_updates) &&
      iaEnrichment.semantic_updates.length
    ) {
      console.log(`   IA semântica: ${iaEnrichment.semantic_updates.join(", ")}`);
    }

    if (iaEnrichment.semantic_skipped_reason) {
      console.log(
        `   ⚠️ Passagem LLM semântica omitida (${iaEnrichment.semantic_skipped_reason}).`,
      );
    }
  }

  console.log("\n🔒 Knowledge global preservado:");
  console.log(SOURCE_OF_TRUTH.globalContextDir);
}

main().catch((err) => {
  console.error("❌ Erro ao gerar Knowledge Update:");
  console.error(err.message || err);
  process.exit(1);
});