/**
 * Inspect deterministic review runtime (Fase 4.4).
 */

const { discoverRuns } = require("../lib/runs-discovery");
const {
  collectReviewDiagnostics,
} = require("../../review-runtime/diagnostics/review-diagnostics");
const { supportsColor, theme } = require("../render/ansi");

const {
  collectTransactionDiagnostics,
} = require("../../transaction-runtime/diagnostics/collect-transaction-diagnostics");
const { loadDeterministicReview } = require("../../review-runtime/deterministic-review-runtime");
const {
  compareDeterministicReviews,
  saveReviewDiffArtifact,
} = require("../../review-runtime/deterministic-review-diff");

function printDeterministicReviewBundleLine(diag, t) {
  const b = diag && diag.deterministic_review_bundle;
  if (!b) return;
  console.log(t.bold("  Artefactos deterministic-review (4.11 trio):"));
  console.log(
    `    deterministic-review.json=${b.deterministic_review_present ? "sim" : "não"} · review-diff.json=${b.review_diff_present ? "sim" : "não"} · review-baseline-summary.json=${b.review_baseline_summary_present ? "sim" : "não"}`,
  );
  if (diag.deterministic_review_fingerprint) {
    console.log(`    fingerprint(conteúdo): ${diag.deterministic_review_fingerprint}`);
  }
}

function printDeterministicReviewDiffHuman(diff, labelA, labelB, t, compact) {
  if (!diff.artifact_presence.before) {
    console.warn("(aviso) deterministic-review.json ausente ou ilegível na run A — diff parcial.");
  }
  if (!diff.artifact_presence.after) {
    console.warn("(aviso) deterministic-review.json ausente ou ilegível na run B — diff parcial.");
  }

  console.log(t.bold(`Deterministic review — diff (4.11.6)${compact ? " [compact]" : ""}`));
  console.log(`  before (A): ${labelA}`);
  console.log(`  after (B):  ${labelB}`);
  const fp = diff.fingerprints;
  if (fp && fp.comparable) {
    console.log(`  fingerprint alterado: ${fp.changed ? "sim" : "não"}`);
  } else {
    console.log("  fingerprint: não comparável (ausente num dos artefactos)");
  }

  const s = diff.summary;
  console.log(t.bold("  sumário:"));
  console.log(
    `    findings: novo=${s.new_findings_count} resolvido=${s.resolved_findings_count} persistente=${s.persistent_findings_count}`,
  );
  if (s.findings_without_finding_id_before || s.findings_without_finding_id_after) {
    console.log(
      `    sem finding_id (ignorados no diff): A=${s.findings_without_finding_id_before} B=${s.findings_without_finding_id_after}`,
    );
  }
  console.log(`    Δ risk_score=${s.risk_score_delta}`);
  const rc = diff.risk_changes;
  console.log(`    risco overall: ${rc.overall_risk_level.before} → ${rc.overall_risk_level.after}`);
  const gc = diff.gate_changes;
  console.log(
    `    gate: decision ${gc.decision.before} → ${gc.decision.after}; mode ${gc.mode.before} → ${gc.mode.after}; threshold ${gc.threshold.before} → ${gc.threshold.after}`,
  );

  const capNote = (name, truncated, omitted) => {
    if (truncated) console.log(`    (${name} truncado: +${omitted} omitidos; máx. bucket)`);
  };
  capNote("novos", s.findings_truncated.new_findings, s.findings_omitted.new_findings);
  capNote("resolvidos", s.findings_truncated.resolved_findings, s.findings_omitted.resolved_findings);

  const sampleLim = compact ? 5 : 10;
  const sample = (title, rows) => {
    if (!rows || !rows.length) return;
    console.log(t.bold(`  ${title} (amostra até ${sampleLim}):`));
    for (const r of rows.slice(0, sampleLim)) {
      console.log(`    - ${r.code} [${r.type}/${r.severity}] ${r.finding_id}`);
    }
    if (rows.length > sampleLim) console.log(`    … +${rows.length - sampleLim}`);
  };
  sample("Novos", diff.findings.new_findings);
  sample("Resolvidos", diff.findings.resolved_findings);
}

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

