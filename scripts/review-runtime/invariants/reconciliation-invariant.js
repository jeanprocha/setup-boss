const { finding } = require("./invariant-types");

const UNEXPECTED_THRESHOLD = Math.max(
  0,
  Math.floor(Number(process.env.SETUP_BOSS_REVIEW_RECON_UNEXPECTED_MAX || "0")),
);

function evaluateReconciliationInvariant(snapshot) {
  const out = [];
  const recon = snapshot.reconciliation;
  if (!recon || typeof recon !== "object") return out;

  const unexpected = recon.coverage && typeof recon.coverage === "object"
    ? Number(recon.coverage.unexpected) || 0
    : Array.isArray(recon.unexpected_changes)
      ? recon.unexpected_changes.length
      : 0;

  const threshold = UNEXPECTED_THRESHOLD;
  if (unexpected > threshold) {
    out.push(
      finding(
        "reconciliation_invariant.unexpected_changes",
        "reconciliation",
        unexpected > 3 ? "high" : "medium",
        "fail",
        {
          unexpected_changes: unexpected,
          threshold,
          reconciliation_status: recon.status || null,
        },
        [
          "Alinhar executor-changes.json com as operações FILE_SCOPE do execution plan.",
          "Regenerar execution-reconciliation.json após corrigir o plano ou o executor.",
        ],
      ),
    );
  } else if (recon.status === "divergent" && unexpected > 0) {
    out.push(
      finding(
        "reconciliation_invariant.divergent",
        "reconciliation",
        "medium",
        "warn",
        { status: recon.status, unexpected_changes: unexpected },
        ["Rever paths não planeados antes de merge."],
      ),
    );
  }

  return out;
}

module.exports = { evaluateReconciliationInvariant };
