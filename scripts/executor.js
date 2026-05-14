const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const { loadAgent } = require("../core/agent-metadata");
const { createLLMClient, getModelForStep } = require("../core/llm-client");
const { recordLLMUsage } = require("../core/llm-usage");
const { resolveOutputDir } = require("../core/run-resolver");
const { writePromptSizeRecord } = require("../core/prompt-sizes");
const { appendProblemHistoryEntry } = require("../core/problem-history");
const {
  normalizeRelativePath,
  uniqueNormalizedPaths,
  assertSafeProjectPath,
  compactText,
  extractSection,
  summaryDeclaresNoOpImplementation,
  isConcreteNoOpEvidence,
  isUsableRunContext,
  getAllowedFilesFromRunContext,
  buildCompactRunContextForPrompt,
} = require("./shared-utils");
const { createStageContextFromOutputDir } = require("./runtime/runtime-context");
const { createOutputFs } = require("./runtime/output-fs");
const {
  readProjectUtf8,
  mergeDryRunOverlayFromMap,
} = require("./runtime/virtual-file-state");

const {
  classifyPrimaryReference,
  buildClassificationSets,
  isPrimaryLikePath,
} = require("./runtime/context-router");
const { withOpenAIResponsesRetry } = require("./runtime/recovery/provider-retry");

const {
  resolveHybridPatchStep,
  writeHybridExecutionArtifacts,
} = require("./hybrid-executor/hybrid-executor-core");
const {
  isHybridExecutionApplyActive,
  isControlledStructuralApplyActive,
  isStructuralReplayFoundationEnabled,
  isStructuralIdempotencyEnabled,
} = require("./hybrid-executor/feature-flags");
const {
  computeSpanContentSha256,
  computeWholeFileSha256,
} = require("./hybrid-executor/replay/structural-fingerprint");
const { buildBeforeExcerptForIdempotency } = require("./hybrid-executor/replay/structural-idempotency");
const {
  runControlledStructuralApply,
  createStructuralApplySession,
  writeStructuralApplyArtifacts,
} = require("./hybrid-executor/structural/structural-apply-engine");

const { applyPatchToContent } = require("./patch-content");

const ROOT_DIR = path.resolve(__dirname, "..");

const client = createLLMClient();

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
        required: ["operation", "path", "search", "replace", "reason"],
        properties: {
          operation: {
            type: "string",
            enum: ["patch"]
          },
          path: {
            type: "string"
          },
          search: {
            type: "string"
          },
          replace: {
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

const MAX_CONTEXT_SNIPPET_SIZE = Number(
  process.env.EXECUTOR_CONTEXT_SNIPPET_SIZE || 6000
);

const MAX_PREVIEW_SIZE = Number(
  process.env.EXECUTOR_CHANGE_PREVIEW_SIZE || 1200
);

const MAX_LEGACY_SCAN_CHARS = Number(
  process.env.EXECUTOR_LEGACY_SCAN_CHARS || 6000
);

const MAX_LEGACY_ARCHITECT_CHARS = Number(
  process.env.EXECUTOR_LEGACY_ARCHITECT_CHARS || 6000
);

const MAX_LEGACY_TASK_CHARS = Number(
  process.env.EXECUTOR_LEGACY_TASK_CHARS || 4000
);

const EXECUTOR_TARGETED_SNIPPETS_MAX = (() => {
  const raw = process.env.EXECUTOR_TARGETED_SNIPPETS_MAX;
  if (raw === undefined || raw === "") return 4;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 4;
})();

const EXECUTOR_TARGETED_SNIPPET_WINDOW = (() => {
  const raw = process.env.EXECUTOR_TARGETED_SNIPPET_WINDOW;
  if (raw === undefined || raw === "") return 1200;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1200;
})();

const EXECUTOR_REFERENCE_SNIPPET_RATIO = (() => {
  const raw = process.env.EXECUTOR_REFERENCE_SNIPPET_RATIO;
  if (raw === undefined || raw === "") return 0.45;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.15, n)) : 0.45;
})();

const EXECUTOR_REFERENCE_SNIPPET_MIN = (() => {
  const raw = process.env.EXECUTOR_REFERENCE_SNIPPET_MIN_CHARS;
  if (raw === undefined || raw === "") return 1200;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1200;
})();

const EXECUTOR_REFERENCE_TARGETED_MAX = (() => {
  const raw = process.env.EXECUTOR_REFERENCE_TARGETED_MAX;
  if (raw === undefined || raw === "") return 2;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 2;
})();

const EXECUTOR_REFERENCE_WINDOW_RATIO = (() => {
  const raw = process.env.EXECUTOR_REFERENCE_WINDOW_RATIO;
  if (raw === undefined || raw === "") return 0.65;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0.25, n)) : 0.65;
})();

const CONTEXT_KEYWORD_STOPWORDS = new Set([
  "para",
  "com",
  "uma",
  "dos",
  "das",
  "que",
  "deve",
  "quando",
  "user",
  "usuário",
  "sistema",
  "projeto",
  "alterar",
  "arquivo",
  "task",
  "criteria",
  "acceptance",
  "development",
]);

const MAX_CONTEXT_KEYWORDS = 48;

/**
 * Palavras-âncora leves para aumentar cobertura da região de render/JSX
 * (complementam keywords extraídas da task; não substituem).
 */
const EXECUTOR_JSX_ANCHOR_KEYWORDS = [
  "return",
  "map(",
  "filter(",
  "length",
  "placeholder",
  "input",
  "textarea",
];

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

function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
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

/** Heurística leve: primeiros bytes com \\x00 → tratar como binário. */
function fileHeadLooksBinary(absolutePath) {
  let fd;

  try {
    fd = fs.openSync(absolutePath, "r");
    const buf = Buffer.allocUnsafe(512);
    const n = fs.readSync(fd, buf, 0, 512, 0);

    for (let j = 0; j < n; j++) {
      if (buf[j] === 0) return true;
    }

    return false;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (_) {
        /* noop */
      }
    }
  }
}

/**
 * Pré-validação explícita de patches antes do compute/commit (Fase 1.3).
 * Falha antes de applyChanges — zero writes no disco quando rejeita.
 */
function validatePatchSet(projectRoot, allowedFiles, changes) {
  if (!Array.isArray(changes) || changes.length === 0) return;

  const allowedSet = new Set(allowedFiles.map(normalizeRelativePath));
  const seenPatchKeys = new Set();
  const physicalCheckedAbs = new Set();

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const relativePath = normalizeRelativePath(change.path);

    if (change.operation !== "patch") {
      throw new Error(
        `changes[${i}] ${relativePath || "(path ausente)"}: operação inválida — ${change.operation}`
      );
    }

    if (!relativePath) {
      throw new Error(`changes[${i}]: path vazio ou inválido após normalização`);
    }

    if (!allowedSet.has(relativePath)) {
      throw new Error(
        `changes[${i}] ${relativePath}: Executor tentou alterar arquivo fora do escopo`
      );
    }

    let safe;

    try {
      safe = assertSafeProjectPath(projectRoot, relativePath);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(`changes[${i}] ${relativePath}: ${msg}`);
    }

    const search = change.search;
    const replace = change.replace;

    if (search === "" || search == null) {
      throw new Error(
        `changes[${i}] ${relativePath}: patch com search vazio (inválido)`
      );
    }

    if (search === replace) {
      throw new Error(
        `Patch no-op detectado em changes[${i}] para ${relativePath}: replace é idêntico ao search`
      );
    }

    const dedupeKey = JSON.stringify([relativePath, search, replace]);

    if (seenPatchKeys.has(dedupeKey)) {
      throw new Error(
        `Patch duplicado detectado em changes[${i}] para ${relativePath}: mesmo path, search e replace que um patch anterior`
      );
    }

    seenPatchKeys.add(dedupeKey);

    if (!fs.existsSync(safe.absolutePath)) {
      throw new Error(
        `changes[${i}] ${relativePath}: arquivo alvo do patch não existe`
      );
    }

    if (!physicalCheckedAbs.has(safe.absolutePath)) {
      let lst;

      try {
        lst = fs.lstatSync(safe.absolutePath);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        throw new Error(
          `changes[${i}] ${relativePath}: falha ao inspecionar o caminho — ${msg}`
        );
      }

      if (lst.isSymbolicLink()) {
        throw new Error(
          `changes[${i}] ${relativePath}: caminho é symlink (bloqueado — patch não permitido)`
        );
      }

      if (lst.isDirectory()) {
        throw new Error(
          `changes[${i}] ${relativePath}: alvo é diretório, não ficheiro`
        );
      }

      if (fileHeadLooksBinary(safe.absolutePath)) {
        throw new Error(
          `changes[${i}] ${relativePath}: arquivo parece binário (byte nulo nos primeiros bytes examinados)`
        );
      }

      physicalCheckedAbs.add(safe.absolutePath);
    }
  }
}

