/**
 * Inspect correction-runtime artefacts for a run directory (Fase 4.5).
 */

const { discoverRuns } = require("../lib/runs-discovery");
const { supportsColor, theme } = require("../render/ansi");
const { collectCorrectionDiagnostics } = require("../../correction-runtime/diagnostics/correction-diagnostics");

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
  const prefixes = entries.filter((e) => String(e.run_id).toLowerCase().startsWith(lowered));
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

function runInspectCorrection(argv, { repoRoot = null } = {}) {
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
  const diag = collectCorrectionDiagnostics(outDir);
  const txnDiag = withTxn
    ? collectTransactionDiagnostics(outDir, { skip_continuity: json })
    : null;

  if (json) {
    const payload = {
          run_id: sel.entry.run_id,
          output_dir: outDir,
          ...diag,
        };
    if (withTxn && txnDiag) payload.transaction_runtime_inspect = txnDiag;
    console.log(
      JSON.stringify(
        payload,
        null,
        2,
      ),
    );
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Correction runtime — inspect (Fase 4.5)"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(`  SETUP_BOSS_CORRECTION_ENGINE (env actual): ${diag.correction_engine_env}`);
  const a = diag.artifacts;
  console.log(`  correction-analysis.json:          ${a.correction_analysis_present ? "sim" : "não"}`);
  console.log(`  correction-memory:                 ${a.correction_memory_present ? "sim" : "não"}`);
  console.log(`  correction-lineage.json:           ${a.correction_lineage_present ? "sim" : "não"}`);
  console.log(`  correction-runtime-manifest.json:  ${a.correction_runtime_manifest_present ? "sim" : "não"}`);

  if (diag.correction_analysis_summary) {
    const s = diag.correction_analysis_summary;
    console.log(t.bold("  summary.correction "));
    console.log(`    classification:               ${s.failure_classification}`);
    console.log(`    retry_recommended:            ${s.retry_recommended}`);
    console.log(`    retry_probability:            ${s.retry_probability}`);
    console.log(`    suppress_retry (summary flag): ${s.suppress_retry}`);
    console.log(`    requires_manual_intervention:   ${s.requires_manual_intervention}`);
    console.log(`    requires_runtime_escalation:    ${s.requires_runtime_escalation}`);
    console.log(`    retry_band_hint:                ${s.retry_band_hint || "—"}`);
    if (diag.failure_signature_sha256)
      console.log(`    signature_sha256:               ${diag.failure_signature_sha256}`);
    if (s.suppressed_before_llm != null)
      console.log(`    suppressed_before_llm:          ${s.suppressed_before_llm}`);
  }

  if (diag.memory_streak_hint != null)
    console.log(`  correction-memory streak identical Trigger: ${diag.memory_streak_hint}`);

  if (diag.classification_preview && diag.classification_preview.length) {
    console.log(t.bold("  buckets (resumo):"));
    for (const row of diag.classification_preview.slice(0, 10)) {
      console.log(`    - ${row.classification}: ${row.count}`);
    }
  }

  if (diag.correction_analysis && Array.isArray(diag.correction_analysis.correction_targets)) {
    const targets = diag.correction_analysis.correction_targets;
    console.log(t.bold("  remediation targets (top 12):"));
    for (const tr of targets.slice(0, 12)) {
      console.log(`    - [${tr.priority}] ${tr.kind}/${tr.id} — ${String(tr.hint || "").slice(0, 200)}`);
    }
  }

  if (diag.lineage_last && typeof diag.lineage_last === "object") {
    const ln = diag.lineage_last;
    console.log(t.bold("  lineage último node:"));
    console.log(`    node_id:         ${ln.correction_lineage_node_id}`);
    console.log(`    outcome:        ${ln.outcome}`);
    console.log(`    retry_signature: ${String(ln.failure_signature_sha256 || "").slice(0, 32)}`);
  }

  if (withTxn && txnDiag) {
    console.log(t.bold("  transaction_runtime (Fase 4.6):"));
    console.log(`    contract_present: ${txnDiag.contract_present ? "sim" : "não"}`);
    if (txnDiag.envelope) {
      console.log(`    checkpoints: ${txnDiag.envelope.checkpoint_count}`);
    }
  }

  console.log(`\n  JSON completo com --json (inclui correction_analysis crua quando presente)`);
}

module.exports = { runInspectCorrection };
