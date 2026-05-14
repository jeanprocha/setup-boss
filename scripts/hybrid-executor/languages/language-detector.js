const path = require("path");

/**
 * @param {string} relativePath
 * @returns {"javascript"|"typescript"|null}
 */
function detectStructuralLanguage(relativePath) {
  const ext = path.extname(String(relativePath || "")).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if ([".ts", ".tsx", ".mts", ".cts"].includes(ext)) return "typescript";
  return null;
}

module.exports = { detectStructuralLanguage };