function createContextSnippet(content, maxSize = MAX_CONTEXT_SNIPPET_SIZE) {
  if (!content) return "";

  if (content.length <= maxSize) {
    return content;
  }

  const headSize = Math.floor(maxSize * 0.55);
  const tailSize = maxSize - headSize;

  return [
    content.slice(0, headSize),
    "",
    `/* ... conteúdo omitido para reduzir tokens (${content.length} chars totais) ... */`,
    "",
    content.slice(-tailSize)
  ].join("\n");
}

function hashSnippetParams(s) {
  return crypto
    .createHash("sha256")
    .update(String(s), "utf8")
    .digest("hex")
    .slice(0, 16);
}

function resolvePersistedFileClassification(hasUsableRunContext, runContext, allowedFiles) {
  const ec =
    hasUsableRunContext &&
    runContext &&
    runContext.execution_context &&
    typeof runContext.execution_context === "object"
      ? runContext.execution_context
      : null;

  if (
    ec &&
    Array.isArray(ec.primary_files) &&
    ec.primary_files.some((x) => String(x || "").trim())
  ) {
    return {
      primary_files: uniqueNormalizedPaths(ec.primary_files),
      reference_files: uniqueNormalizedPaths(ec.reference_files || []),
      source: ec.file_classification_source || "persisted",
    };
  }

  return classifyPrimaryReference(allowedFiles, null);
}

function pathsFromAppliedChangesJson(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => normalizeRelativePath(c?.path)).filter(Boolean);
}

/** null = rebuild completo; Set = apenas esses paths forçam novo snippet quando cache falha */
function inferExecutorRebuildPaths(correctionMd, appliedPaths, allowedFiles) {
  const allowed = uniqueNormalizedPaths(allowedFiles);
  const allowedSet = new Set(allowed);
  const out = new Set();

  for (const p of appliedPaths) {
    const n = normalizeRelativePath(p);
    if (allowedSet.has(n)) out.add(n);
  }

  const corr = String(correctionMd || "").trim();
  if (!corr) {
    return null;
  }

  for (const p of allowed) {
    if (corr.includes(p)) out.add(p);
  }

  if (out.size === 0) {
    return null;
  }

  return out;
}

function extractContextKeywords(text) {
  if (!text || typeof text !== "string") return [];

  const TOKEN_RE = /[\p{L}_][\p{L}\p{N}_]*/gu;
  const seen = new Set();
  const out = [];
  let m;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    if (raw.length < 4) continue;
    const lower = raw.toLowerCase();
    if (CONTEXT_KEYWORD_STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(raw);
    if (out.length >= MAX_CONTEXT_KEYWORDS) break;
  }

  return out;
}

/**
 * Junta keywords da task com âncoras JSX fixas, sem duplicar (case-insensitive).
 */
function mergeExecutorSnippetKeywords(keywords) {
  const merged = [];
  const seen = new Set();

  const push = (raw) => {
    const kw = String(raw || "").trim();
    if (kw.length < 2) return;
    const low = kw.toLowerCase();
    if (seen.has(low)) return;
    seen.add(low);
    merged.push(kw);
  };

  for (const k of keywords || []) push(k);
  for (const k of EXECUTOR_JSX_ANCHOR_KEYWORDS) push(k);

  return merged;
}

function createTargetedSnippets(content, keywords, maxSnippets, windowSize) {
  if (
    !content ||
    maxSnippets <= 0 ||
    windowSize <= 0 ||
    !keywords ||
    keywords.length === 0
  ) {
    return [];
  }

  const effectiveKeywords = mergeExecutorSnippetKeywords(keywords);
  if (!effectiveKeywords.length) return [];

  const lowerContent = content.toLowerCase();
  const candidates = [];

  for (const keyword of effectiveKeywords) {
    const kw = String(keyword || "").trim();
    if (kw.length < 2) continue;
    const kn = kw.toLowerCase();
    let pos = 0;

    while (pos < content.length) {
      const idx = lowerContent.indexOf(kn, pos);
      if (idx === -1) break;

      const matchEnd = idx + kw.length;
      const matchLen = matchEnd - idx;
      const pad = Math.max(0, windowSize - matchLen);
      const left = Math.floor(pad / 2);
      const right = pad - left;
      const start = Math.max(0, idx - left);
      const end = Math.min(content.length, matchEnd + right);

      candidates.push({ keyword: kw, start, end, idx });
      pos = idx + kw.length;
    }
  }

  candidates.sort((a, b) => a.idx - b.idx || a.start - b.start);

  const halfIdx = Math.floor(content.length / 2);
  const chosen = [];
  const usedKeywordLower = new Set();

  const overlapsChosen = (start, end) =>
    chosen.some((ch) => !(end <= ch.start || start >= ch.end));

  for (const c of candidates) {
    if (chosen.length >= maxSnippets) break;
    const kwLow = String(c.keyword || "").toLowerCase();
    if (usedKeywordLower.has(kwLow)) continue;
    if (overlapsChosen(c.start, c.end)) continue;
    usedKeywordLower.add(kwLow);
    chosen.push({
      keyword: c.keyword,
      start: c.start,
      end: c.end,
      idx: c.idx,
      snippet: content.slice(c.start, c.end),
    });
  }

  if (maxSnippets >= 4 && chosen.length === maxSnippets) {
    const firstHalfCount = chosen.filter((ch) => ch.idx < halfIdx).length;
    const lastCh = chosen[chosen.length - 1];
    if (firstHalfCount >= 3 && lastCh.idx < halfIdx) {
      const last = chosen.pop();
      usedKeywordLower.delete(String(last.keyword).toLowerCase());

      const overlapsExceptLast = (start, end) =>
        chosen.some((ch) => !(end <= ch.start || start >= ch.end));

      let replacement = null;
      for (const c of candidates) {
        if (c.idx < halfIdx) continue;
        const kwLow = String(c.keyword || "").toLowerCase();
        if (usedKeywordLower.has(kwLow)) continue;
        if (overlapsExceptLast(c.start, c.end)) continue;
        replacement = c;
        break;
      }

      if (replacement) {
        usedKeywordLower.add(String(replacement.keyword).toLowerCase());
        chosen.push({
          keyword: replacement.keyword,
          start: replacement.start,
          end: replacement.end,
          idx: replacement.idx,
          snippet: content.slice(replacement.start, replacement.end),
        });
      } else {
        usedKeywordLower.add(String(last.keyword).toLowerCase());
        chosen.push(last);
      }
    }
  }

  return chosen.map(({ keyword, start, end, snippet }) => ({
    keyword,
    start,
    end,
    snippet,
  }));
}

function formatTargetedSnippetsForPrompt(targetedSnippets) {
  if (!targetedSnippets || !targetedSnippets.length) return "";

  const lines = ["", "Targeted snippets:"];

  targetedSnippets.forEach((ts, i) => {
    const n = i + 1;
    lines.push(`[${n}] keyword=${ts.keyword} range=${ts.start}-${ts.end}`);
    lines.push(`--- targeted snippet ${n} ---`);
    lines.push(ts.snippet);
    lines.push(`--- end targeted snippet ${n} ---`);
  });

  return lines.join("\n");
}

function collectExecutorKeywordSourceTexts({
  hasUsableRunContext,
  runContext,
  correction,
  task,
  architect,
}) {
  const parts = [];

  if (correction && String(correction).trim()) {
    parts.push(correction);
  }

  if (hasUsableRunContext && runContext && typeof runContext === "object") {
    const t = runContext.task;
    if (t && t.summary) parts.push(String(t.summary));
    if (Array.isArray(t && t.acceptance_criteria)) {
      parts.push(t.acceptance_criteria.map(String).join("\n"));
    }
    const arch = runContext.architect;
    if (arch && arch.plan_summary) {
      parts.push(String(arch.plan_summary));
    }
  } else {
    if (task && String(task).trim()) parts.push(task);
    if (architect && String(architect).trim()) parts.push(architect);
  }

  return parts;
}

