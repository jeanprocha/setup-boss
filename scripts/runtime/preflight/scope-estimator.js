/**
 * Estimativa heurística de ficheiros afetados e categorias prováveis.
 */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function estimateFileRange({
  taskChars,
  keywordHits,
  crossLayer,
  projectLite,
  pathHints,
  historicalAvgFiles,
}) {
  let baseMin = 2;
  let baseMax = 5;

  if (taskChars > 3500) {
    baseMin += 1;
    baseMax += 3;
  }
  if (taskChars > 9000) {
    baseMin += 2;
    baseMax += 5;
  }

  if (crossLayer) {
    baseMin += 1;
    baseMax += 4;
  }

  if (keywordHits.integration || keywordHits.refactor) {
    baseMin += 1;
    baseMax += 3;
  }

  if (pathHints.runtime_core) {
    baseMin += 1;
    baseMax += 3;
  }

  const pc = projectLite && projectLite.categories ? projectLite.categories : {};
  const largeProj =
    projectLite &&
    typeof projectLite.fileCount === "number" &&
    projectLite.fileCount > 1200;

  if ((pc.frontend || 0) > 40 && (pc.backend_routes || 0) > 10 && crossLayer) {
    baseMin += 1;
    baseMax += 2;
  }

  if (largeProj) baseMax += 2;

  if (keywordHits.noop_docs) {
    baseMin = Math.min(baseMin, 2);
    baseMax = Math.min(baseMax, 4);
  }

  if (
    historicalAvgFiles != null &&
    Number.isFinite(historicalAvgFiles) &&
    historicalAvgFiles > 0
  ) {
    const hMin = Math.max(1, Math.round(historicalAvgFiles * 0.65));
    const hMax = Math.max(hMin + 1, Math.round(historicalAvgFiles * 1.35));
    baseMin = Math.round((baseMin + hMin) / 2);
    baseMax = Math.round((baseMax + hMax) / 2);
  }

  baseMin = clamp(baseMin, 1, 40);
  baseMax = clamp(Math.max(baseMax, baseMin + 1), baseMin + 1, 48);

  return { min: baseMin, max: baseMax };
}

function likelyAffectedPaths({
  keywordHits,
  crossLayer,
  pathHints,
  projectLite,
}) {
  const lines = [];
  const pc = projectLite && projectLite.categories ? projectLite.categories : {};

  if (pathHints.runtime_core || keywordHits.orchestration) {
    lines.push("scripts/runtime/*");
    lines.push("scripts/runtime/orchestration.js");
  }
  if (keywordHits.backend || pc.backend_routes > 0) {
    lines.push("**/routes/** ou **/api/**");
  }
  if (keywordHits.frontend || pc.frontend > 0) {
    lines.push("componentes UI / páginas");
  }
  if (keywordHits.database) {
    lines.push("schema / migrations / queries");
  }

  const uniq = [...new Set(lines)];
  return uniq.slice(0, 8);
}

function inferChangeTypes(keywordHits) {
  const types = [];
  if (keywordHits.refactor) types.push("refactor estrutural");
  if (keywordHits.integration) types.push("integração / IO");
  if (keywordHits.security) types.push("segurança / permissões");
  if (keywordHits.database) types.push("dados / persistência");
  if (!types.length) types.push("alterações localizadas em código");
  return types;
}

module.exports = {
  estimateFileRange,
  likelyAffectedPaths,
  inferChangeTypes,
};
