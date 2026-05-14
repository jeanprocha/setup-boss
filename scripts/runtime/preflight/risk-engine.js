/**
 * Motor de risco heurístico (LOW → CRITICAL).
 */

function classifyRisk(points) {
  if (points <= 5) return "LOW";
  if (points <= 10) return "MEDIUM";
  if (points <= 16) return "HIGH";
  return "CRITICAL";
}

function computeRiskPoints(input) {
  const {
    estimatedFilesMax,
    crossLayer,
    pathHints,
    keywordHits,
    projectLite,
    historical,
    inflationHint,
  } = input;

  let pts = 0;

  if (estimatedFilesMax >= 14) pts += 4;
  else if (estimatedFilesMax >= 9) pts += 3;
  else if (estimatedFilesMax >= 6) pts += 2;

  if (crossLayer) pts += 3;

  if (pathHints.runtime_core) pts += 4;
  if (pathHints.security_sensitive || keywordHits.security) pts += 3;

  if (keywordHits.integration) pts += 2;
  if (keywordHits.refactor) pts += 2;

  const pc = projectLite && projectLite.categories ? projectLite.categories : {};
  if ((pc.setup_boss_runtime || 0) > 0 && pathHints.runtime_core) pts += 2;

  const agg = historical && historical.aggregates ? historical.aggregates : {};
  const avgCorr = agg.avg_correction_iterations;
  if (avgCorr != null && avgCorr >= 2) pts += 3;
  else if (avgCorr != null && avgCorr >= 1.3) pts += 2;

  const ph =
    historical && historical.problem_history ? historical.problem_history : {};
  if (ph.recent_errors >= 10) pts += 3;
  else if (ph.recent_errors >= 4) pts += 2;

  if (
    inflationHint != null &&
    typeof inflationHint === "number" &&
    inflationHint > 0.72
  ) {
    pts += 2;
  }

  return {
    points: pts,
    tier: classifyRisk(pts),
  };
}

module.exports = {
  computeRiskPoints,
  classifyRisk,
};
