const path = require("path");
const fs = require("fs");
const { discoverRuns } = require("../lib/runs-discovery");
const { collectPlanDiagnostics } = require("../../execution-plan/diagnostics/plan-diagnostics");
const { diffExecutionPlans } = require("../../execution-plan/diff/plan-diff");
const { loadPlan } = require("../../execution-plan");
const { collectRiskDiagnostics } = require("../../risk-runtime/diagnostics/risk-diagnostics");
const { supportsColor, theme } = require("../render/ansi");

const {
  collectTransactionDiagnostics,
} = require("../../transaction-runtime/diagnostics/collect-transaction-diagnostics");

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

function runInspectPlan(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const withBody = argv.includes("--include-plan");
  const withTxn = argv.includes("--include-transaction");
  const diffArg = argv.find((a) => a.startsWith("--diff="));
  const diffPath = diffArg ? diffArg.slice("--diff=".length).trim() : null;

  const positional = argv.filter(
    (a) =>
      a !== "--json" &&
      a !== "--include-plan" &&
      a !== "--include-transaction" &&
      !a.startsWith("--diff="),
  );
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");
  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const outDir = sel.entry.output_dir;
  const diag = collectPlanDiagnostics(outDir, { includePlanBody: withBody });
  const riskDiag = collectRiskDiagnostics(outDir);

  const txnDiag = withTxn
    ? collectTransactionDiagnostics(outDir, { skip_continuity: json })
    : null;

  let diff = null;
  if (diffPath) {
    const abs = path.isAbsolute(diffPath) ? diffPath : path.resolve(process.cwd(), diffPath);
    if (!fs.existsSync(abs)) {
      console.error(`Ficheiro --diff não encontrado: ${abs}`);
      process.exitCode = 1;
      return;
    }
    try {
      const raw = fs.readFileSync(abs, "utf-8");
      const other = JSON.parse(raw);
      const plan = loadPlan(outDir);
      diff = diffExecutionPlans(plan, other);
    } catch (e) {
      console.error(e.message || e);
      process.exitCode = 1;
      return;
    }
  }

  if (json) {
    const payload = { ...diag, risk: riskDiag };
    if (diff) payload.plan_diff = diff;
    if (payload.plan && !withBody) delete payload.plan;
    if (withTxn && txnDiag) payload.transaction_runtime_inspect = txnDiag;
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Execution Plan — inspect"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(`  plan:       ${diag.plan_present ? "sim" : "não"}`);
  if (diag.lifecycle) {
    console.log(`  lifecycle:  ${diag.lifecycle.state} (terminal: ${diag.lifecycle.is_terminal})`);
    console.log(`  transições: ${diag.lifecycle.transitions_count}`);
  }
  if (diag.fingerprint && diag.fingerprint.plan_content_sha256) {
    console.log(`  fingerprint: ${diag.fingerprint.plan_content_sha256}`);
  }
  console.log(`  validação:  ${diag.structural_validation.ok ? "OK" : "FALHOU"}`);
  if (!diag.structural_validation.ok && diag.structural_validation.errors) {
    for (const e of diag.structural_validation.errors.slice(0, 12)) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }
  if (diag.revision_lineage_issues.length) {
    console.log(t.bold("  lineage:"));
    for (const e of diag.revision_lineage_issues) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }
  if (diag.transition_audit.length) {
    console.log(t.bold("  auditoria de transições:"));
    for (const e of diag.transition_audit.slice(0, 12)) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }
  if (diag.reconciliation) {
    console.log(t.bold("  reconciliation:"));
    console.log(`    status: ${diag.reconciliation.status}`);
    console.log(`    coverage: ${JSON.stringify(diag.reconciliation.coverage)}`);
    if (diag.reconciliation.unexpected_changes && diag.reconciliation.unexpected_changes.length) {
      console.log(t.yellow(`    unexpected: ${diag.reconciliation.unexpected_changes.length}`));
    }
  } else {
    console.log("  reconciliation: (ausente — run antiga ou shadow desligado antes do executor)");
  }
  if (diag.manifest) {
    console.log(t.bold("  manifest:"));
    const a = diag.manifest.artifacts || {};
    console.log(`    execution_plan: ${a.execution_plan || "—"}`);
    console.log(`    reconciliation: ${a.reconciliation || "—"}`);
    console.log(`    validation_targets: ${a.validation_targets || "—"}`);
    console.log(`    validation_manifest: ${a.validation_manifest || "—"}`);
    console.log(`    validation_propagation_manifest: ${a.validation_propagation_manifest || "—"}`);
    console.log(`    dependency_graph: ${a.dependency_graph || "—"}`);
    console.log(`    validation_plan: ${a.validation_plan || "—"}`);
    console.log(`    validation_results: ${a.validation_results || "—"}`);
    console.log(`    validation_cache: ${a.validation_cache || "—"}`);
    console.log(`    validation_runtime_summary: ${a.validation_runtime_summary || "—"}`);
    console.log(`    risk_analysis: ${a.risk_analysis || "—"}`);
    console.log(`    risk_runtime_manifest: ${a.risk_runtime_manifest || "—"}`);
  }
  const vt = diag.validation_targeting;
  if (vt) {
    console.log(t.bold("  validation targeting:"));
    console.log(`    targets: ${vt.validation_targets_present ? "sim" : "não"}`);
    console.log(`    manifest: ${vt.validation_manifest_present ? "sim" : "não"}`);
    if (vt.summary) {
      console.log(`    total_targets: ${vt.summary.total_targets ?? "—"}`);
      console.log(`    validator_types: ${(vt.summary.validator_types || []).slice(0, 12).join(", ") || "—"}`);
    }
    if (vt.scopes_histogram) {
      console.log(`    scopes: file=${vt.scopes_histogram.file} module=${vt.scopes_histogram.module} project=${vt.scopes_histogram.project}`);
    }
    console.log(`    dependency_hints_total: ${vt.dependency_hints_total ?? "—"}`);
    console.log(`    dependency_graph (ficheiro): ${vt.dependency_graph_present ? "sim" : "não"}`);
    console.log(`    impact_expansion em targets: ${vt.targets_with_impact_expansion ?? "—"}`);
    if (vt.reconciliation_impact) {
      console.log(`    reconciliation_impact: ${vt.reconciliation_impact.status || "—"} (unexpected=${vt.reconciliation_impact.unexpected_changes_count}, unmatched=${vt.reconciliation_impact.unmatched_operations_count})`);
    }
  }
  if (riskDiag.risk_analysis_present && riskDiag.summary) {
    console.log(t.bold("  risk (Fase 4.3):"));
    console.log(`    score: ${riskDiag.summary.risk_score} tier: ${riskDiag.summary.risk_tier}`);
    console.log(`    confidence: ${riskDiag.summary.confidence}`);
    if (riskDiag.validation_escalation) {
      console.log(`    validação sugerida: ${riskDiag.validation_escalation.recommended_profile}`);
    }
  } else if (!riskDiag.risk_analysis_present) {
    console.log("  risk: (sem risk-analysis.json — SETUP_BOSS_RISK_ENGINE off ou run anterior)");
  }
  const rrPath = path.join(outDir, "review-results.json");
  if (fs.existsSync(rrPath)) {
    try {
      const rr = JSON.parse(fs.readFileSync(rrPath, "utf8"));
      console.log(t.bold("  review (Fase 4.4):"));
      if (rr.summary) {
        console.log(`    status: ${rr.summary.status} score=${rr.summary.score}`);
      } else {
        console.log("    (review-results sem summary)");
      }
    } catch (_) {
      console.log("  review: review-results.json ilegível");
    }
  }
  if (withTxn && txnDiag) {
    console.log(t.bold("  transaction_runtime (Fase 4.6):"));
    console.log(`    contract_present: ${txnDiag.contract_present ? "sim" : "não"}`);
    if (txnDiag.envelope) {
      console.log(`    checkpoints: ${txnDiag.envelope.checkpoint_count}`);
      console.log(
        `    últimos hooks: ${(txnDiag.envelope.last_hooks || []).join(", ") || "—"}`,
      );
    }
    if (txnDiag.continuity) {
      console.log(`    continuidade.ok: ${txnDiag.continuity.ok}`);
    }
  }
  if (diff) {
    console.log(t.bold("  plan diff (--diff):"));
    console.log(`    ops +${diff.operations_added.length} -${diff.operations_removed.length} ~${diff.operations_modified.length}`);
    if (diff.lifecycle_changes) console.log(`    lifecycle: ${JSON.stringify(diff.lifecycle_changes)}`);
    if (diff.fingerprint_changes) console.log(`    fingerprint mudou`);
  }
}

module.exports = { runInspectPlan };
