/**
 * Fator: mutation_scope (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

/**
 * @param {object} ctx
 */
function evaluateMutationScope(ctx) {
  const changes = Array.isArray(ctx.executorChanges) ? ctx.executorChanges : [];
  const paths = [];
  for (const ch of changes) {
    if (ch && ch.path != null) paths.push(String(ch.path));
  }
  const unique = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  const n = unique.length;

  let scopeBand = "file";
  if (n >= 12) scopeBand = "project";
  else if (n >= 5) scopeBand = "module";

  let severity = "low";
  if (n >= 25) severity = "critical";
  else if (n >= 15) severity = "high";
  else if (n >= 8) severity = "moderate";

  const score = baseScoreFromSeverity(severity);

  return {
    factor_id: "mutation_scope.v1",
    type: "mutation_scope",
    severity,
    score,
    weight: 1,
    source: "executor-changes.json",
    reason: `Alterações em ${n} ficheiro(s) distintos; banda de escopo ${scopeBand}.`,
    evidence: {
      distinct_files: n,
      scope_band: scopeBand,
      sample_paths: unique.slice(0, 24),
    },
    metadata: {},
  };
}

module.exports = { evaluateMutationScope };
