/**
 * Inspect transaction-runtime artefacts (Fase 4.6).
 */

const { discoverRuns } = require("../lib/runs-discovery");
const { supportsColor, theme } = require("../render/ansi");

const {
  collectTransactionDiagnostics,
} = require("../../transaction-runtime/diagnostics/collect-transaction-diagnostics");
const { buildRecoveryAnalysis } = require("../../transaction-runtime/recovery-engine");
const { buildRollbackPlan } = require("../../transaction-runtime/rollback-planning");

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

function runInspectTransaction(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const full = argv.includes("--full-contract");

  const positional = argv.filter(
    (a) => a !== "--json" && a !== "--full-contract",
  );
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");

  const t = theme(supportsColor());

  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const outDir = sel.entry.output_dir;
  const txn = collectTransactionDiagnostics(outDir, {
    skip_continuity: false,
    include_contract_body: full,
  });

  const recoveryFresh = buildRecoveryAnalysis(outDir, { deep: true });
  const rollbackFresh = buildRollbackPlan(outDir);

  if (json) {
    const payload = {
      run_id: sel.entry.run_id,
      output_dir: outDir,
      transaction: txn,
      recovery_refresh: recoveryFresh,
      rollback_refresh: rollbackFresh,
    };

    console.log(JSON.stringify(payload, null, 2));

    return;
  }

  console.log(t.bold("Transaction runtime — inspect (Fase 4.6)"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(
    `  contract: ${txn.contract_present ? t.green("sim") : "não"}`,
  );
  console.log(`  telemetry: ${txn.telemetry_log_present ? "sim" : "não"}`);
  console.log(
    `  último snapshot execution-snapshot.json: ${txn.latest_snapshot_present ? "sim" : "não"}`,
  );

  if (txn.envelope) {
    console.log(`  transaction_id: ${txn.envelope.transaction_id || "—"}`);
    console.log(`  summary.status: ${txn.envelope.summary?.status ?? "—"}`);
    console.log(`  checkpoints: ${txn.envelope.checkpoint_count}`);
    console.log(`  últimos hooks: ${(txn.envelope.last_hooks || []).join(", ") || "—"}`);
  } else if (!txn.contract_present) {
    console.log(
      t.dim(
        "  Contract ausente ou SETUP_BOSS_TRANSACTION_RUNTIME=off na execução (só aparece artefactos quando shadow/active).",
      ),
    );
  }

  if (txn.continuity && typeof txn.continuity.ok === "boolean") {
    const ok = txn.continuity.ok;
    console.log(
      `  continuidade (FSM+manifest): ${ok ? t.green(String(ok)) : String(ok)}`,
    );
    if (!ok && txn.continuity.fsm && Array.isArray(txn.continuity.fsm.assertions)) {
      const failing = txn.continuity.fsm.assertions.find((x) => x && x.ok === false);
      if (failing && failing.detail === undefined && failing.from) {
        console.log(
          `    última falha de transição: ${failing.from} → ${failing.to}`,
        );
      }
    }
  }

  console.log(t.bold("\nRecovery (refresh):"));
  console.log(`  recovery_possible: ${recoveryFresh.recovery_possible}`);
  console.log(`  próximo_hint: ${recoveryFresh.resume_assessment?.next_phase ?? "—"}`);

  console.log(t.bold("\nRollback (plano):"));
  console.log(`  rollback_possible: ${rollbackFresh.rollback_possible}`);
  console.log(`  candidatos count: ${(rollbackFresh.candidates || []).length}`);
}

module.exports = { runInspectTransaction };
