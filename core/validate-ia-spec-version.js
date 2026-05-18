"use strict";

const fs = require("fs");
const path = require("path");

const INDEX_REL = "docs/.IA/index.md";
const SUPPORTED_SPEC_VERSIONS = Object.freeze(["1.0"]);

const ERROR_TITLE_VERSION =
  "Versão da SPEC `.IA` inválida";
const ERROR_MESSAGE_UNSUPPORTED =
  "O projeto possui uma `.IA`, mas a versão declarada não é suportada pelo Setup-Boss.";
const ERROR_MESSAGE_MISSING =
  "A versão da SPEC `.IA` não foi declarada em `docs/.IA/index.md`.";
const ERROR_MESSAGE_INVALID =
  "A versão declarada em `docs/.IA/index.md` não é válida.";

/** Aceita `Version: 1.0` e `**Version:** 1.0`. */
const VERSION_LINE_RE =
  /^\s*(?:\*{1,2})?Version(?:\*{1,2})?\s*:\s*(?:\*{1,2})?\s*(.*?)\s*(?:\*{1,2})?\s*$/im;

const VERSION_FORMAT_RE = /^\d+(?:\.\d+)*$/;

/**
 * @param {string} content
 * @returns {{ status: "ok"|"missing"|"invalid", detected: string|null }}
 */
function parseSpecVersionFromIndexContent(content) {
  const text = String(content || "");
  const match = text.match(VERSION_LINE_RE);
  if (!match) {
    return { status: "missing", detected: null };
  }
  const detected = String(match[1] || "")
    .trim()
    .replace(/\*{1,2}/g, "")
    .trim();
  if (!detected) {
    return { status: "missing", detected: null };
  }
  if (!VERSION_FORMAT_RE.test(detected)) {
    return { status: "invalid", detected };
  }
  return { status: "ok", detected };
}

/**
 * @param {string} projectRootAbs
 * @returns {string|null}
 */
function readIndexMarkdown(projectRootAbs) {
  const indexAbs = path.join(projectRootAbs, ...INDEX_REL.split("/"));
  try {
    return fs.readFileSync(indexAbs, "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} projectRootAbs
 * @returns {{
 *   valid: boolean,
 *   versionValid: boolean,
 *   code: string|null,
 *   specVersion: string|null,
 *   detectedSpecVersion: string|null,
 *   supportedVersions: string[],
 *   indexPath: string,
 * }}
 */
/**
 * @param {string} projectRootAbs
 * @param {{ context?: { getFileContent?: (rel: string) => string|null, fileContents?: Record<string, string|null> } }} [options]
 */
function validateIaSpecVersion(projectRootAbs, options = {}) {
  const supportedVersions = [...SUPPORTED_SPEC_VERSIONS];
  const ctx = options.context;
  const content =
    ctx?.getFileContent?.("docs/.IA/index.md") ??
    (ctx?.fileContents && Object.prototype.hasOwnProperty.call(ctx.fileContents, "docs/.IA/index.md")
      ? ctx.fileContents["docs/.IA/index.md"]
      : null) ??
    readIndexMarkdown(projectRootAbs);
  if (content == null) {
    return {
      valid: false,
      versionValid: false,
      code: "KNOWLEDGE_BASE_VERSION_MISSING",
      specVersion: null,
      detectedSpecVersion: null,
      supportedVersions,
      indexPath: INDEX_REL,
    };
  }

  const parsed = parseSpecVersionFromIndexContent(content);
  if (parsed.status === "missing") {
    return {
      valid: false,
      versionValid: false,
      code: "KNOWLEDGE_BASE_VERSION_MISSING",
      specVersion: null,
      detectedSpecVersion: null,
      supportedVersions,
      indexPath: INDEX_REL,
    };
  }
  if (parsed.status === "invalid") {
    return {
      valid: false,
      versionValid: false,
      code: "KNOWLEDGE_BASE_VERSION_INVALID",
      specVersion: parsed.detected,
      detectedSpecVersion: parsed.detected,
      supportedVersions,
      indexPath: INDEX_REL,
    };
  }
  if (!supportedVersions.includes(parsed.detected)) {
    return {
      valid: false,
      versionValid: false,
      code: "KNOWLEDGE_BASE_UNSUPPORTED_VERSION",
      specVersion: parsed.detected,
      detectedSpecVersion: parsed.detected,
      supportedVersions,
      indexPath: INDEX_REL,
    };
  }

  return {
    valid: true,
    versionValid: true,
    code: null,
    specVersion: parsed.detected,
    detectedSpecVersion: parsed.detected,
    supportedVersions,
    indexPath: INDEX_REL,
  };
}

/**
 * @param {ReturnType<typeof validateIaSpecVersion>} version
 * @param {string} docsIaPath
 * @returns {Record<string, unknown>}
 */
function buildSpecVersionFailure(version, docsIaPath) {
  const code = String(version.code || "KNOWLEDGE_BASE_VERSION_INVALID");
  const isMissing = code === "KNOWLEDGE_BASE_VERSION_MISSING";
  const isInvalid = code === "KNOWLEDGE_BASE_VERSION_INVALID";
  const isUnsupported = code === "KNOWLEDGE_BASE_UNSUPPORTED_VERSION";

  const message = isUnsupported
    ? ERROR_MESSAGE_UNSUPPORTED
    : isMissing
      ? ERROR_MESSAGE_MISSING
      : isInvalid
        ? ERROR_MESSAGE_INVALID
        : ERROR_MESSAGE_UNSUPPORTED;

  const supportedBullets = version.supportedVersions.map((v) => `- ${v}`).join("\n");
  const parts = [
    message,
    `\n\nDeclare a versão em \`${version.indexPath}\` com o formato:\n\n\`\`\`\nVersion: 1.0\n\`\`\``,
  ];
  if (version.detectedSpecVersion) {
    parts.push(`\n\nVersão detectada: ${version.detectedSpecVersion}`);
  }
  parts.push(`\n\nVersões suportadas:\n${supportedBullets}`);

  return {
    ok: false,
    code,
    phase: "validate_knowledge_spec_version",
    title: ERROR_TITLE_VERSION,
    message,
    description: parts.join(""),
    docsIaPath,
    relativePath: "docs/.IA",
    specVersion: version.specVersion,
    detectedSpecVersion: version.detectedSpecVersion,
    supportedVersions: version.supportedVersions,
    indexPath: version.indexPath,
    details: {
      versionValidation: {
        valid: false,
        versionValid: false,
        specVersion: version.specVersion,
        detectedSpecVersion: version.detectedSpecVersion,
        supportedVersions: version.supportedVersions,
        indexPath: version.indexPath,
      },
    },
  };
}

module.exports = {
  INDEX_REL,
  SUPPORTED_SPEC_VERSIONS,
  ERROR_TITLE_VERSION,
  ERROR_MESSAGE_UNSUPPORTED,
  VERSION_LINE_RE,
  parseSpecVersionFromIndexContent,
  validateIaSpecVersion,
  buildSpecVersionFailure,
};