function readAllowedProjectFiles(
  projectRoot,
  allowedFiles,
  contextKeywords,
  economy = {},
) {
  const keywords = Array.isArray(contextKeywords) ? contextKeywords : [];
  const sets = economy.classificationSets;
  const snippetCache = economy.snippetCache;
  const telemetry = economy.telemetry;
  const rebuildPaths = economy.rebuildPaths;

  const kwDigest =
    keywords.length > 0 ? hashSnippetParams(keywords.join("\0")) : "no_kw";

  let reused = 0;
  let rebuilt = 0;

  const rows = allowedFiles.map((filePath) => {
    const safe = assertSafeProjectPath(projectRoot, filePath);
    const rel = safe.relativePath;
    const exists = fs.existsSync(safe.absolutePath);

    if (!exists) {
      return {
        path: rel,
        exists: false,
        is_directory: false,
        size: 0,
        snippet: "",
        targeted_snippets: [],
      };
    }

    let stat;

    try {
      stat = fs.statSync(safe.absolutePath);
    } catch (_) {
      return {
        path: rel,
        exists: false,
        is_directory: false,
        size: 0,
        snippet: "",
        targeted_snippets: [],
      };
    }

    if (stat.isDirectory()) {
      return {
        path: rel,
        exists: true,
        is_directory: true,
        size: 0,
        snippet: "[blocked: allowed_files entry is a directory]",
        targeted_snippets: [],
      };
    }

    const primaryLike = !sets || isPrimaryLikePath(rel, sets);

    const tuning =
      economy.snippetTuning && typeof economy.snippetTuning === "object"
        ? economy.snippetTuning
        : {};
    const winMul =
      typeof tuning.windowMultiplier === "number" ? tuning.windowMultiplier : 1;
    const snipMul =
      typeof tuning.snippetMultiplier === "number"
        ? tuning.snippetMultiplier
        : 1;
    const targAdd = Number.isFinite(tuning.targetedExtra) ? tuning.targetedExtra : 0;
    const tightenFactor =
      typeof tuning.tightenWindowFactor === "number"
        ? tuning.tightenWindowFactor
        : 1;

    const baseSnippetMax = primaryLike
      ? MAX_CONTEXT_SNIPPET_SIZE
      : Math.max(
          EXECUTOR_REFERENCE_SNIPPET_MIN,
          Math.floor(MAX_CONTEXT_SNIPPET_SIZE * EXECUTOR_REFERENCE_SNIPPET_RATIO),
        );

    const baseTargetedMax = primaryLike
      ? EXECUTOR_TARGETED_SNIPPETS_MAX
      : Math.max(1, EXECUTOR_REFERENCE_TARGETED_MAX);

    const baseWindow = primaryLike
      ? EXECUTOR_TARGETED_SNIPPET_WINDOW
      : Math.max(
          320,
          Math.floor(EXECUTOR_TARGETED_SNIPPET_WINDOW * EXECUTOR_REFERENCE_WINDOW_RATIO),
        );

    const snippetMax = Math.max(
      400,
      Math.min(80_000, Math.floor(baseSnippetMax * snipMul)),
    );
    const targetedMax = Math.max(1, baseTargetedMax + targAdd);
    const windowSize = Math.max(
      200,
      Math.min(24_000, Math.floor(baseWindow * winMul * tightenFactor)),
    );

    const useTargeted =
      keywords.length > 0 && targetedMax > 0 && windowSize > 0;

    const overlay =
      economy.virtualOverlay && typeof economy.virtualOverlay === "object"
        ? economy.virtualOverlay
        : null;
    const fsRead =
      economy.readFileUtf8 || ((p) => fs.readFileSync(p, "utf-8"));
    const content = overlay
      ? readProjectUtf8(projectRoot, rel, overlay)
      : fsRead(safe.absolutePath);
    const contentHash = crypto
      .createHash("sha256")
      .update(content, "utf8")
      .digest("hex");

    const cacheKey = [
      rel,
      contentHash,
      snippetMax,
      targetedMax,
      windowSize,
      kwDigest,
      primaryLike ? "P" : "R",
    ].join("|");

    const mustRebuild =
      rebuildPaths == null || (rebuildPaths instanceof Set && rebuildPaths.has(rel));

    if (
      snippetCache &&
      !mustRebuild
    ) {
      const cached = snippetCache.get(cacheKey);
      if (
        cached &&
        cached.contentHash === contentHash &&
        cached.snippet !== undefined &&
        Array.isArray(cached.targeted_snippets)
      ) {
        reused += 1;
        snippetCache.notify("hit", { path: rel });
        return {
          path: rel,
          exists: true,
          is_directory: false,
          size: content.length,
          snippet: cached.snippet,
          targeted_snippets: cached.targeted_snippets,
        };
      }
    }

    if (snippetCache) {
      snippetCache.notify("miss", { path: rel, rebuild: Boolean(mustRebuild) });
    }
    rebuilt += 1;

    const targeted_snippets = useTargeted
      ? createTargetedSnippets(content, keywords, targetedMax, windowSize)
      : [];

    const snippet = createContextSnippet(content, snippetMax);

    if (snippetCache) {
      snippetCache.set(cacheKey, {
        contentHash,
        snippet,
        targeted_snippets,
      });
    }

    return {
      path: rel,
      exists: true,
      is_directory: false,
      size: content.length,
      snippet,
      targeted_snippets,
    };
  });

  economy._snippetStats = { reused, rebuilt, delta_paths: rebuildPaths };
  return rows;
}

