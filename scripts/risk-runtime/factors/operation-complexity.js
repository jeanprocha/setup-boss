/**
 * Fator: operation_complexity (Fase 4.3).
 */

const { baseScoreFromSeverity } = require("../policies/risk-policies");

/**
 * @param {object} ctx
 */
function evaluateOperationComplexity(ctx) {
  const ops = ctx.plan && Array.isArray(ctx.plan.operations) ? ctx.plan.operations : [];
  const n = ops.length;

  let largeReplace = 0;
  const modules = new Set();
  for (const op of ops) {
    const rep = op && op.replace != null ? String(op.replace) : "";
    if (rep.length > 4000) largeReplace += 1;
    const f = op && op.file != null ? String(op.file) : "";
    if (f) {
      const seg = f.split(/[/\\]/).filter(Boolean)[0];
      if (seg) modules.add(seg);
    }
  }

  let severity = "low";
  if (n >= 20 || largeReplace >= 3 || modules.size >= 8) severity = "critical";
  else if (n >= 12 || largeReplace >= 2 || modules.size >= 5) severity = "high";
  else if (n >= 6 || largeReplace >= 1 || modules.size >= 3) severity = "moderate";

  const score = n === 0 && !largeReplace ? 8 : baseScoreFromSeverity(severity);

  return {
    factor_id: "operation_complexity.v1",
    type: "operation_complexity",
    severity,
    score,
    weight: 1,
    source: "execution-plan.json",
    reason: `${n} operações; replace grande: ${largeReplace}; módulos raiz distintos: ${modules.size}.`,
    evidence: {
      operations: n,
      large_replace: largeReplace,
      distinct_root_segments: [...modules].sort((a, b) => a.localeCompare(b)),
    },
    metadata: {},
  };
}

module.exports = { evaluateOperationComplexity };
