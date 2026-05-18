"use strict";

const fs = require("fs");
const path = require("path");

const DOCS_IA_PREFIX = "docs/.IA";

const MAX_FILES_TO_SCAN = 48;
const MAX_SECRET_MATCHES = 16;
const MAX_LANGUAGE_FILES = 24;
const MAX_REDACTED_SAMPLES = 8;

const ERROR_TITLE_SENSITIVE = "Possível dado sensível na `.IA`";
const ERROR_MESSAGE_SENSITIVE =
  "A `.IA` contém possível dado sensível.";
const ERROR_SENSITIVE_DESCRIPTION =
  "A Knowledge Base contém conteúdo que parece ser segredo ou credencial.\n\n" +
  "Remova ou substitua credenciais reais por placeholders antes de versionar.";

const WARNING_MESSAGE_LANGUAGE =
  "A `.IA` parece conter documentação fora do padrão de idioma esperado.";

/** @type {readonly { id: string, pattern: RegExp }[]} */
const SECRET_RULES = Object.freeze([
  { id: "private_key_pem", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: "password_assignment",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^\s'"]{8,}/i,
  },
  {
    id: "api_key_assignment",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{12,}/i,
  },
  {
    id: "secret_assignment",
    pattern: /(?:secret|client[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{8,}/i,
  },
  {
    id: "access_token_assignment",
    pattern: /(?:access[_-]?token|auth[_-]?token)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{16,}/i,
  },
  { id: "bearer_token", pattern: /\bbearer\s+[A-Za-z0-9_\-\.=+/]{20,}/i },
  {
    id: "generic_token_assignment",
    pattern: /(?:token)\s*[:=]\s*['"]?[A-Za-z0-9_\-+/=]{20,}/i,
  },
]);

/** Stopwords PT/ES para heurística leve (documentação em inglês esperada). */
const NON_EN_STOPWORDS = new Set([
  "de",
  "que",
  "não",
  "nao",
  "para",
  "com",
  "uma",
  "um",
  "os",
  "as",
  "das",
  "dos",
  "pelo",
  "pela",
  "também",
  "tambem",
  "está",
  "esta",
  "estão",
  "estao",
  "são",
  "sao",
  "como",
  "mais",
  "muito",
  "sobre",
  "entre",
  "quando",
  "onde",
  "porque",
  "porquê",
  "seu",
  "sua",
  "seus",
  "suas",
  "este",
  "esta",
  "estes",
  "estas",
  "esse",
  "essa",
  "aquela",
  "aquele",
  "documentação",
  "documentacao",
  "configuração",
  "configuracao",
  "el",
  "la",
  "los",
  "las",
  "del",
  "por",
  "con",
  "una",
  "uno",
  "está",
  "están",
  "estan",
  "también",
  "tambien",
  "más",
  "mas",
  "muy",
  "sobre",
  "entre",
  "cuando",
  "donde",
  "porque",
  "documentación",
  "documentacion",
  "configuración",
  "configuracion",
]);

/**
 * @param {string} relPosix
 * @returns {string}
 */
function normalizeRepoRelPath(relPosix) {
  return String(relPosix || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

/**
 * @param {string} sample
 * @returns {string}
 */
function redactSecretSample(sample) {
  const raw = String(sample || "").trim();
  if (!raw) return "[redacted]";
  if (raw.length <= 6) return "[redacted]";
  const head = raw.slice(0, 4);
  const tail = raw.slice(-2);
  const middle = "*".repeat(Math.min(12, Math.max(4, raw.length - 6)));
  return `${head}${middle}${tail}`;
}

/**
 * @param {string} content
 * @returns {string}
 */
function stripMarkdownNoise(content) {
  let text = String(content || "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`]+`/g, " ");
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
  text = text.replace(/\[[^\]]*\]\([^)]+\)/g, " ");
  text = text.replace(/https?:\/\/\S+/gi, " ");
  text = text.replace(/[A-Za-z]:\\[^\s]+/g, " ");
  text = text.replace(/\/[a-z0-9._\-/]+/gi, " ");
  text = text.replace(/`{1,3}[^`]*`{1,3}/g, " ");
  return text;
}

/**
 * @param {string} content
 * @returns {{ wordCount: number, stopwordHits: number }}
 */
function languageHeuristicStats(content) {
  const text = stripMarkdownNoise(content)
    .toLowerCase()
    .replace(/[^a-zàáâãäåèéêëìíîïòóôõöùúûüçñ\s-]/gi, " ");
  const tokens = text.split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return { wordCount: 0, stopwordHits: 0 };
  let stopwordHits = 0;
  for (const token of tokens) {
    if (NON_EN_STOPWORDS.has(token)) stopwordHits += 1;
  }
  return { wordCount: tokens.length, stopwordHits };
}

/**
 * @param {string} projectRootAbs
 * @param {string} relPosix
 * @returns {string|null}
 */
function readTrackedFileUtf8(projectRootAbs, relPosix) {
  const rel = normalizeRepoRelPath(relPosix);
  const abs = path.join(projectRootAbs, ...rel.split("/"));
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length > 512_000) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} content
 * @param {string} relPath
 * @returns {{ ruleIds: string[], redactedSamples: string[] }}
 */
function scanSecretsInContent(content, relPath) {
  /** @type {Set<string>} */
  const ruleIds = new Set();
  /** @type {string[]} */
  const redactedSamples = [];

  for (const rule of SECRET_RULES) {
    const m = rule.pattern.exec(content);
    if (!m) continue;
    ruleIds.add(rule.id);
    if (redactedSamples.length < MAX_REDACTED_SAMPLES) {
      redactedSamples.push(
        `${relPath}: ${redactSecretSample(m[0])} [${rule.id}]`,
      );
    }
  }

  return {
    ruleIds: [...ruleIds],
    redactedSamples,
  };
}

/**
 * @param {string} projectRootAbs
 * @param {string[]} trackedFiles
 * @param {{ maxFiles?: number }} [options]
 * @returns {{
 *   policyValid: boolean,
 *   secretScan: {
 *     ok: boolean,
 *     matchedFiles: string[],
 *     ruleIds: string[],
 *     redactedSamples: string[],
 *   },
 *   languageScan: {
 *     ok: boolean,
 *     suspectedFiles: string[],
 *     confidence: number|null,
 *     sampleReason: string|null,
 *   },
 *   policyWarnings: { code: string, message: string }[],
 * }}
 */
function validateIaContentPolicy(projectRootAbs, trackedFiles, options = {}) {
  const maxFiles = options.maxFiles ?? MAX_FILES_TO_SCAN;
  const relFiles = trackedFiles
    .map(normalizeRepoRelPath)
    .filter((rel) => rel.startsWith(DOCS_IA_PREFIX + "/") || rel === DOCS_IA_PREFIX)
    .filter((rel) => !rel.endsWith("/"))
    .slice(0, maxFiles);

  /** @type {Set<string>} */
  const matchedFiles = new Set();
  /** @type {Set<string>} */
  const allRuleIds = new Set();
  /** @type {string[]} */
  const redactedSamples = [];

  /** @type {{ file: string, ratio: number, reason: string }[]} */
  const languageSuspects = [];

  const getContent =
    options.context?.getFileContent != null
      ? (rel) => options.context.getFileContent(rel)
      : (rel) => readTrackedFileUtf8(projectRootAbs, rel);

  for (const rel of relFiles) {
    const content = getContent(rel);
    if (content == null) continue;

    const secretHit = scanSecretsInContent(content, rel);
    if (secretHit.ruleIds.length) {
      matchedFiles.add(rel);
      for (const id of secretHit.ruleIds) allRuleIds.add(id);
      for (const sample of secretHit.redactedSamples) {
        if (redactedSamples.length < MAX_SECRET_MATCHES) {
          redactedSamples.push(sample);
        }
      }
    }

    if (!rel.endsWith(".md")) continue;
    if (languageSuspects.length >= MAX_LANGUAGE_FILES) continue;

    const { wordCount, stopwordHits } = languageHeuristicStats(content);
    if (wordCount < 40) continue;
    const ratio = stopwordHits / wordCount;
    if (ratio >= 0.14 && stopwordHits >= 6) {
      languageSuspects.push({
        file: rel,
        ratio,
        reason: `stopwords PT/ES: ${stopwordHits}/${wordCount} (${Math.round(ratio * 100)}%)`,
      });
    }
  }

  const secretOk = matchedFiles.size === 0;
  const languageOk = languageSuspects.length === 0;

  const avgRatio =
    languageSuspects.length > 0
      ? languageSuspects.reduce((s, x) => s + x.ratio, 0) / languageSuspects.length
      : null;

  /** @type {{ code: string, message: string }[]} */
  const policyWarnings = [];
  if (!languageOk) {
    policyWarnings.push({
      code: "KNOWLEDGE_BASE_LANGUAGE_WARNING",
      message: WARNING_MESSAGE_LANGUAGE,
    });
  }

  return {
    policyValid: secretOk,
    secretScan: {
      ok: secretOk,
      matchedFiles: [...matchedFiles].sort(),
      ruleIds: [...allRuleIds].sort(),
      redactedSamples,
    },
    languageScan: {
      ok: languageOk,
      suspectedFiles: languageSuspects.map((s) => s.file),
      confidence: avgRatio != null ? Math.min(0.99, Math.round(avgRatio * 100) / 100) : null,
      sampleReason:
        languageSuspects.length > 0 ? languageSuspects[0].reason : null,
    },
    policyWarnings,
  };
}

/**
 * @param {ReturnType<typeof validateIaContentPolicy>} policy
 * @param {string} docsIaPath
 * @returns {Record<string, unknown>}
 */
function buildSensitiveDataFailure(policy, docsIaPath) {
  const files = policy.secretScan.matchedFiles;
  const bullets = files.map((f) => `- ${f}`).join("\n");
  const ruleBullets = policy.secretScan.ruleIds.map((r) => `- ${r}`).join("\n");

  return {
    ok: false,
    code: "KNOWLEDGE_BASE_SENSITIVE_DATA",
    phase: "validate_knowledge_content_policy",
    title: ERROR_TITLE_SENSITIVE,
    message: ERROR_MESSAGE_SENSITIVE,
    description:
      ERROR_SENSITIVE_DESCRIPTION +
      (files.length ? `\n\nFicheiros:\n${bullets}` : "") +
      (policy.secretScan.ruleIds.length
        ? `\n\nRegras:\n${ruleBullets}`
        : ""),
    docsIaPath,
    relativePath: "docs/.IA",
    matchedFiles: files,
    ruleIds: policy.secretScan.ruleIds,
    redactedSamples: policy.secretScan.redactedSamples,
    details: {
      policyValidation: {
        valid: false,
        policyValid: false,
        secretScan: policy.secretScan,
        languageScan: policy.languageScan,
      },
    },
  };
}

module.exports = {
  DOCS_IA_PREFIX,
  SECRET_RULES,
  NON_EN_STOPWORDS,
  redactSecretSample,
  stripMarkdownNoise,
  languageHeuristicStats,
  validateIaContentPolicy,
  buildSensitiveDataFailure,
};
