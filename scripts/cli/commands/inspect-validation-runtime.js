/**
 * Inspect validation runtime artefacts for a run directory (Fase 4.2).
 */

const path = require("path");
const fs = require("fs");
const { discoverRuns } = require("../lib/runs-discovery");
const { readJsonSafe } = require("../lib/json-io");
const {
  collectValidationRuntimeDiagnostics,
} = require("../../validation-runtime/diagnostics/validation-runtime-diagnostics");
const { VALIDATION_RESULTS_FILENAME } = require("../../validation-runtime/constants");
const {
  collectValidationExecutionInspect,
} = require("../../execution-plan/validation-targeting/validation-observability");
const {
  VALIDATION_RUNTIME_SUMMARY_FILENAME,
} = require("../../execution-plan/validation-targeting/constants");
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

function runInspectValidationRuntime(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const withTxn = argv.includes("--include-transaction");
  const positional = argv.filter(
    (a) => a !== "--json" && a !== "--include-transaction",
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
  const diag = collectValidationRuntimeDiagnostics(outDir);
  const ve = collectValidationExecutionInspect(outDir);
  const riskDiag = collectRiskDiagnostics(outDir);
  const txnDiag = withTxn
    ? collectTransactionDiagnostics(outDir, { skip_continuity: json })
    : null;

  const resultsPath = path.join(outDir, VALIDATION_RESULTS_FILENAME);
  let resultsFull = null;
  if (!ve.phase410_summary_present) {
    resultsFull = readJsonSafe(resultsPath, 512_000, null);
  }

  if (json) {
    const payload = {
      run_id: sel.entry.run_id,
      output_dir: outDir,
      diagnostics: diag,
      validation_execution: ve.phase410_summary_present ? ve : null,
      graph_aware_summary: ve.graph_aware_summary || null,
      risk: riskDiag,
      validation_results:
        ve.phase410_summary_present && ve.summary
          ? {
              omitted_streams: true,
              summary: ve.summary,
              fingerprint_short: ve.fingerprint_short,
              counts: ve.counts,
            }
          : resultsFull,
    };
    if (withTxn && txnDiag) payload.transaction_runtime_inspect = txnDiag;
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Validation runtime — inspect"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(
    `  validation-results.json: ${diag.validation_results_present ? "sim" : "não"}${diag.validation_results_truncated ? " (diagnostics limitados — ficheiro grande)" : ""}`,
  );
  console.log(`  ${VALIDATION_RUNTIME_SUMMARY_FILENAME}: ${ve.phase410_summary_present ? "sim" : "não"}`);
  console.log(`  validation-runtime-manifest.json: ${diag.validation_runtime_manifest_present ? "sim" : "não"}`);

  if (ve.phase410_summary_present && ve.summary) {
    const s = ve.summary;
    console.log(t.bold("  Validation Runtime (execution-plan / Fase 4.10)"));
    console.log(`    commands (plan): ${ve.commands_total ?? "—"}`);
    console.log(`    validators_executed: ${ve.counts && ve.counts.validators_executed != null ? ve.counts.validators_executed : "—"}`);
    console.log(`    passed: ${s.passed ?? "—"}`);
    console.log(`    failed: ${s.failed ?? "—"}`);
    console.log(`    unresolved: ${s.unresolved ?? "—"}`);
    console.log(`    cache hits: ${s.cache_hits ?? "—"}`);
    console.log(`    cache reused: ${s.cache_reused ?? "—"}`);
    console.log(`    duration_ms: ${s.total_duration_ms ?? "—"}`);
    console.log(`    fingerprint: ${ve.fingerprint_short ?? "—"}`);
    console.log(`    validation-cache.json: ${ve.validation_cache_present ? "sim" : "não"}`);
    if (ve.graph_aware_summary && ve.graph_aware_summary.graph_present) {
      const g = ve.graph_aware_summary;
      console.log(t.bold("  Graph-aware planning (4.10.7)"));
      console.log(
        `    candidates: ${g.graph_candidates_total ?? "—"} reverse_imports: ${g.reverse_imports_total ?? "—"} linked_tests: ${g.linked_tests_total ?? "—"}`,
      );
      console.log(`    graph_fp: ${g.graph_fingerprint_sha256 ? `${String(g.graph_fingerprint_sha256).slice(0, 12)}…` : "—"} graph_aware_payload: ${g.graph_aware_payload_sha256_short ?? "—"}`);
      if (g.plan_risk_hints_total != null) {
        console.log(`    plan risk_hints (aggregados): ${g.plan_risk_hints_total}`);
      }
    }
  } else if (diag.summary) {
    console.log(`  summary.status: ${diag.summary.status}`);
    console.log(`  executed_validators: ${diag.summary.executed_validators}`);
    console.log(`  failed_validators: ${diag.summary.failed_validators}`);
    console.log(`  cache_hits (results): ${diag.cache_hits}`);
  }
  if (diag.graph_fingerprint_sha256) {
    console.log(`  graph_fingerprint_sha256: ${diag.graph_fingerprint_sha256}`);
  }
  console.log(`  cache_entries_estimate: ${diag.cache_entries_estimate}`);
  if (diag.failures_short && diag.failures_short.length) {
    console.log(t.bold("  falhas (amostra):"));
    for (const f of diag.failures_short) {
      console.log(`    - ${f.validator_type} (${f.validator_id}) ${f.status}`);
      if (f.errors && f.errors.length) console.log(`      ${f.errors.join("; ")}`);
    }
  }
  if (riskDiag.risk_analysis_present && riskDiag.summary) {
    console.log(t.bold("  cruzamento risk → validation:"));
    console.log(`    risk_tier: ${riskDiag.summary.risk_tier} (score ${riskDiag.summary.risk_score})`);
    if (riskDiag.validation_escalation) {
      console.log(`    escalação sugerida: perfil ${riskDiag.validation_escalation.recommended_profile}`);
    }
  }
  const rrPath = path.join(outDir, "review-results.json");
  if (fs.existsSync(rrPath)) {
    try {
      const rr = JSON.parse(fs.readFileSync(rrPath, "utf8"));
      console.log(t.bold("  cruzamento validation → review:"));
      if (rr.summary) {
        console.log(`    review status ${rr.summary.status} (inspect-review)`);
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (withTxn && txnDiag) {
    console.log(t.bold("  transaction_runtime (Fase 4.6):"));
    console.log(`    contract_present: ${txnDiag.contract_present ? "sim" : "não"}`);
    if (txnDiag.envelope && (txnDiag.envelope.last_hooks || []).length) {
      console.log(
        `    últimos hooks: ${(txnDiag.envelope.last_hooks || []).join(", ")}`,
      );
    }
  }
  try {
    const { getCorrectionEngineMode } = require("../../correction-runtime/feature-flags");
    console.log(`  SETUP_BOSS_CORRECTION_ENGINE (env actual): ${getCorrectionEngineMode()}`);
    console.log("  cross-ref correction: usar `inspect-correction` após modo guided/active");
  } catch (_) {}
}

module.exports = { runInspectValidationRuntime };
