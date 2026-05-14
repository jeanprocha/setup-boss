/**
 * Persistência de artefactos de preflight.
 */

const fs = require("fs");
const path = require("path");

function writePreflightArtifacts(outputDir, report) {
  if (!outputDir || !report) return;

  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, "preflight-analysis.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  const md = renderMarkdownSummary(report);
  fs.writeFileSync(path.join(dir, "preflight-summary.md"), md, "utf-8");
}

function renderMarkdownSummary(report) {
  const lines = [];
  lines.push("# Preflight summary");
  lines.push("");
  lines.push(`**Gerado:** ${report.generated_at}`);
  lines.push("");
  lines.push("## Escores");
  lines.push(
    `- **Complexidade:** ${report.complexity.tier} (score ${report.complexity.score})`,
  );
  lines.push(`- **Risco:** ${report.risk.tier} (${report.risk.score_points} pts)`);
  lines.push(
    `- **Correção provável:** ${report.correction.probability_label} — ${report.correction.rationale}`,
  );
  lines.push(`- **Severidade operacional:** ${report.operational_severity}`);
  lines.push("");
  lines.push("## Escopo estimado");
  lines.push(
    `- **Ficheiros:** ${report.scope.estimated_files_min}–${report.scope.estimated_files_max}`,
  );
  lines.push("- **Áreas prováveis:**");
  for (const x of report.scope.likely_affected) lines.push(`  - ${x}`);
  lines.push("- **Tipos de mudança:**");
  for (const x of report.scope.change_types) lines.push(`  - ${x}`);
  lines.push("");
  lines.push("## Prompt / tokens");
  lines.push(
    `- **Chars totais (estimado):** ~${report.prompts.totals.est_prompt_chars_sum}`,
  );
  lines.push(
    `- **Tokens (mid / banda):** ~${report.prompts.totals.est_tokens_sum} (${report.prompts.totals.est_tokens_band_low}–${report.prompts.totals.est_tokens_band_high})`,
  );
  lines.push(`- **Inflação aplicada:** ×${report.prompts.inflation_factor_applied}`);
  lines.push("");
  lines.push("## Custo (heurístico)");
  if (report.cost.pricing_available) {
    lines.push(
      `- **USD:** ~$${report.cost.estimated_cost_usd_mid} (otimista $${report.cost.estimated_cost_usd_low} — pessimista $${report.cost.estimated_cost_usd_high})`,
    );
  } else {
    lines.push(
      "- **USD:** indisponível (defina taxas `*_INPUT_USD_PER_1M` / `*_OUTPUT_USD_PER_1M` por modelo).",
    );
  }
  lines.push("");
  lines.push("## Avisos");
  if (!report.warnings.length) lines.push("- (nenhum)");
  else {
    for (const w of report.warnings) lines.push(`- **${w.code}:** ${w.message}`);
  }
  lines.push("");
  if (report.governance && typeof report.governance === "object") {
    const g = report.governance;
    lines.push("## Governança (runtime)");
    lines.push("");
    lines.push(
      `- **Perfil efectivo:** ${g.profile_resolved ?? "—"}`,
    );
    lines.push(
      `- **Dry-run obrigatório (política):** ${g.dry_run_policy_mandatory === true ? "sim" : "não"} (cumprido pelo fluxo: ${g.dry_run_satisfied_flow === true ? "sim" : "não"})`,
    );
    lines.push(
      `- **Bypass usado nesta run:** ${g.bypass_used_this_run === true ? "sim" : "não"}`,
    );
    lines.push(
      `- **Correções (cap efectivo):** ${g.effective_max_correction_iterations ?? "—"}`,
    );
    lines.push(
      `- **Bloqueadores pré-pipeline:** ${typeof g.policy_violations_blockers === "number" ? g.policy_violations_blockers : String(g.policy_violations_blockers ?? "—")}`,
    );
    lines.push("");
  }
  lines.push("## Premissas");
  for (const b of report.baseline_assumptions) lines.push(`- ${b}`);
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  writePreflightArtifacts,
  renderMarkdownSummary,
};
