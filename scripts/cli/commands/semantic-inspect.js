/**
 * setup-boss semantic inspect — Fase 4.8.8 (diagnóstico só leitura).
 */

const path = require("path");
const fs = require("fs");
const { discoverRuns } = require("../lib/runs-discovery");
const {
  generateSemanticDiagnosticsReport,
  SEMANTIC_DIAGNOSTICS_FILENAME,
} = require("../../semantic-dependency-runtime/diagnostics/semantic-diagnostics-engine");
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

function printHumanReport(report, opts = {}) {
  const noWrite = Boolean(opts.noWrite);
  const t = theme(supportsColor());
  console.log(t.bold("Semantic runtime — inspect"));
  console.log(`  output_dir: ${report.output_dir}`);
  console.log(`  schema:     ${report.schema_version}`);

  const ap = report.artifacts_presence || {};
  console.log(t.bold("\nArtefactos:"));
  for (const k of Object.keys(ap).sort()) {
    console.log(`  ${k}: ${ap[k] ? "sim" : "não"}`);
  }

  const gs = report.graph_summary || {};
  console.log(t.bold("\nGrafo:"));
  console.log(
    `  dependency-graph: nodes=${gs.dependency_graph && gs.dependency_graph.nodes_count} validation_ok=${gs.dependency_graph && gs.dependency_graph.validation_ok}`,
  );
  console.log(
    `  graph-snapshot:   present=${gs.graph_snapshot && gs.graph_snapshot.present} validation_ok=${gs.graph_snapshot && gs.graph_snapshot.validation_ok}`,
  );
  console.log(`  unresolved_imports: ${gs.unresolved_imports_count || 0}`);

  const ov = report.overlay_summary || {};
  console.log(t.bold("\nOverlay / propagação:"));
  console.log(`  impacted_nodes: ${ov.impacted_nodes_count}`);
  console.log(`  impacted_edges: ${ov.impacted_edges_count}`);
  const cc = ov.propagation_fingerprint_consistency || {};
  if ((cc.inconsistencies_sorted || []).length) {
    console.log(t.bold("  inconsistências fingerprint projecção↔grafo:"));
    for (const line of cc.inconsistencies_sorted) console.log(`    - ${line}`);
  }

  const lim = report.limits_applied || {};
  if (Array.isArray(lim.explanations_sorted) && lim.explanations_sorted.length) {
    console.log(t.bold("\nLimites (expansão):"));
    for (const line of lim.explanations_sorted.slice(0, 12)) {
      console.log(`  - ${line}`);
    }
    if (lim.explanations_sorted.length > 12) {
      console.log(`  … +${lim.explanations_sorted.length - 12}`);
    }
  }

  const inc = report.inconsistencies_sorted || [];
  if (inc.length) {
    console.log(t.bold("\nInconsistências / validação:"));
    for (const line of inc.slice(0, 16)) console.log(`  - ${line}`);
    if (inc.length > 16) console.log(`  … +${inc.length - 16}`);
  }

  const ri = report.runtime_integrations_summary || {};
  console.log(t.bold("\nIntegrações runtime (env actual):"));
  const em = ri.env_modes || {};
  for (const k of Object.keys(em).sort()) {
    console.log(`  ${k}: ${em[k]}`);
  }
  console.log(t.bold("  Resumo por artefacto:"));
  for (const row of ri.integrations_sorted || []) {
    const rt = row.runtime != null ? row.runtime : "?";
    const mode = row.manifest_propagation_mode != null ? row.manifest_propagation_mode : row.propagation_mode;
    const cls = row.semantic_classification != null ? row.semantic_classification : "";
    console.log(
      `    [${rt}] present=${Boolean(row.artifact_present !== undefined ? row.artifact_present : row.artifact_block_present)} mode=${mode || "-"} class=${cls || "-"}`,
    );
  }

  const gsc = report.governance_semantic_continuity_snapshot;
  if (gsc && typeof gsc === "object") {
    console.log(t.bold("\nGovernance × semantic continuity:"));
    console.log(
      `  status=${gsc.status} curr_sem_fp=${gsc.semantic_continuity_fingerprint_prefix || "-"} bound_sem_fp=${gsc.bound_semantic_prefix || "-"}`,
    );
    const srs = Array.isArray(gsc.stale_reasons_sorted) ? gsc.stale_reasons_sorted : [];
    if (srs.length) {
      console.log(t.bold("  stale reasons:"));
      for (const line of srs.slice(0, 12)) console.log(`    - ${line}`);
      if (srs.length > 12) console.log(`    … +${srs.length - 12}`);
    }
    const pg = Array.isArray(gsc.propagation_divergence_sorted) ? gsc.propagation_divergence_sorted : [];
    if (pg.length) {
      console.log(t.bold("  propagation deltas:"));
      for (const row of pg.slice(0, 8)) console.log(`    - ${JSON.stringify(row)}`);
    }
  }

  const tel = report.telemetry_summary || {};
  console.log(t.bold("\nTelemetria NDJSON (réplicas semânticas):"));
  const nd = tel.ndjson && tel.ndjson.ndjson_summaries_sorted ? tel.ndjson.ndjson_summaries_sorted : [];
  if (!nd.length) {
    console.log("  (sem ficheiros NDJSON com eventos semânticos)");
  } else {
    for (const block of nd) {
      console.log(`  ${block.file}: kinds=${(block.kinds_sorted || []).join(", ") || "-"}`);
    }
  }

  const px = report.path_explanations_sorted || [];
  if (px.length) {
    console.log(t.bold("\nExplicações por path (amostra):"));
    for (const row of px.slice(0, 6)) {
      console.log(`  • ${row.path} [${row.semantic_candidate_classification}]`);
      for (const part of (row.explanation_parts_sorted || []).slice(0, 3)) {
        console.log(`      ${part}`);
      }
    }
    if (px.length > 6) console.log(`  … +${px.length - 6} paths`);
  }

  if (!noWrite) {
    console.log(t.bold(`\nRelatório guardado:`));
    console.log(`  ${path.join(report.output_dir, SEMANTIC_DIAGNOSTICS_FILENAME)}`);
  }
}

function runSemanticInspect(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const noWrite = argv.includes("--no-write");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const selArg = positional[0];

  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, selArg || "latest");
  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const outDir = sel.entry.output_dir;
  const report = generateSemanticDiagnosticsReport(outDir);

  const outPath = path.join(outDir, SEMANTIC_DIAGNOSTICS_FILENAME);
  if (!noWrite) {
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    } catch (e) {
      console.error(e && e.message ? e.message : e);
      process.exitCode = 1;
      return;
    }
  }

  if (json) {
    console.log(JSON.stringify({ run_id: sel.entry.run_id, output_dir: outDir, ...report }, null, 2));
    return;
  }

  printHumanReport(report, { noWrite });
}

module.exports = { runSemanticInspect, resolveInspectSelection };
