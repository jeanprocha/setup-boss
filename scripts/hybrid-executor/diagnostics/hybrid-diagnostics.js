/**
 * Agregação de diagnósticos shadow AST (read-only).
 */

/**
 * @typedef {{ path: string, reason: string, detected_language?: string|null }} SkippedEntry
 */

/**
 * @param {object} args
 * @returns {object}
 */
function buildStructuralAstSummary(args) {
  const {
    schemaVersion = 1,
    fileRows = [],
    skippedUnsupported = [],
    skippedLanguageFlag = [],
  } = args;

  return {
    schema_version: schemaVersion,
    phase: "4.9.1",
    files: fileRows,
    skipped_unsupported_extension: skippedUnsupported,
    skipped_language_disabled: skippedLanguageFlag,
  };
}

/**
 * @param {object} args
 * @returns {object}
 */
function buildParserErrorsManifest(args) {
  const { schemaVersion = 1, errors = [] } = args;
  return {
    schema_version: schemaVersion,
    phase: "4.9.1",
    errors,
  };
}

module.exports = {
  buildStructuralAstSummary,
  buildParserErrorsManifest,
};
