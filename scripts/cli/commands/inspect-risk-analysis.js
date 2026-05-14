/**
 * Inspect risk-analysis / risk-runtime-manifest (Fase 4.3).
 */

const path = require("path");
const fs = require("fs");
const { discoverRuns } = require("../lib/runs-discovery");
const { collectRiskDiagnostics } = require("../../risk-runtime/diagnostics/risk-diagnostics");
const { supportsColor, theme } = require("../render/ansi");

function resolveInspectSelection(entries, rawArg) {
  const arg = String(rawArg || "").trim();
  if (!entries.length) return { error: "Nenhuma run descoberta no índice." };

  if (!arg || /^latest$/i.test(arg)) {
    return { entry: entries[0], index: 0 };
  }

  if (/^\d+$/.test(arg)) {
    const idx = parseInt(arg, 10);
    if (idx < 0 || idx >= entries.length) {
      return {
        error: `Índice ${idx} fora do intervalo (0–${entries.length - 1}).`,
      };
    }
    return { entry: entries[idx], index: idx };
  }

  const exact = entries.find((e) => e.run_id === arg);
  if (exact) return { entry: exact, index: entries.indexOf(exact) };

  const lowered = arg.toLowerCase();
  const prefixes = entries.filter((e) =>
    String(e.run_id).toLowerCase().startsWith(lowered),
  );
  if (prefixes.length === 1) {
    return { entry: prefixes[0], index: entries.indexOf(prefixes[0]) };
  }
  if (prefixes.length > 1) {
    return {
      error: `Prefixo ambíguo "${arg}".`,
    };
  }

  return { error: `Run não encontrada: "${arg}".` };
}

function runInspectRiskAnalysis(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => a !== "--json");
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");
  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const outDir = sel.entry.output_dir;
  const diag = collectRiskDiagnostics(outDir);

  if (json) {
    console.log(
      JSON.stringify(
        {
          run_id: sel.entry.run_id,
          output_dir: outDir,
          ...diag,
        },
        null,
        2,
      ),
    );
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Risk analysis — inspect"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(`  risk-analysis.json: ${diag.risk_analysis_present ? "sim" : "não"}`);
  console.log(`  risk-runtime-manifest.json: ${diag.risk_runtime_manifest_present ? "sim" : "não"}`);
  if (diag.summary) {
    console.log(`  risk_score: ${diag.summary.risk_score}`);
    console.log(`  risk_tier:  ${diag.summary.risk_tier}`);
    console.log(`  confidence: ${diag.summary.confidence}`);
    console.log(`  requires_review: ${diag.summary.requires_review}`);
    console.log(`  requires_extended_validation: ${diag.summary.requires_extended_validation}`);
  }
  if (diag.validation_escalation) {
    console.log(t.bold("  validação (recomendado):"));
    console.log(`    perfil sugerido: ${diag.validation_escalation.recommended_profile}`);
    console.log(`    strict_policy_escalation: ${diag.validation_escalation.strict_policy_escalation}`);
    console.log(`    extended_telemetry: ${diag.validation_escalation.extended_telemetry}`);
  }
  if (diag.review_hints) {
    console.log(t.bold("  review_hints:"));
    for (const [k, v] of Object.entries(diag.review_hints)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (diag.propagation_graph) {
    console.log(t.bold("  propagation (camadas):"));
    for (const [layer, row] of Object.entries(diag.propagation_graph)) {
      if (row && typeof row === "object") {
        console.log(`    ${layer}: tier=${row.tier} score=${row.score}`);
      }
    }
  }
  if (diag.factors && diag.factors.length) {
    console.log(t.bold("  factors (resumo):"));
    for (const f of diag.factors.slice(0, 10)) {
      console.log(`    - ${f.type} [${f.severity}] score=${f.score} — ${f.reason}`);
    }
    if (diag.factors.length > 10) console.log(`    … +${diag.factors.length - 10}`);
  }
  if (diag.recommendations && diag.recommendations.length) {
    console.log(t.bold("  recommendations:"));
    for (const r of diag.recommendations.slice(0, 8)) {
      console.log(`    - ${r}`);
    }
  }
  if (diag.runtime_instability_hint) {
    console.log(t.bold("  runtime instability:"));
    console.log(
      `    correction_iterations: ${diag.runtime_instability_hint.correction_iterations ?? "—"}`,
    );
  }
  const rrPath = path.join(outDir, "review-results.json");
  if (fs.existsSync(rrPath)) {
    try {
      const rr = JSON.parse(fs.readFileSync(rrPath, "utf8"));
      console.log(t.bold("  deterministic review (cross-ref):"));
      if (rr.summary) {
        console.log(`    ${rr.summary.status} score=${rr.summary.score} (ver inspect-review)`);
      }
    } catch (_) {
      /* ignore */
    }
  }
  try {
    const { getCorrectionEngineMode } = require("../../correction-runtime/feature-flags");
    console.log(`  SETUP_BOSS_CORRECTION_ENGINE (env actual): ${getCorrectionEngineMode()}`);
    console.log("  cross-ref correction: `inspect-correction` (artefactos runtime-guided)");
  } catch (_) {}
}

module.exports = { runInspectRiskAnalysis };
