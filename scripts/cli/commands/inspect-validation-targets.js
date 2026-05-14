const path = require("path");
const fs = require("fs");
const { discoverRuns } = require("../lib/runs-discovery");
const {
  collectValidationTargetingDiagnostics,
} = require("../../execution-plan/validation-targeting/diagnostics");
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

function runInspectValidationTargets(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const sampleArg = argv.find((a) => a.startsWith("--sample="));
  const sampleLimit = sampleArg ? parseInt(sampleArg.slice("--sample=".length), 10) : 16;

  const positional = argv.filter((a) => a !== "--json" && !a.startsWith("--sample="));
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");
  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const outDir = sel.entry.output_dir;
  const vt = collectValidationTargetingDiagnostics(outDir, {
    targetsSampleLimit: Number.isFinite(sampleLimit) ? sampleLimit : 16,
  });

  const targetsPath = path.join(outDir, "validation-targets.json");
  let targetsFull = null;
  try {
    if (fs.existsSync(targetsPath)) {
      targetsFull = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
    }
  } catch (_) {
    targetsFull = null;
  }

  if (json) {
    const payload = {
      run_id: sel.entry.run_id,
      output_dir: outDir,
      diagnostics: vt,
      validation_targets: targetsFull,
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const t = theme(supportsColor());
  console.log(t.bold("Validation targeting — inspect"));
  console.log(`  run_id:     ${sel.entry.run_id}`);
  console.log(`  output_dir: ${outDir}`);
  console.log(`  targets.json: ${vt.validation_targets_present ? "sim" : "não"}`);
  console.log(`  manifest.json: ${vt.validation_manifest_present ? "sim" : "não"}`);
  if (vt.generation_phase) console.log(`  fase: ${vt.generation_phase}`);
  if (vt.summary) {
    console.log(`  total_targets: ${vt.summary.total_targets}`);
    console.log(`  unique_files: ${vt.summary.unique_files}`);
    console.log(`  validator_types: ${(vt.summary.validator_types || []).join(", ") || "—"}`);
  }
  if (vt.scopes_histogram) {
    console.log(
      `  scopes: file=${vt.scopes_histogram.file} module=${vt.scopes_histogram.module} project=${vt.scopes_histogram.project}`,
    );
  }
  console.log(`  inferred_validators_union: ${(vt.inferred_validators_union || []).join(", ") || "—"}`);
  console.log(`  dependency_hints_total: ${vt.dependency_hints_total}`);
  if (vt.reconciliation_impact) {
    console.log(t.bold("  reconciliation impact:"));
    console.log(`    status: ${vt.reconciliation_impact.status}`);
    console.log(`    unexpected_changes: ${vt.reconciliation_impact.unexpected_changes_count}`);
    console.log(`    unmatched_operations: ${vt.reconciliation_impact.unmatched_operations_count}`);
  }
  if (vt.targets_sample && vt.targets_sample.length) {
    console.log(t.bold("  sample targets:"));
    for (const row of vt.targets_sample.slice(0, 12)) {
      console.log(`    - ${row.file}`);
      console.log(`      scope=${row.validation_scope} reason=${row.reason}`);
      console.log(`      validators=${(row.inferred_validators || []).join(",")}`);
      const dh = row.dependency_hints || [];
      if (dh.length) console.log(`      hints=${dh.slice(0, 4).map((h) => `${h.kind}:${h.detail}`).join("; ")}`);
    }
  }
}

module.exports = { runInspectValidationTargets };
