/**
 * Fator: critical_paths (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

const CRITICAL_SEGMENTS =
  /(\/|^)(infra|infrastructure|deploy|deployment|migration|migrations|auth|authentication|authorization|security|k8s|helm|terraform|docker)\b|(^|\/)(config|configs)(\/|\.)/i;

function touchesCriticalPath(relPath) {
  const p = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  return CRITICAL_SEGMENTS.test(p) || /\.env($|\.)|credential|secret/i.test(p);
}

/**
 * @param {object} ctx
 */
function evaluateCriticalPaths(ctx) {
  const changes = Array.isArray(ctx.executorChanges) ? ctx.executorChanges : [];
  const ops = ctx.plan && Array.isArray(ctx.plan.operations) ? ctx.plan.operations : [];

  const hitPaths = new Set();
  for (const ch of changes) {
    if (ch && ch.path && touchesCriticalPath(ch.path)) hitPaths.add(String(ch.path));
  }
  for (const op of ops) {
    const f = op && op.file != null ? op.file : op && op.path;
    if (f && touchesCriticalPath(f)) hitPaths.add(String(f));
  }

  const paths = [...hitPaths].sort((a, b) => a.localeCompare(b));
  const n = paths.length;
  let severity = "low";
  if (n >= 4) severity = "critical";
  else if (n >= 2) severity = "high";
  else if (n === 1) severity = "moderate";

  const score = n === 0 ? 10 : baseScoreFromSeverity(severity);

  return {
    factor_id: "critical_paths.v1",
    type: "critical_paths",
    severity,
    score,
    weight: 1,
    source: "execution-plan.json+executor-changes.json",
    reason:
      n === 0
        ? "Nenhum caminho crítico heurístico identificado."
        : `${n} caminho(s) com marcadores de infra/deploy/auth/config.`,
    evidence: {
      critical_hits: n,
      paths: paths.slice(0, 32),
    },
    metadata: {},
  };
}

module.exports = { evaluateCriticalPaths };