function createPreviewAround(content, needle) {
  if (!content) return "";

  const safeNeedle = String(needle || "");

  if (!safeNeedle) {
    return content.slice(0, MAX_PREVIEW_SIZE);
  }

  const index = content.indexOf(safeNeedle);

  if (index === -1) {
    return content.slice(0, MAX_PREVIEW_SIZE);
  }

  const half = Math.floor(MAX_PREVIEW_SIZE / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(content.length, index + safeNeedle.length + half);

  return content.slice(start, end);
}

function applyChanges(projectRoot, allowedFiles, changes, opts = {}) {
  const dryRun = opts.dryRun === true;
  const overlay =
    opts.overlay && typeof opts.overlay === "object" ? opts.overlay : null;
  const hybridTelemetryOut =
    opts.hybridExecution === true &&
    isHybridExecutionApplyActive() &&
    Array.isArray(opts.hybridTelemetryOut)
      ? opts.hybridTelemetryOut
      : null;

  const allowedSet = new Set(allowedFiles.map(normalizeRelativePath));
  const applied = [];
  const originalByPath = new Map();
  const currentByPath = new Map();

  // Fase 1 — COMPUTE: validar e aplicar patches só em memória (nenhum write).
  const patchOrdinalByPath = new Map();

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const relativePath = normalizeRelativePath(change.path);

    if (!allowedSet.has(relativePath)) {
      throw new Error(
        `changes[${i}] ${relativePath}: Executor tentou alterar arquivo fora do escopo`
      );
    }

    if (change.operation !== "patch") {
      throw new Error(
        `changes[${i}] ${relativePath}: operação inválida no executor — ${change.operation}`
      );
    }

    const safe = assertSafeProjectPath(projectRoot, relativePath);

    if (!currentByPath.has(relativePath)) {
      if (!fs.existsSync(safe.absolutePath)) {
        throw new Error(
          `changes[${i}] ${relativePath}: arquivo alvo do patch não existe`
        );
      }

      const diskContent = readProjectUtf8(projectRoot, relativePath, overlay);

      originalByPath.set(relativePath, diskContent);
      currentByPath.set(relativePath, diskContent);
    }

    const sequenceSameFile = patchOrdinalByPath.get(relativePath) ?? 0;
    patchOrdinalByPath.set(relativePath, sequenceSameFile + 1);

    const before = currentByPath.get(relativePath);
    let after;

    try {
      if (hybridTelemetryOut) {
        const hybridRes = resolveHybridPatchStep({
          projectRoot,
          relativePath,
          before,
          change,
          allowedFiles,
          overlay,
          patchIndex: i,
        });

        let execution_mode_used = hybridRes.execution_mode_used;
        let fallback_reason = hybridRes.fallback_reason;
        let fallback_reason_codes = hybridRes.fallback_reason_codes;
        let fallback_trigger = hybridRes.fallback_trigger;
        after = hybridRes.after;

        let controlled_structural_apply = null;

        if (execution_mode_used === "structural") {
          const ctrl = runControlledStructuralApply({
            before,
            structuralAfter: hybridRes.after,
            change,
            planEntry: hybridRes.plan_entry,
            relativePath,
            patchIndex: i,
            sequenceSameFile: sequenceSameFile,
            session: opts.structuralApplySession || null,
            postValidateStructuralResult: opts.structuralApplyTestHooks?.postValidateStructuralResult,
          });

          after = ctrl.after;

          controlled_structural_apply = {
            accepted: ctrl.accepted,
            layer: ctrl.controlled_apply_layer,
            fallback_transition:
              ctrl.controlled_apply_layer === "skipped_flag_off"
                ? "controlled_apply_layer_skipped"
                : ctrl.accepted
                  ? "structural_committed_after_post_validate"
                  : "structural_to_textual_post_validate",
            validate: ctrl.validate
              ? {
                  ok: ctrl.validate.ok,
                  reasons: ctrl.validate.reasons || [],
                  parse_error: ctrl.validate.parse_error || null,
                }
              : null,
          };

          if (!ctrl.accepted) {
            execution_mode_used = "textual";
            fallback_reason = (ctrl.fallback_reason_codes || []).join(";");
            fallback_reason_codes = ctrl.fallback_reason_codes || [];
            fallback_trigger = ctrl.fallback_trigger;
          }
        }

        let plan_entry = undefined;
        let structural_replay = undefined;

        if (isStructuralReplayFoundationEnabled()) {
          plan_entry = hybridRes.plan_entry || null;
          const pe = hybridRes.plan_entry;
          const span = pe?.node_span;
          const spanOut =
            !!span &&
            (span.start < 0 ||
              span.end > before.length ||
              span.end <= span.start);

          let searchMissing = false;

          if (span && !spanOut) {
            const inner = before.slice(span.start, span.end);
            searchMissing = !inner.includes(String(change.search ?? ""));
          }

          structural_replay = {
            patch: { search: change.search, replace: change.replace },
            span_content_sha256: span && !spanOut ? computeSpanContentSha256(before, span) : null,
            before_file_sha256: computeWholeFileSha256(before),
            span_out_of_bounds: spanOut,
            search_missing_in_span: searchMissing,
          };

          if (isStructuralIdempotencyEnabled()) {
            structural_replay.capture_before_excerpt = buildBeforeExcerptForIdempotency(before);
          }
        }

        hybridTelemetryOut.push({
          patch_index: i,
          path: relativePath,
          sequence_same_file: sequenceSameFile,
          overlay_active: !!overlay,
          before_length: before.length,
          before_line_count: String(before).split(/\r\n|\r|\n/).length,
          execution_mode_used,
          fallback_reason,
          fallback_reason_codes,
          fallback_trigger,
          gate_snapshot: hybridRes.gate_snapshot,
          controlled_structural_apply,
          governance_preempt: hybridRes.governance_preempt || null,
          plan_entry,
          structural_replay,
        });
      } else {
        after = applyPatchToContent(before, change.search, change.replace);
      }
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      throw new Error(`changes[${i}] ${relativePath}: ${msg}`);
    }

    currentByPath.set(relativePath, after);

    const payload = {
      operation: change.operation,
      path: relativePath,
      reason: change.reason,
      before_length: before.length,
      after_length: after.length,
      search_length: change.search.length,
      replace_length: change.replace.length,
      preview: createPreviewAround(after, change.replace),
      search: change.search,
      replace: change.replace,
    };

    if (hybridTelemetryOut && hybridTelemetryOut.length > 0) {
      const hLast = hybridTelemetryOut[hybridTelemetryOut.length - 1];

      if (hLast && hLast.patch_index === i) {
        payload.execution_mode_used = hLast.execution_mode_used;
        payload.hybrid_fallback_reason = hLast.fallback_reason;
      }
    }

    applied.push(payload);
  }

  const commitOrder = [];
  const seenCommitPath = new Set();

  for (const change of changes) {
    const p = normalizeRelativePath(change.path);

    if (!seenCommitPath.has(p)) {
      seenCommitPath.add(p);
      commitOrder.push(p);
    }
  }

  // Dry-run: atualiza overlay virtual para próximas passagens / review consistentes.
  if (dryRun && overlay) {
    mergeDryRunOverlayFromMap(overlay, currentByPath);
  }

  // Fase 2 — COMMIT: writes reais; rollback dos já escritos se algum falhar.
  const writtenPaths = [];

  try {
    if (!dryRun) {
      for (const relativePath of commitOrder) {
        const safe = assertSafeProjectPath(projectRoot, relativePath);

        try {
          ensureDir(path.dirname(safe.absolutePath));
          fs.writeFileSync(
            safe.absolutePath,
            currentByPath.get(relativePath),
            "utf-8",
          );
          writtenPaths.push(relativePath);
        } catch (wErr) {
          const wMsg = wErr && wErr.message ? wErr.message : String(wErr);
          throw new Error(`${relativePath}: falha ao gravar ficheiro — ${wMsg}`);
        }
      }
    }
  } catch (err) {
    const rollbackErrors = [];

    for (let i = writtenPaths.length - 1; i >= 0; i--) {
      const rel = writtenPaths[i];

      try {
        const safeRb = assertSafeProjectPath(projectRoot, rel);
        fs.writeFileSync(
          safeRb.absolutePath,
          originalByPath.get(rel),
          "utf-8",
        );
      } catch (rbErr) {
        rollbackErrors.push({
          path: rel,
          message: rbErr && rbErr.message ? rbErr.message : String(rbErr),
        });
      }
    }

    const baseMsg = err && err.message ? err.message : String(err);

    if (rollbackErrors.length) {
      throw new Error(
        `${baseMsg} | Rollback falhou ao restaurar: ${rollbackErrors
          .map((e) => `${e.path}: ${e.message}`)
          .join("; ")}`,
      );
    }

    throw err;
  }

  return applied;
}

function updateAgentMetadata(outputDir, agentMeta, out) {
  const metadataPath = path.join(outputDir, "metadata.json");

  if (out) {
    if (!out.exists(metadataPath)) return;
  } else if (!fs.existsSync(metadataPath)) {
    return;
  }

  const metadata = out ? out.readJson(metadataPath) : readJson(metadataPath);

  metadata.agents = {
    ...metadata.agents,
    executor: agentMeta
  };

  metadata.llm = {
    ...(metadata.llm || {}),
    executor: {
      model: getModelForStep("executor")
    }
  };

  if (out) out.writeJson(metadataPath, metadata);
  else writeJson(metadataPath, metadata);
}

function trimMsg(value, maxLen = 1200) {
  const t = String(value || "").trim();

  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;
}

function classifyPatchFailure(err) {
  const message = err && err.message ? err.message : String(err || "");

  if (message.includes("Patch no-op detectado") || message.includes("no-op detectado")) {
    return {
      type: "patch_validation_block",
      cause: "noop_patch",
      title: "Patch no-op (search idêntico a replace)",
    };
  }

  if (message.includes("Patch duplicado detectado")) {
    return {
      type: "patch_validation_block",
      cause: "duplicate_patch",
      title: "Patch duplicado",
    };
  }

  if (message.includes("patch com search vazio")) {
    return {
      type: "patch_validation_block",
      cause: "empty_search",
      title: "Search vazio",
    };
  }

  if (message.includes("caminho é symlink")) {
    return {
      type: "patch_validation_block",
      cause: "symlink_blocked",
      title: "Symlink não permitido para patch",
    };
  }

  if (message.includes("arquivo parece binário")) {
    return {
      type: "patch_validation_block",
      cause: "binary_file",
      title: "Arquivo aparentemente binário",
    };
  }

  if (message.includes("trecho search não encontrado")) {
    return {
      type: "patch_search_not_found",
      cause: "search_not_found",
      title: "Trecho search não encontrado no arquivo real",
    };
  }

  if (message.includes("trecho search encontrado") && message.includes("vezes")) {
    return {
      type: "patch_search_not_unique",
      cause: "search_not_unique",
      title: "Trecho search ambíguo (não único)",
    };
  }

  if (message.includes("fora do escopo")) {
    return {
      type: "path_safety_block",
      cause: "out_of_allowed_files",
      title: "Alteração fora do escopo permitido",
    };
  }

  if (message.includes("alvo é diretório")) {
    return {
      type: "patch_validation_block",
      cause: "target_is_directory",
      title: "Alvo do patch é diretório",
    };
  }

  if (message.includes("Caminho inseguro") || message.includes("fora do projeto")) {
    return {
      type: "path_safety_block",
      cause: "path_unsafe",
      title: "Caminho bloqueado por segurança",
    };
  }

  if (message.includes("Caminho absoluto não permitido")) {
    return {
      type: "path_safety_block",
      cause: "absolute_path",
      title: "Caminho absoluto não permitido",
    };
  }

  if (message.toLowerCase().includes("operação inválida")) {
    return {
      type: "executor_blocked",
      cause: "invalid_operation",
      title: "Operação inválida no executor",
    };
  }

  if (message.includes("não existe")) {
    return {
      type: "missing_file",
      cause: "missing_file",
      title: "Arquivo alvo do patch não existe",
    };
  }

  return {
    type: "patch_apply_failed",
    cause: "apply_failed",
    title: "Falha ao aplicar patch",
  };
}

