const path = require("path");

function normalizeRelativePath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .trim();
}

function uniqueNormalizedPaths(paths) {
  return [
    ...new Set(
      (Array.isArray(paths) ? paths : [])
        .map(normalizeRelativePath)
        .filter(Boolean)
    ),
  ];
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
    absolutePath,
  };
}

function compactText(value, maxLength) {
  const text = String(value || "").trim();

  if (!maxLength || text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1).trim()}…`;
}

/**
 * Extração de seção Markdown H2 (regex, case-insensitive) — uso em prompts / snippets.
 */
function extractSection(content, sectionTitle) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `## ${escaped}\\s*([\\s\\S]*?)(?=\\n## |$)`,
    "i"
  );

  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Corpo entre `## Título` e a próxima linha `\n## ` — aligned a validate-architect (enforcement estrutural).
 */
function extractSectionBodyAtMarkdownH2(content, sectionTitle) {
  const marker = `## ${sectionTitle}`;
  const idx = content.indexOf(marker);

  if (idx === -1) {
    return "";
  }

  let bodyStart = content.indexOf("\n", idx);
  if (bodyStart === -1) {
    return "";
  }

  bodyStart += 1;

  const nextIdx = content.indexOf("\n## ", bodyStart);

  if (nextIdx === -1) {
    return content.slice(bodyStart).trim();
  }

  return content.slice(bodyStart, nextIdx).trim();
}

const NO_OP_SUMMARY_MARKERS = [
  "already",
  "already implemented",
  "no changes needed",
  "já existe",
  "já implementado",
  "já está implementado",
  "sem alterações necessárias",
  "nenhuma alteração necessária",
  "nenhuma alteração",
  "already present",
];

function summaryDeclaresNoOpImplementation(summary) {
  const text = String(summary || "").toLowerCase();
  return NO_OP_SUMMARY_MARKERS.some((needle) =>
    text.includes(needle.toLowerCase())
  );
}

function isConcreteNoOpEvidence(evidence) {
  const terms = [
    "contém",
    "contains",
    "includes",
    "placeholder",
    "value=",
    "onChange",
    "filter",
    "map",
    "useState",
    "search",
    "busca",
    "contador",
    "caracteres",
  ];

  let hasLongItem = false;
  let hasFileExtensionRef = false;
  let hasContentTerm = false;

  if (!Array.isArray(evidence)) return false;

  for (const raw of evidence) {
    const line = String(raw ?? "").trim();

    if (!line) continue;

    const lower = line.toLowerCase();

    if (line.length > 20) hasLongItem = true;
    if (/\.(tsx|ts|jsx|js|md)/i.test(line)) hasFileExtensionRef = true;
    if (terms.some((t) => lower.includes(t.toLowerCase()))) hasContentTerm = true;

    if (hasLongItem && hasFileExtensionRef && hasContentTerm) return true;
  }

  return false;
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
    throw new Error(
      "TASK_INVALID: exatamente um Acceptance Level deve ser selecionado"
    );
  }
}

function isUsableRunContext(runContext) {
  if (!runContext || typeof runContext !== "object") return false;

  const allowedFiles =
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
      ? runContext.execution_context.allowed_files
      : runContext.architect &&
          Array.isArray(runContext.architect.allowed_files)
        ? runContext.architect.allowed_files
        : [];

  return allowedFiles.length > 0;
}

function isUsableRunContextStrict(runContext) {
  if (!runContext || typeof runContext !== "object") return false;

  const allowedFiles =
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
      ? runContext.execution_context.allowed_files
      : runContext.architect &&
          Array.isArray(runContext.architect.allowed_files)
        ? runContext.architect.allowed_files
        : [];

  return (
    allowedFiles.length > 0 &&
    runContext.task &&
    typeof runContext.task === "object"
  );
}

function getAllowedFilesFromRunContext(runContext, opts = {}) {
  const uniq = opts.uniqueNormalized === true;

  if (!runContext || typeof runContext !== "object") {
    return [];
  }

  let raw;

  if (
    runContext.execution_context &&
    Array.isArray(runContext.execution_context.allowed_files)
  ) {
    raw = runContext.execution_context.allowed_files;
  } else if (
    runContext.architect &&
    Array.isArray(runContext.architect.allowed_files)
  ) {
    raw = runContext.architect.allowed_files;
  } else {
    raw = [];
  }

  const mapped = raw.map(normalizeRelativePath).filter(Boolean);

  return uniq ? uniqueNormalizedPaths(raw) : mapped;
}

function buildCompactRunContextForPrompt(runContext, opts = {}) {
  const { buildCompactRunContextString, safeCompactWhitespace } = require("./runtime/context-builder");

  let out = buildCompactRunContextString(runContext, opts);

  if (opts.safeWhitespaceCompact === true) {
    out = safeCompactWhitespace(out);
  }

  return out.endsWith("\n") ? out.slice(0, -1) : out;
}

module.exports = {
  normalizeRelativePath,
  uniqueNormalizedPaths,
  assertSafeProjectPath,
  compactText,
  extractSection,
  extractSectionBodyAtMarkdownH2,
  NO_OP_SUMMARY_MARKERS,
  summaryDeclaresNoOpImplementation,
  isConcreteNoOpEvidence,
  validateTask,
  isUsableRunContext,
  isUsableRunContextStrict,
  getAllowedFilesFromRunContext,
  buildCompactRunContextForPrompt,
};
