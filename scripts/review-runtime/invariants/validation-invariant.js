const { finding } = require("./invariant-types");

function validationFailed(summary) {
  if (!summary || typeof summary !== "object") return false;
  if (summary.overall === "fail" || summary.overall === "failed") return true;
  if (summary.status === "fail" || summary.status === "failed") return true;
  const failedValidators = Number(summary.failed_validators);
  if (!Number.isNaN(failedValidators) && failedValidators > 0) return true;
  if (summary.failed_count > 0) return true;
  if (summary.passed === false) return true;
  return false;
}

function riskTierCritical(risk) {
  if (!risk || typeof risk !== "object") return false;
  const t = String(risk.tier || risk.risk_tier || "").toLowerCase();
  if (t === "critical") return true;
  const score = Number(risk.score);
  const critMin = Number(process.env.SETUP_BOSS_RISK_TIER_CRITICAL_MIN || 85);
  if (!Number.isNaN(score) && score >= critMin) return true;
  return false;
}

function evaluateValidationInvariant(snapshot) {
  const out = [];
  const vr = snapshot.validation_results;
  const risk = snapshot.risk_analysis && snapshot.risk_analysis.summary
    ? snapshot.risk_analysis.summary
    : snapshot.risk_analysis;

  const failed = validationFailed(
    vr && vr.summary ? vr.summary : vr && typeof vr === "object" ? vr : null,
  );

  if (failed && riskTierCritical(risk)) {
    out.push(
      finding(
        "validation_invariant.failed_with_critical_risk",
        "validation",
        "critical",
        "fail",
        {
          validation_summary: vr && vr.summary ? vr.summary : null,
          risk_summary: risk || null,
        },
        [
          "Corrigir falhas de validação antes de aceitar risco crítico.",
          "Reduzir escopo ou aplicar validators adicionais.",
        ],
      ),
    );
  } else if (failed) {
    out.push(
      finding(
        "validation_invariant.failed",
        "validation",
        "high",
        "warn",
        { validation_summary: vr && vr.summary ? vr.summary : null },
        ["Reexecutar validation-runtime ou corrigir causas reportadas."],
      ),
    );
  }

  return out;
}

module.exports = { evaluateValidationInvariant, validationFailed, riskTierCritical };