function inferModelBlockedType(result) {
  const br = String(result?.blocked_reason || "");
  const ev = (result?.evidence || []).join(" ");

  if (
    br.includes("objeto JSON") ||
    br.includes("não é um objeto") ||
    ev.includes("Resultado ausente ou inválido")
  ) {
    return {
      type: "llm_invalid_json",
      cause: "invalid_model_payload",
      title: "Resultado inválido do modelo",
      severity: "high",
    };
  }

  if (br.includes("sucesso sem patches") || ev.includes("changes vazia")) {
    return {
      type: "executor_blocked",
      cause: "no_changes_success",
      title: "Executor retornou sucesso sem patches aplicáveis",
      severity: "medium",
    };
  }

  return {
    type: "executor_blocked",
    cause: "executor_declined",
    title: "Executor bloqueado",
    severity: "medium",
  };
}

function logExecutorProblem({
  outputDir,
  metadata,
  projectRoot,
  hasUsableRunContext,
  model,
  usage,
  result,
  patchError,
  type,
  cause,
  title,
  summary,
  severity,
  files,
}) {
  const blockedReason = result?.blocked_reason || patchError || null;

  appendProblemHistoryEntry({
    outputDir,
    projectRoot,
    metadata,
    step: "executor",
    status: "blocked",
    severity: severity || "high",
    type: type || "executor_blocked",
    title: title || "Executor bloqueado",
    summary: summary || result?.summary || trimMsg(patchError, 900) || null,
    cause: cause || null,
    evidence: Array.isArray(result?.evidence)
      ? result.evidence.map((e) => trimMsg(e, 600))
      : patchError
        ? [trimMsg(patchError, 900)]
        : [],
    files: files || [],
    model,
    usage,
    runId: metadata?.runId,
    extra: {
      context_mode: hasUsableRunContext ? "run-context" : "legacy-fallback",
      blocked_reason: blockedReason,
      changes_count: Array.isArray(result?.changes) ? result.changes.length : 0,
      ...(patchError
        ? { patch_error: trimMsg(patchError, 800), failed_operation: "patch" }
        : {}),
    },
  });
}

function writeBlockedOutput(outputDir, result, out) {
  const resultPath = path.join(outputDir, "executor-result.json");
  const mdPath = path.join(outputDir, "executor-output.md");
  const chPath = path.join(outputDir, "executor-changes.json");
  const md = `# Executor Output

## Status

blocked

## Arquivos alterados

- _(nenhum arquivo escrito nesta execução — estado bloqueado)._

## Reason

${result.blocked_reason}

## Evidence

${(result.evidence || []).map((e) => `- ${e}`).join("\n")}
`;

  if (out) {
    out.writeJson(resultPath, result);
    out.writeUtf8(mdPath, md);
    out.writeUtf8(chPath, JSON.stringify([], null, 2));
  } else {
    writeJson(resultPath, result);
    fs.writeFileSync(mdPath, md, "utf-8");
    fs.writeFileSync(chPath, JSON.stringify([], null, 2), "utf-8");
  }
}

/**
 * Persiste o payload de PATCH devolvido pelo modelo quando applyChanges falha
 * (search inválido, path, etc.), para diagnóstico — executor-changes.json fica [].
 */
function writeProposedChangesOnFailure(
  outputDir,
  executorResultBeforeApply,
  error,
  out,
) {
  const payload = {
    status: "apply_failed",
    error: error && error.message ? error.message : String(error || ""),
    generated_at: new Date().toISOString(),
    changes: Array.isArray(executorResultBeforeApply?.changes)
      ? executorResultBeforeApply.changes
      : [],
    summary:
      executorResultBeforeApply && executorResultBeforeApply.summary != null
        ? String(executorResultBeforeApply.summary)
        : "",
    evidence: Array.isArray(executorResultBeforeApply?.evidence)
      ? executorResultBeforeApply.evidence
      : [],
  };

  const p = path.join(outputDir, "executor-proposed-changes.json");
  if (out) out.writeJson(p, payload);
  else writeJson(p, payload);
}

/**
 * Persistência de falha fatal (runtime) antes de concluir a etapa — não confundir com blocked do modelo.
 */
function writeFailedOutput(outputDir, error, out) {
  const msg =
    error && error.message ? error.message : String(error || "Erro desconhecido");
  const stackOrMsg = compactText(
    error && error.stack ? error.stack : msg,
    4000,
  );
  const result = {
    status: "failed",
    summary: "Executor falhou antes de concluir.",
    blocked_reason: msg,
    evidence: [stackOrMsg],
    changes: [],
  };

  const md = `# Executor Output

## Status

failed

## Summary

${result.summary}

## Reason

${result.blocked_reason}

## Evidence

${(result.evidence || []).map((e) => `- ${e}`).join("\n")}
`;

  const rPath = path.join(outputDir, "executor-result.json");
  const mPath = path.join(outputDir, "executor-output.md");
  const cPath = path.join(outputDir, "executor-changes.json");

  if (out) {
    out.writeJson(rPath, result);
    out.writeUtf8(mPath, md);
    out.writeUtf8(cPath, JSON.stringify([], null, 2));
  } else {
    writeJson(rPath, result);
    fs.writeFileSync(mPath, md, "utf-8");
    fs.writeFileSync(cPath, JSON.stringify([], null, 2), "utf-8");
  }
}

function normalizeExecutorResult(result) {
  if (!result || typeof result !== "object") {
    return {
      status: "blocked",
      summary: "Executor retornou resultado inválido.",
      blocked_reason: "Resposta do modelo não é um objeto JSON válido.",
      evidence: ["Resultado ausente ou inválido."],
      changes: []
    };
  }

  if (!Array.isArray(result.evidence)) {
    result.evidence = [];
  }

  if (!Array.isArray(result.changes)) {
    result.changes = [];
  }

  if (
    result.status === "success" &&
    result.changes.length === 0 &&
    !summaryDeclaresNoOpImplementation(result.summary)
  ) {
    result.status = "blocked";
    result.blocked_reason =
      "Executor retornou sucesso sem patches — inválido para tasks de implementação.";
    result.evidence.push("Lista changes vazia para task que exige implementação.");
  }

  if (
    result.status === "success" &&
    result.changes.length === 0 &&
    summaryDeclaresNoOpImplementation(result.summary) &&
    !isConcreteNoOpEvidence(result.evidence)
  ) {
    result.status = "blocked";
    result.blocked_reason = "NO-OP requires concrete evidence.";
    result.evidence.push(
      "Evidence de NO-OP deve citar ficheiro (ex.: *.tsx/*.ts/*.md), trecho técnico (ex.: placeholder, useState, filter) e texto substantivo (>20 caracteres)."
    );
  }

  if (result.status !== "success" && result.status !== "blocked") {
    result.status = "blocked";
    result.blocked_reason = "Status inválido retornado pelo executor.";
    result.evidence.push("Status deve ser success ou blocked.");
    result.changes = [];
  }

  if (result.status === "blocked") {
    result.changes = [];
    result.blocked_reason =
      result.blocked_reason || "Executor bloqueou sem motivo detalhado.";
  }

  return result;
}

function buildFallbackRunContext({
  task,
  scan,
  architect,
  allowedFiles,
}) {
  return JSON.stringify(
    {
      mode: "legacy_fallback",
      warning:
        "run-context.json ausente ou inválido. Contexto legado foi truncado para reduzir custo.",
      task_excerpt: compactText(task, MAX_LEGACY_TASK_CHARS),
      scan_excerpt: compactText(scan, MAX_LEGACY_SCAN_CHARS),
      architect_excerpt: compactText(architect, MAX_LEGACY_ARCHITECT_CHARS),
      allowed_files: allowedFiles
    },
    null,
    2
  );
}

