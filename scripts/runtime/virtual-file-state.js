/**
 * Estado virtual do projeto durante dry-run: overlay por path relativo
 * normalizado (conteúdo pós-patch em memória), sem gravar no disco alvo.
 */

const fs = require("fs");
const {
  normalizeRelativePath,
  assertSafeProjectPath,
} = require("../shared-utils");

function readProjectUtf8(projectRoot, relativePath, overlay) {
  const rel = normalizeRelativePath(relativePath);
  if (
    overlay &&
    typeof overlay === "object" &&
    Object.prototype.hasOwnProperty.call(overlay, rel)
  ) {
    return String(overlay[rel]);
  }
  const safe = assertSafeProjectPath(projectRoot, rel);
  return fs.readFileSync(safe.absolutePath, "utf-8");
}

function mergeDryRunOverlayFromMap(overlay, currentByPath) {
  if (!overlay || typeof overlay !== "object" || !currentByPath) return;
  for (const [relRaw, content] of currentByPath.entries()) {
    const rel = normalizeRelativePath(relRaw);
    overlay[rel] = String(content);
  }
}

module.exports = {
  readProjectUtf8,
  mergeDryRunOverlayFromMap,
};
