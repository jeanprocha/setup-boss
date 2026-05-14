/**
 * @typedef {{
 *  id: string,
 *  category: string,
 *  severity: "info"|"low"|"medium"|"high"|"critical",
 *  outcome: "ok"|"warn"|"fail",
 *  evidence: object,
 *  remediation_hints: string[],
 * }} ReviewInvariantFinding
 */

function finding(id, category, severity, outcome, evidence, remediation_hints = []) {
  return {
    id,
    category,
    severity,
    outcome,
    evidence: evidence && typeof evidence === "object" ? evidence : { detail: evidence },
    remediation_hints: Array.isArray(remediation_hints) ? remediation_hints : [],
  };
}

module.exports = { finding };