async function runExecutor(ctx) {
  const out = createOutputFs(ctx.cache);
  const telemetry = ctx.telemetry;

  telemetry.stepStart("executor");

  try {
  const outputDir = ctx.outputDir;

  ensureFile(outputDir, "Pasta de output");

  const metadataPath = path.join(outputDir, "metadata.json");
  const architectPath = path.join(outputDir, "architect-output.md");
  const runContextPath = path.join(outputDir, "run-context.json");

  ensureFile(metadataPath, "metadata.json");

  const metadata = out ? out.readJson(metadataPath) : readJson(metadataPath);
  const projectRoot = metadata.projectRoot;
  const executionDryRun = Boolean(ctx.execution && ctx.execution.dryRun);

  ensureFile(projectRoot, "Projeto alvo");

  const runContext = out
    ? out.readJsonIfExists(runContextPath, null)
    : readJsonIfExists(runContextPath, null);
  const hasUsableRunContext = isUsableRunContext(runContext);

  let task = "";
  let scan = "";
  let architect = "";
  let allowedFiles = [];

  if (hasUsableRunContext) {
    allowedFiles = getAllowedFilesFromRunContext(runContext, {
      uniqueNormalized: true,
    });
  } else {
    const taskPath = path.join(outputDir, "task.md");

    ensureFile(taskPath, "task.md");
    ensureFile(architectPath, "architect-output.md");

    task = out ? out.readIfExists(taskPath) : readIfExists(taskPath);
    scan = out
      ? out.readIfExists(path.join(outputDir, "scan-output.md"))
      : readIfExists(path.join(outputDir, "scan-output.md"));
    architect = out ? out.readIfExists(architectPath) : readIfExists(architectPath);
    allowedFiles = uniqueNormalizedPaths(extractAllowedFiles(architect));
  }

  if (allowedFiles.length === 0) {
    const msg = hasUsableRunContext
      ? "run-context.json não informou arquivos permitidos para o executor."
      : "Architect não informou arquivos prováveis para o executor.";

    appendProblemHistoryEntry({
      outputDir,
      metadata,
      projectRoot,
      step: "executor",
      status: "blocked",
      severity: "high",
      type: "executor_blocked",
      title: hasUsableRunContext
        ? "Run-context sem arquivos permitidos"
        : "Architect sem arquivos prováveis",
      summary: msg,
      cause: "no_allowed_files",
      evidence: [msg],
      files: [],
      model: getModelForStep("executor"),
      extra: {
        context_mode: hasUsableRunContext ? "run-context" : "legacy-fallback",
      },
    });

    throw new Error(msg);
  }

  const correction = out
    ? out.readIfExists(path.join(outputDir, "correction-instructions.md"))
    : readIfExists(path.join(outputDir, "correction-instructions.md"));
  const changesPath = path.join(outputDir, "executor-changes.json");
  const appliedPrev = pathsFromAppliedChangesJson(
    out ? out.readJsonIfExists(changesPath, []) : readJsonIfExists(changesPath, []),
  );
  const rebuildPaths = inferExecutorRebuildPaths(
    correction,
    appliedPrev,
    allowedFiles,
  );

  const fileClassResolved = resolvePersistedFileClassification(
    hasUsableRunContext,
    runContext,
    allowedFiles,
  );
  const classificationSets = buildClassificationSets(fileClassResolved);

  const keywordSourceParts = collectExecutorKeywordSourceTexts({
    hasUsableRunContext,
    runContext,
    correction,
    task,
    architect,
  });
  const contextKeywords = extractContextKeywords(keywordSourceParts.join("\n\n"));

  const snippetEconomy = {
    classificationSets,
    snippetCache: ctx.snippetCache,
    telemetry: ctx.telemetry,
    rebuildPaths,
    snippetTuning:
      ctx.state && ctx.state.executor_recovery_snippet_tuning
        ? ctx.state.executor_recovery_snippet_tuning
        : null,
    virtualOverlay:
      ctx.state && ctx.state.virtual_project_overlay
        ? ctx.state.virtual_project_overlay
        : null,
    readFileUtf8: (abs) =>
      ctx && ctx.cache
        ? ctx.cache.readFileSync(abs, "utf-8")
        : fs.readFileSync(abs, "utf-8"),
  };

  const projectFiles = readAllowedProjectFiles(
    projectRoot,
    allowedFiles,
    contextKeywords,
    snippetEconomy,
  );

  if (ctx && ctx.state) {
    const st = snippetEconomy._snippetStats || { reused: 0, rebuilt: 0 };
    ctx.state.executor_snippet_economics = {
      snippets_reused: st.reused,
      snippets_rebuilt: st.rebuilt,
      correction_delta_active: rebuildPaths instanceof Set,
      correction_delta_paths:
        rebuildPaths instanceof Set ? [...rebuildPaths] : null,
      file_classification_source: fileClassResolved.source,
      primary_count: classificationSets.primary_files.length,
      reference_count: classificationSets.reference_files.length,
    };
  }

  const directoryAllowedPaths = projectFiles
    .filter((f) => f.is_directory)
    .map((f) => f.path);

  if (directoryAllowedPaths.length > 0) {
    const blocked = {
      status: "blocked",
      summary: "Allowed files contains directory entries.",
      blocked_reason: "allowed_files must contain concrete files only.",
      evidence: directoryAllowedPaths.map(
        (p) => `Directory in allowed_files: ${p}`
      ),
      changes: [],
    };

    writeBlockedOutput(outputDir, blocked, out);

    const skipNote =
      `# Executor Input\n\n` +
      `Skipped LLM: allowed_files contains directory paths (concrete files only).\n\n` +
      directoryAllowedPaths.map((p) => `- ${p}`).join("\n");

    if (out) out.writeUtf8(path.join(outputDir, "executor-input.md"), skipNote);
    else
      fs.writeFileSync(path.join(outputDir, "executor-input.md"), skipNote, "utf-8");

    writePromptSizeRecord(outputDir, "executor", {
      total_prompt_chars: skipNote.length,
      user_chars: skipNote.length,
      blocks: {
        agent: 0,
      },
    });

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: getModelForStep("executor"),
      usage: null,
      result: blocked,
      type: "executor_blocked",
      cause: "allowed_files_directories",
      title: "allowed_files contém diretórios",
      summary: blocked.summary,
      severity: "high",
      files: directoryAllowedPaths,
    });

    console.log("⛔ Executor bloqueado: allowed_files contém diretórios.");
    return;
  }

  try {
    const { runHybridShadowReadonlyIfEnabled } = require("./hybrid-executor/hybrid-shadow-runtime");
    runHybridShadowReadonlyIfEnabled({
      outputDir,
      projectRoot,
      allowedFiles,
      outputFs: out,
    });
  } catch (_) {
    /* Shadow AST 4.9.1: nunca interrompe o executor textual. */
  }

  const agentPath = path.join(ROOT_DIR, "agents", "executor.md");
  const { content: agent, metadata: agentMeta } = loadAgent(agentPath);

  updateAgentMetadata(outputDir, agentMeta, out);

  const promptContext = hasUsableRunContext
    ? buildCompactRunContextForPrompt(runContext, {
        mode: "executor",
        safeWhitespaceCompact: true,
      })
    : buildFallbackRunContext({
        task,
        scan,
        architect,
        allowedFiles,
      });

  const prompt = `
${agent}

## PROJECT ROOT

${projectRoot}

## CONTEXT MODE

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

## RUN CONTEXT

\`\`\`json
${promptContext}
\`\`\`

## CORRECTION INSTRUCTIONS

${correction || "(nenhuma correção pendente)"}

## CURRENT FILE SNIPPETS

Os arquivos abaixo foram truncados para reduzir tokens.
Use os snippets apenas para localizar o ponto de alteração.
Você NÃO deve retornar arquivo completo.

${projectFiles
  .map((file) => {
    const dirHint = file.is_directory ? "\nDirectory: yes" : "";
    const targetedPart = formatTargetedSnippetsForPrompt(
      file.targeted_snippets || [],
    );
    return `### ${file.path}

Exists: ${file.exists ? "yes" : "no"}${dirHint}
Size: ${file.size} chars

\`\`\`
${file.snippet}
\`\`\`${targetedPart}`;
  })
  .join("\n\n")}

## EXECUTION RULE