function runInspectReview(argv, { repoRoot = null } = {}) {
  const json = argv.includes("--json");
  const compact = argv.includes("--compact");
  const rerun = argv.includes("--rerun-invariants");
  const withTxn = argv.includes("--include-transaction");
  const fullDeterministic = argv.includes("--full-deterministic");
  const writeDiff = argv.includes("--write-diff");
  const diffIdx = argv.indexOf("--diff");

  const entries = discoverRuns({ includeLegacy: true, repoRoot });

  if (diffIdx !== -1) {
    const tail = argv.slice(diffIdx + 1);
    const selectors = [];
    for (const x of tail) {
      if (String(x).startsWith("--")) break;
      selectors.push(x);
    }
    if (selectors.length < 2) {
      console.error("Uso: inspect-review --diff <runA> <runB> [--json] [--write-diff] [--compact]");
      process.exitCode = 1;
      return;
    }
    const selA = resolveInspectSelection(entries, selectors[0]);
    const selB = resolveInspectSelection(entries, selectors[1]);
    if (selA.error) {
      console.error(selA.error);
      process.exitCode = 1;
      return;
    }
    if (selB.error) {
      console.error(selB.error);
      process.exitCode = 1;
      return;
    }
    const beforeDoc = loadDeterministicReview(selA.entry.output_dir);
    const afterDoc = loadDeterministicReview(selB.entry.output_dir);
    const diff = compareDeterministicReviews(beforeDoc, afterDoc, {
      before_run_id: selA.entry.run_id,
      after_run_id: selB.entry.run_id,
      before_output_dir: selA.entry.output_dir,
      after_output_dir: selB.entry.output_dir,
    });
    if (writeDiff && selB.entry.output_dir) {
      try {
        const p = saveReviewDiffArtifact(selB.entry.output_dir, diff, null);
        if (!json && p) console.log(`Gravado: ${p}`);
      } catch (err) {
        console.error(`Falha ao gravar review-diff.json: ${err && err.message ? err.message : err}`);
        process.exitCode = 1;
      }
    }
    if (json) {
      console.log(
        JSON.stringify(
          {
            mode: "deterministic_review_diff",
            run_a: selectors[0],
            run_b: selectors[1],
            ...diff,
          },
          null,
          2,
        ),
      );
      return;
    }
    printDeterministicReviewDiffHuman(diff, selectors[0], selectors[1], theme(supportsColor()), compact);
    return;
  }

  const positional = argv.filter(
    (a) =>
      a !== "--json" &&
      a !== "--compact" &&
      a !== "--rerun-invariants" &&
      a !== "--include-transaction" &&
      a !== "--full-deterministic" &&
      a !== "--write-diff",
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
  const diag = collectReviewDiagnostics(outDir, {
    include_rerun: rerun,
    include_deterministic_full: fullDeterministic,
  });
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
  console.log(t.bold(`Review runtime — inspect (Fase 4.4 + 4.11)${compact ? " [compact]" : ""}`));
  console.log(`  run_id:          ${sel.entry.run_id}`);
  console.log(`  output_dir:      ${outDir}`);
  console.log(`  SETUP_BOSS_REVIEW_ENGINE (env actual): ${diag.review_engine_env}`);
  if (compact && diag.review_gate_env && diag.review_baseline_env) {
    console.log(
      `  env gates: GATE_MODE=${diag.review_gate_env.SETUP_BOSS_REVIEW_GATE_MODE} GATE_THRESHOLD=${diag.review_gate_env.SETUP_BOSS_REVIEW_GATE_THRESHOLD} · BASELINE_MODE=${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_MODE} PATH=${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_PATH || "-"} TH=${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_THRESHOLD}`,
    );
  } else {
    if (diag.review_gate_env) {
      console.log(`  SETUP_BOSS_REVIEW_GATE_MODE (efectivo): ${diag.review_gate_env.SETUP_BOSS_REVIEW_GATE_MODE}`);
      console.log(`  SETUP_BOSS_REVIEW_GATE_THRESHOLD (efectivo): ${diag.review_gate_env.SETUP_BOSS_REVIEW_GATE_THRESHOLD}`);
    }
    if (diag.review_baseline_env) {
      console.log(`  SETUP_BOSS_REVIEW_BASELINE_MODE: ${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_MODE}`);
      console.log(`  SETUP_BOSS_REVIEW_BASELINE_PATH: ${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_PATH || "(vazio)"}`);
      console.log(`  SETUP_BOSS_REVIEW_BASELINE_THRESHOLD (efectivo): ${diag.review_baseline_env.SETUP_BOSS_REVIEW_BASELINE_THRESHOLD}`);
    }
  }

  printDeterministicReviewBundleLine(diag, t);

  console.log(`  review-results.json:            ${diag.artifacts.review_results_present ? "sim" : "não"}`);
  if (diag.review_results && diag.review_results.extensions && diag.review_results.extensions.deterministic_review_ref) {
    console.log(`    extensions.deterministic_review_ref: ${diag.review_results.extensions.deterministic_review_ref}`);
  }
  console.log(`  review-runtime-manifest.json:    ${diag.artifacts.review_manifest_present ? "sim" : "não"}`);
  console.log(`  review-correction-hints.json:    ${diag.artifacts.correction_hints_present ? "sim" : "não"}`);
  if (diag.deterministic_review_summary) {
    const s = diag.deterministic_review_summary;
    console.log(t.bold("  deterministic review (resumo):"));
    console.log(
      `    totais: findings=${s.findings_total} warnings=${s.warnings_total} errors=${s.errors_total} infos=${s.infos_total}`,
    );
    console.log(
      `    unresolved_validators=${s.unresolved_validators_total} failed_validations=${s.failed_validations_total}`,
    );
    if (s.by_severity) {
      console.log(
        `    por severity: error=${s.by_severity.error} warning=${s.by_severity.warning} info=${s.by_severity.info}`,
      );
    }
    if (s.by_type && Object.keys(s.by_type).length) {
      const pairs = Object.entries(s.by_type)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(`    por type: ${pairs}`);
    }
    if (!compact && s.by_code && Object.keys(s.by_code).length) {
      console.log(t.bold("    por code:"));
      const entries = Object.entries(s.by_code).sort((a, b) => a[0].localeCompare(b[0]));
      const cap = 24;
      for (const [code, n] of entries.slice(0, cap)) {
        console.log(`      - ${code}: ${n}`);
      }
      if (entries.length > cap) {
        console.log(`      … +${entries.length - cap} códigos`);
      }
    }
    if (s.risk_summary) {
      const r = s.risk_summary;
      console.log(t.bold("  deterministic review — risco (4.11.4):"));
      console.log(
        `    nível=${r.overall_risk_level} score=${r.risk_score} ` +
          `(estrutura:${r.structural_errors} semântica:${r.semantic_warnings} ` +
          `validação:${r.validation_failures} grafo:${r.graph_truncations} cache:${r.cache_inconsistencies})`,
      );
      if (r.score_model_version) {
        console.log(`    modelo: ${r.score_model_version}`);
      }
      const hiCap = compact ? 4 : r.highlights.length;
      if (Array.isArray(r.highlights) && r.highlights.length) {
        for (const h of r.highlights.slice(0, hiCap)) {
          console.log(`    • ${h}`);
        }
        if (compact && r.highlights.length > hiCap) console.log(`    … +${r.highlights.length - hiCap} highlights`);
      }
      const topCap = compact ? 4 : 8;
      if (Array.isArray(r.top_risk_findings) && r.top_risk_findings.length) {
        console.log(t.bold("    top findings (peso):"));
        for (const tr of r.top_risk_findings.slice(0, topCap)) {
          console.log(`      - ${tr.code} [${tr.type}/${tr.severity}] weight=${tr.risk_weight}`);
        }
        if (compact && r.top_risk_findings.length > topCap) {
          console.log(`      … +${r.top_risk_findings.length - topCap}`);
        }
      }
    }
  }

  if (diag.deterministic_review_gate) {
    const g = diag.deterministic_review_gate;
    console.log(t.bold("  deterministic review — gate (4.11.5):"));
    console.log(`    artefacto: mode=${g.mode} threshold=${g.threshold} decision=${g.decision} risk_level=${g.risk_level}`);
    const trigCap = compact ? 6 : 12;
    if (Array.isArray(g.triggered_by) && g.triggered_by.length) {
      console.log(t.bold("    triggered_by:"));
      for (const row of g.triggered_by.slice(0, trigCap)) {
        if (!row || typeof row !== "object") continue;
        if (row.kind === "risk_threshold") {
          console.log(
            `      - threshold: ${row.overall_risk_level} >= ${row.gate_threshold} (${row.rule})`,
          );
        } else if (row.kind === "finding") {
          console.log(`      - ${row.code} [${row.type}/${row.severity}] weight=${row.risk_weight}`);
        }
      }
      if (g.triggered_by.length > trigCap) console.log(`      … +${g.triggered_by.length - trigCap}`);
    }
  }

  if (!compact && diag.review_baseline_summary_path) {
    console.log(`  review-baseline-summary.json (4.11.7): ${diag.review_baseline_summary ? "sim" : "não"}`);
  }
  if (diag.review_baseline_summary && typeof diag.review_baseline_summary === "object") {
    const bs = diag.review_baseline_summary;
    console.log(t.bold("  deterministic review — baseline / regressão (4.11.7):"));
    const dec = bs.decision || {};
    console.log(`    modo=${dec.mode} cli_effect=${dec.cli_effect || "n/a"} outcome=${dec.outcome || dec.skipped_reason || "n/a"}`);
    if (Array.isArray(dec.threshold_profile) && dec.threshold_profile.length) {
      console.log(`    thresholds: ${dec.threshold_profile.join(", ")}`);
    }
    if (Array.isArray(dec.violated) && dec.violated.length) {
      console.log(`    violados: ${dec.violated.join(", ")}`);
    }
    if (bs.baseline) {
      const bl = bs.baseline;
      console.log(`    baseline loaded=${bl.loaded} path=${bl.path || "(n/a)"}`);
    }
    if (bs.regression && typeof bs.regression === "object") {
      const r = bs.regression;
      console.log(
        `    regressão: novos_findings=${r.new_findings_count} Δrisk_score=${r.risk_score_delta} gate_regressed=${r.gate_regressed}`,
      );
      console.log(
        `      Δvalidation_failures=${r.validation_failures_delta} Δstructural_errors=${r.structural_errors_delta}`,
      );
    }
    const hints = bs.diagnostics && Array.isArray(bs.diagnostics.regression_highlights) ? bs.diagnostics.regression_highlights : [];
    const hintCap = compact ? 8 : 16;
    if (hints.length) {
      console.log(t.bold("    destaques:"));
      for (const h of hints.slice(0, hintCap)) {
        console.log(`      • ${h}`);
      }
      if (hints.length > hintCap) console.log(`      … +${hints.length - hintCap}`);
    }
  }

  const rr = diag.review_results;
  if (rr && rr.summary) {
    console.log(t.bold("  summary:"));
    console.log(`    status: ${rr.summary.status} score=${rr.summary.score} conf=${rr.summary.confidence}`);
    console.log(`    requires_correction: ${rr.summary.requires_correction} manual_review: ${rr.summary.requires_manual_review}`);
  }

  if (rr && Array.isArray(rr.violations) && rr.violations.length) {
    const vCap = compact ? 6 : 12;
    console.log(t.bold("  violations (amostra):"));
    for (const v of rr.violations.slice(0, vCap)) {
      console.log(`    - ${v.id} [${v.severity}]`);
    }
    if (rr.violations.length > vCap) console.log(`    … +${rr.violations.length - vCap}`);
  }

  if (rr && rr.policy_review && rr.policy_review.policies_applied) {
    console.log(t.bold("  policies:"));
    for (const p of rr.policy_review.policies_applied) {
      console.log(`    - ${p}`);
    }
  }

  if (diag.correction_hints) {
    console.log(t.bold("  correction_hints (Fase 4.5 prep):"));
    const ch = diag.correction_hints;
    console.log(`    reconciliation_fix_required: ${!!ch.reconciliation_fix_required}`);
    console.log(`    validation_fix_required: ${!!ch.validation_fix_required}`);
    console.log(`    semantic_fix_required: ${!!ch.semantic_fix_required}`);
    if (Array.isArray(ch.invariant_violation_targets) && ch.invariant_violation_targets.length) {
      console.log(`    invariant targets: ${ch.invariant_violation_targets.slice(0, 8).join(", ")}`);
    }
  }

  if (rerun && diag.structural_rerun) {
    console.log(t.bold("  structural rerun (--rerun-invariants):"));
    console.log(`    structural_score: ${diag.structural_rerun.structural_score}`);
    console.log(`    invariants: ${diag.invariants_rerun ? diag.invariants_rerun.length : 0}`);
    if (diag.semantic_rerun) {
      console.log(`    semantic_score: ${diag.semantic_rerun.semantic_score}`);
    }
  }

  if (withTxn && txnDiag) {
    console.log(t.bold("  transaction_runtime (Fase 4.6):"));
    console.log(`    contract_present: ${txnDiag.contract_present ? "sim" : "não"}`);
    if (txnDiag.continuity) {
      console.log(`    continuidade.ok: ${txnDiag.continuity.ok}`);
    }
    if (txnDiag.envelope && (txnDiag.envelope.last_hooks || []).length) {
      console.log(
        `    últimos hooks: ${(txnDiag.envelope.last_hooks || []).join(", ")}`,
      );
    }
  }

  try {
    const { collectCorrectionDiagnostics } = require("../../correction-runtime/diagnostics/correction-diagnostics");
    const cd = collectCorrectionDiagnostics(sel.entry.output_dir);
    console.log(`  SETUP_BOSS_CORRECTION_ENGINE (env actual): ${cd.correction_engine_env}`);
    if (cd.correction_analysis_summary) {
      console.log(
        t.bold(`  artefactos correction: analysis=${cd.artifacts.correction_analysis_present}`),
      );
      console.log(
        `    correction summary.classification=${cd.correction_analysis_summary.failure_classification} (ver inspect-correction)`,
      );
    }
  } catch (_) {}
}

module.exports = { runInspectReview };
