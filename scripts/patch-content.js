"use strict";

/**
 * Motor textual de PATCH (search único → replace), partilhado pelo executor e pelo hybrid MVP.
 */

function detectEol(content) {
  return String(content).includes("\r\n") ? "\r\n" : "\n";
}

function normalizeEol(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toFileEol(value, eol) {
  const lf = normalizeEol(value);
  return eol === "\r\n" ? lf.replace(/\n/g, "\r\n") : lf;
}

function applyPatchToContent(content, search, replace) {
  if (!search) {
    throw new Error("Patch inválido: campo search vazio.");
  }

  const literalCount = content.split(search).length - 1;

  if (literalCount > 1) {
    throw new Error(
      `Patch inseguro: trecho search encontrado ${literalCount} vezes. O search deve ser único.`,
    );
  }

  if (literalCount === 1) {
    return content.replace(search, replace);
  }

  const eol = detectEol(content);
  const normalizedContent = normalizeEol(content);
  const normalizedSearch = normalizeEol(search);
  const normalizedReplace = normalizeEol(replace);

  const normalizedCount = normalizedContent.split(normalizedSearch).length - 1;

  if (normalizedCount === 0) {
    throw new Error("Patch inválido: trecho search não encontrado no arquivo real.");
  }

  if (normalizedCount > 1) {
    throw new Error(
      `Patch inseguro: trecho search encontrado ${normalizedCount} vezes. O search deve ser único.`,
    );
  }

  const normalizedAfter = normalizedContent.replace(normalizedSearch, normalizedReplace);

  return toFileEol(normalizedAfter, eol);
}

module.exports = {
  detectEol,
  normalizeEol,
  toFileEol,
  applyPatchToContent,
};