Resposta só JSON (schema). Paths permitidos: \`allowed_files\` no RUN CONTEXT (relativos ao PROJECT ROOT).

**Antes de propor qualquer PATCH:**

- Verifique se a funcionalidade pedida já está presente no código (nos snippets ou no que já consegue inferir nos ficheiros permitidos).
- Se já estiver, retorne \`success\` com \`changes: []\` (**NO-OP**), sem tentar PATCH; o \`summary\` deve conter marca de NO-OP (ex.: «já existe», «sem alterações necessárias»).
- **Evidence de NO-OP tem de ser concreta** (várias linhas em \`evidence\`): pelo menos uma deve **nomear um ficheiro permitido com extensão** (ex.: \`components/Foo.tsx\`), apontar **trecho técnico real** (nome de símbolo, prop, JSX, texto de \`placeholder\`, \`useState\`, etc.) e explicar a **ligação aos critérios da task**.
- Evidence **vaga** por si só **invalida** NO-OP (ex.: apenas «already implemented», «já existe», «código parece atender», «sem alterações necessárias» sem referência ao ficheiro e ao trecho) → nesse caso retorne **\`blocked\`** com motivo claro ou produza PATCH com \`search\` exacto quando ainda faltar trabalho real.
- **Não** modifique código que já atende à task apenas para «forçar» uma alteração.

**Ao gerar PATCH (apenas quando ainda falta implementação ou correção):**

- \`operation\`: \`patch\` apenas.
- \`path\`: relativo, ∈ \`allowed_files\`.
- \`search\`: texto **exato** como no ficheiro real, **uma** ocorrência.
- \`replace\`: texto final do trecho.
- Se **não** localizar um trecho exato para usar como \`search\`:
  - **Não** invente aproximações nem «parecidos» para encaixar.
  - **Não** produza patch incompleto ou «parcial» que dependa disso.
  - Retorne \`blocked\` com \`blocked_reason\` e \`evidence\` objetivos (ex.: excerpt insuficiente, trecho inexistente, ambiguidade).

- Não reescreva ficheiro inteiro nem use caminhos fora de \`allowed_files\`.
- Implementação típica quando falta trabalho real: \`success\` com \`changes\` não vazio aplicando PATCH.
- NO-OP: quando comprovável que a funcionalidade já existe → \`success\`, \`changes: []\`, \`summary\` com marca de estado já cumprido **e** \`evidence\` conforme «Evidence de NO-OP tem de ser concreta» acima. Se não conseguir essa evidência objectiva sobre o código real, não declare NO-OP.
- Caso não se aplique PATCH nem NO-OP → \`blocked\` + motivo.
- Snippet insuficiente para decisão segura sobre NO-OP ou para um \`search\` exacto único → \`blocked\`.
`.trim();

  let targetedSnippetsChars = 0;
  let snippetBodyChars = 0;

  for (const file of projectFiles) {
    snippetBodyChars += String(file.snippet || "").length;
    targetedSnippetsChars += formatTargetedSnippetsForPrompt(
      file.targeted_snippets || [],
    ).length;
  }

  const execEcon =
    ctx &&
    ctx.state &&
    typeof ctx.state.executor_snippet_economics === "object"
      ? ctx.state.executor_snippet_economics
      : {};

  writePromptSizeRecord(outputDir, "executor", {
    total_prompt_chars: prompt.length,
    user_chars: prompt.length,
    blocks: {
      agent: agent.length,
      run_context_json: promptContext.length,
      file_snippets: snippetBodyChars,
      targeted_snippets: targetedSnippetsChars,
      snippet_cache_reused: execEcon.snippets_reused ?? 0,
      snippet_cache_rebuilt: execEcon.snippets_rebuilt ?? 0,
    },
  });

  if (out) out.writeUtf8(path.join(outputDir, "executor-input.md"), prompt);
  else fs.writeFileSync(path.join(outputDir, "executor-input.md"), prompt, "utf-8");

  const executorModel = getModelForStep("executor");

  telemetry.llmCall({ step: "executor", model: executorModel });

  const providerRetryCap =
    ctx.state &&
    ctx.state.recovery_budgets &&
    Number.isFinite(ctx.state.recovery_budgets.provider_retry_max)
      ? Math.max(1, ctx.state.recovery_budgets.provider_retry_max)
      : Math.max(
          1,
          Number(process.env.SETUP_BOSS_PROVIDER_RETRY_MAX || 3),
        );

  const response = await withOpenAIResponsesRetry(
    () =>
      client.responses.create({
        model: executorModel,
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "executor_result",
            strict: true,
            schema: EXECUTOR_SCHEMA,
          },
        },
      }),
    {
      telemetry,
      outputDir,
      step: "executor",
      maxAttempts: providerRetryCap,
    },
  );

  telemetry.llmResponse({ step: "executor", model: executorModel });

  recordLLMUsage({
    outputDir,
    step: "executor",
    model: executorModel,
    usage: response.usage,
  });

  if (ctx.cache) {
    ctx.cache.invalidate(metadataPath);
  }

  const rawOutput = response.output_text || "";

  let result;

  try {
    result = normalizeExecutorResult(JSON.parse(rawOutput));
  } catch (parseError) {
    const parseMsg =
      parseError && parseError.message
        ? parseError.message
        : String(parseError || "");

    const rawPath = path.join(outputDir, "executor-raw-output.txt");
    const diagPath = path.join(outputDir, "executor-parse-error.json");

    if (out) {
      out.writeUtf8(rawPath, rawOutput);
    } else {
      fs.writeFileSync(rawPath, rawOutput, "utf-8");
    }

    const previewCap = 8000;
    const rawOutputPreview =
      rawOutput.length <= previewCap
        ? rawOutput
        : `${rawOutput.slice(0, previewCap)}…`;

    const diagPayload = {
      status: "parse_failed",
      error: parseMsg,
      generated_at: new Date().toISOString(),
      raw_output_chars: rawOutput.length,
      raw_output_preview: rawOutputPreview,
      model: executorModel,
      step: "executor",
    };

    if (out) out.writeJson(path.join(outputDir, "executor-parse-error.json"), diagPayload);
    else writeJson(path.join(outputDir, "executor-parse-error.json"), diagPayload);

    const artifactPaths = `${rawPath}, ${diagPath}`;
    const blocked = {
      status: "blocked",
      summary: "Executor returned invalid JSON.",
      blocked_reason: "executor_json_parse_failed",
      evidence: [parseMsg, artifactPaths],
      changes: [],
    };

    writeBlockedOutput(outputDir, blocked, out);

    const mdPreviewCap = 4000;
    const mdPreview =
      rawOutput.length <= mdPreviewCap
        ? rawOutput
        : `${rawOutput.slice(0, mdPreviewCap)}…`;

    const detailMd = `# Executor Output

## Status

blocked

## Falha de parse

A resposta do modelo não é JSON válido para o executor (ou há texto extra em torno do JSON).

## Model

${executorModel}

## Diagnóstico

- **Erro:** ${parseMsg}
- **Tamanho (chars):** ${rawOutput.length}
- **Artefatos:** \`${path.basename(rawPath)}\`, \`${path.basename(diagPath)}\`

## Pré-visualização da saída bruta

\`\`\`text
${mdPreview}
\`\`\`

## Reason

${blocked.blocked_reason}

## Evidence

${(blocked.evidence || []).map((e) => `- ${e}`).join("\n")}
`;
    if (out) out.writeUtf8(path.join(outputDir, "executor-output.md"), detailMd);
    else
      fs.writeFileSync(path.join(outputDir, "executor-output.md"), detailMd, "utf-8");

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result: blocked,
      patchError: null,
      type: "executor_json_parse_failed",
      cause: "json_parse_failed",
      title: "JSON inválido na resposta do executor",
      summary: blocked.summary,
      severity: "high",
    });

    console.log("⛔ Executor bloqueado (JSON inválido na resposta).");
    return;
  }

  if (result.status === "blocked") {
    writeBlockedOutput(outputDir, result, out);

    const metaBlocked = inferModelBlockedType(result);

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result,
      type: metaBlocked.type,
      cause: metaBlocked.cause,
      title: metaBlocked.title,
      summary: result.summary,
      severity: metaBlocked.severity,
    });

    console.log("⛔ Executor bloqueado.");
    return;
  }

  try {
    validatePatchSet(projectRoot, allowedFiles, result.changes);
  } catch (error) {
    writeProposedChangesOnFailure(outputDir, result, error, out);

    const blocked = {
      status: "blocked",
      summary: "Patch não passou na pré-validação.",
      blocked_reason: error.message || String(error),
      evidence: [
        "Nenhum arquivo foi escrito — pré-validação falhou antes do compute/apply.",
        "Corrija o payload de patches (ex.: no-op, duplicado, search vazio, symlink ou ficheiro binário).",
      ],
      changes: [],
    };

    const patchClass = classifyPatchFailure(error);
    const filesFromAttempt = Array.isArray(result.changes)
      ? result.changes.map((c) => normalizeRelativePath(c.path)).filter(Boolean)
      : [];

    writeBlockedOutput(outputDir, blocked, out);

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result: blocked,
      patchError: error.message,
      type: patchClass.type,
      cause: patchClass.cause,
      title: patchClass.title,
      summary: blocked.summary,
      severity: "high",
      files: filesFromAttempt,
    });

    console.log("⛔ Executor bloqueado na pré-validação de patches.");
    return;
  }

  let applied;

  const virtualOverlay =
    ctx.state && ctx.state.virtual_project_overlay
      ? ctx.state.virtual_project_overlay
      : null;

  try {
    const { runStructuralPlanningShadowIfEnabled } = require("./hybrid-executor/planning/structural-planner");
    runStructuralPlanningShadowIfEnabled({
      outputDir,
      projectRoot,
      allowedFiles,
      overlay: virtualOverlay,
      changes: result.changes,
      outputFs: out,
    });
  } catch (_) {
    /* 4.9.2 shadow — não interrompe o executor textual */
  }

  try {
    const {
      runStructuralShadowTransformsShadowIfEnabled,
    } = require("./hybrid-executor/structural/shadow-transform-runtime");
    runStructuralShadowTransformsShadowIfEnabled({
      outputDir,
      projectRoot,
      allowedFiles,
      overlay: virtualOverlay,
      changes: result.changes,
      outputFs: out,
    });
  } catch (_) {
    /* 4.9.3 shadow transforms — não interrompe o executor textual */
  }

  const hybridTel = [];
  const hybridApplyActive = isHybridExecutionApplyActive();
  const hybridT0 = hybridApplyActive ? Date.now() : 0;
  const hybridStartedAt = hybridApplyActive ? new Date().toISOString() : "";
  const structuralApplySession =
    hybridApplyActive && isControlledStructuralApplyActive()
      ? createStructuralApplySession()
      : null;
  const structuralApplyT0 = structuralApplySession ? Date.now() : 0;

  try {
    applied = applyChanges(projectRoot, allowedFiles, result.changes, {
      dryRun: executionDryRun,
      overlay: virtualOverlay,
      hybridExecution: hybridApplyActive,
      hybridTelemetryOut: hybridApplyActive ? hybridTel : null,
      structuralApplySession,
    });

    if (hybridApplyActive && hybridTel.length > 0 && outputDir) {
      const runDistinctFiles = new Set(
        (result.changes || []).map((c) => normalizeRelativePath(c.path)),
      ).size;
      const replayInitialOverlay =
        virtualOverlay && typeof virtualOverlay === "object" ? { ...virtualOverlay } : null;
      writeHybridExecutionArtifacts({
        outputDir,
        outputFs: out || null,
        rows: hybridTel,
        startedAt: hybridStartedAt || new Date(hybridT0).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - hybridT0,
        runDistinctFiles,
        projectRoot,
        initialOverlay: replayInitialOverlay,
      });
    }

    if (structuralApplySession && outputDir) {
      writeStructuralApplyArtifacts({
        outputDir,
        outputFs: out || null,
        session: structuralApplySession,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - structuralApplyT0,
      });
    }
  } catch (error) {
    writeProposedChangesOnFailure(outputDir, result, error, out);

    const blocked = {
      status: "blocked",
      summary: "Patch não pôde ser aplicado com segurança.",
      blocked_reason: error.message || String(error),
      evidence: [
        "Nenhum arquivo foi considerado aprovado pelo executor após falha de aplicação.",
        "A correção deve gerar um patch com search único e existente no arquivo real."
      ],
      changes: []
    };

    const patchClass = classifyPatchFailure(error);
    const filesFromAttempt = Array.isArray(result.changes)
      ? result.changes
          .map((c) => normalizeRelativePath(c.path))
          .filter(Boolean)
      : [];

    writeBlockedOutput(outputDir, blocked, out);

    logExecutorProblem({
      outputDir,
      metadata,
      projectRoot,
      hasUsableRunContext,
      model: executorModel,
      usage: response.usage,
      result: blocked,
      patchError: error.message,
      type: patchClass.type,
      cause: patchClass.cause,
      title: patchClass.title,
      summary: blocked.summary,
      severity: "high",
      files: filesFromAttempt,
    });

    console.log("⛔ Executor bloqueado durante aplicação do patch.");
    return;
  }

  if (applied.length > 0) {
    result.evidence = applied.map((item) => `${item.path} atualizado com patch seguro`);
  }

  if (ctx.cache && Array.isArray(applied)) {
    for (const item of applied) {
      if (!item || !item.path) continue;
      try {
        const safe = assertSafeProjectPath(projectRoot, item.path);
        ctx.cache.invalidate(safe.absolutePath);
      } catch (_) {
        /* ignore */
      }
    }
  }

  const noopNote =
    applied.length === 0 && summaryDeclaresNoOpImplementation(result.summary)
      ? "NO-OP: funcionalidade já presente nos ficheiros — nenhum patch aplicado (`changes`: vazio)."
      : null;

  const successMd = `# Executor Output

## Status

success

## Context Mode

${hasUsableRunContext ? "run-context" : "legacy-fallback"}

## Execution mode

${executionDryRun ? "dry-run — patches calculados em estado virtual; disco do projeto não foi alterado nesta etapa." : "apply — commits físicos permitidos quando há patches."}

## Model

${executorModel}

## Arquivos alterados

${
  applied.length
    ? applied.map((item) => `- \`${item.path}\``).join("\n")
    : noopNote
      ? `- _(nenhum arquivo modificado)_ — ${noopNote}`
      : "- _(lista vazia em changes)._"
}

