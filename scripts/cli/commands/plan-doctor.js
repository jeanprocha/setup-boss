const { discoverRuns } = require("../lib/runs-discovery");
const { collectPlanDiagnostics } = require("../../execution-plan/diagnostics/plan-diagnostics");
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
    return { error: `Prefixo ambíguo "${arg}".` };
  }

  return { error: `Run não encontrada: "${arg}".` };
}

/**
 * plan-doctor: saúde do execution-plan + invariantes de lineage/transitions.
 */
function runPlanDoctor(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");
  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const diag = collectPlanDiagnostics(sel.entry.output_dir);
  const structuralOk = diag.structural_validation && diag.structural_validation.ok;
  const lineageOk = diag.revision_lineage_issues.length === 0;
  const auditOk = diag.transition_audit.length === 0;
  const ok = structuralOk && lineageOk && auditOk && diag.plan_present;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok,
          run_id: sel.entry.run_id,
          output_dir: sel.entry.output_dir,
          checks: {
            plan_present: diag.plan_present,
            structural_ok: structuralOk,
            lineage_ok: lineageOk,
            transition_audit_ok: auditOk,
          },
          diagnostics: diag,
        },
        null,
        2,
      ),
    );
    process.exitCode = ok ? 0 : 1;
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Execution Plan — plan-doctor"));
  console.log(`  run_id: ${sel.entry.run_id}`);
  const lines = [
    ["plan_present", diag.plan_present],
    ["structural", structuralOk],
    ["lineage", lineageOk],
    ["transition_audit", auditOk],
  ];
  for (const [k, v] of lines) {
    console.log(`  ${k}: ${v ? t.green("ok") : t.red("falhou")}`);
  }
  if (!structuralOk && diag.structural_validation.errors) {
    console.log(t.bold("  erros estruturais:"));
    for (const e of diag.structural_validation.errors.slice(0, 15)) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }
  if (!lineageOk) {
    for (const e of diag.revision_lineage_issues) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }
  if (!auditOk) {
    for (const e of diag.transition_audit.slice(0, 15)) {
      console.log(`    - ${e.code}: ${e.message}`);
    }
  }

  process.exitCode = ok ? 0 : 1;
}

module.exports = { runPlanDoctor };