## Summary

${result.summary}

${noopNote ? `## NO-OP\n\n${noopNote}\n` : ""}\n## Evidence\n\n${(result.evidence || []).map((e) => `- ${e}`).join("\n")}

## Applied Patches

${applied.length === 0 ? "_Nenhum patch aplicado._" : applied
  .map(
    (item) => `
### ${item.path}

Operation:
${item.operation}

Reason:
${item.reason}

Before length:
${item.before_length}

After length:
${item.after_length}

Search length:
${item.search_length}

Replace length:
${item.replace_length}

Snippet da alteração:
\`\`\`
${item.preview}
\`\`\`
`
  )
  .join("\n")}
`;

  if (out) {
    out.writeJson(path.join(outputDir, "executor-result.json"), result);
    out.writeJson(path.join(outputDir, "executor-changes.json"), applied);
    out.writeUtf8(path.join(outputDir, "executor-output.md"), successMd);
  } else {
    writeJson(path.join(outputDir, "executor-result.json"), result);
    writeJson(path.join(outputDir, "executor-changes.json"), applied);
    fs.writeFileSync(path.join(outputDir, "executor-output.md"), successMd, "utf-8");
  }

  console.log(
    applied.length
      ? `✅ Executor concluído com PATCH (${hasUsableRunContext ? "run-context" : "legacy-fallback"})`
      : `✅ Executor concluído em NO-OP (${hasUsableRunContext ? "run-context" : "legacy-fallback"})`
  );

  if (executionDryRun && applied.length) {
    console.log(
      "🔍 Dry-run ativo: nenhuma alteração física gravada no projeto (overlay virtual atualizado)."
    );
  }

  return { success: true, outputDir };
  } finally {
    telemetry.stepEnd("executor");
  }
}

async function main() {
  const outputName = process.argv[2];

  if (!outputName) {
    console.log("Uso: npm run executor <runId>");
    return;
  }

  let outputDir;

  try {
    outputDir = resolveOutputDir(outputName);
  } catch (err) {
    console.error(err.message || err);
    return;
  }

  const ctx = createStageContextFromOutputDir(outputDir, { runId: outputName });
  await runExecutor(ctx);
}

module.exports = {
  runExecutor,
  /** Apply determinístico (apply-later / replay físico) — mesma lógica PATCH que o executor LLM. */
  applyChanges,
  validatePatchSet,
  applyPatchToContent,
};

if (require.main === module) {
  main().catch((error) => {
  console.error("❌ Erro no executor:", error.message || error);

  const errorLogPath = path.join(ROOT_DIR, ".setup-boss", "executor-error.log");

  try {
    const outputName = process.argv[2];

    if (outputName) {
      let outputDir;

      try {
        outputDir = resolveOutputDir(outputName, { warnLegacy: false });
      } catch (_) {
        outputDir = null;
      }

      if (outputDir) {
        try {
          ensureDir(outputDir);
          writeFailedOutput(outputDir, error, null);
        } catch (_) {
          /* best effort — erro principal já vai para executor-error.log */
        }

        const metaPath = path.join(outputDir, "metadata.json");
        const metadata = fs.existsSync(metaPath)
          ? readJson(metaPath)
          : {};

        if (metadata.projectRoot) {
          appendProblemHistoryEntry({
            outputDir,
            metadata,
            projectRoot: metadata.projectRoot,
            step: "executor",
            status: "error",
            severity: "critical",
            type: "unknown_error",
            title: "Erro fatal no executor",
            summary: trimMsg(error.message || String(error)),
            cause: "exception",
            evidence: [trimMsg(error.stack || error.message, 2000)],
            files: [],
            model: getModelForStep("executor"),
            extra: {},
          });
        }

        fs.writeFileSync(
          path.join(outputDir, "executor-error.log"),
          String(error.stack || error),
          "utf-8"
        );
        process.exit(0);
        return;
      }
    }
  } catch (_) {
    /* noop */
  }

  fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
  fs.writeFileSync(errorLogPath, String(error.stack || error), "utf-8");

  process.exit(0);
  });
}