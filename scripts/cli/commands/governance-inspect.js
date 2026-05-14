/**
 * CLI — governance inspect (diagnostics só leitura + relatório JSON).
 */

"use strict";

const { resolveOutputDir } = require("../../../core/run-resolver");
const { buildGovernanceDiagnosticsReport } = require("../../runtime/governance/governance-diagnostics-engine");
const { GOVERNANCE_DIAGNOSTICS_FILENAME } = require("../../runtime/governance/governance-runtime-constants");

function formatHumanReport(r, opts = {}) {
  const persisted = opts.persisted !== false;
  const lines = [];
  lines.push(`Governance diagnostics — ${r.output_dir_basename}`);
  lines.push("");

  const grs = r.governance_runtime_summary;
  const gas = r.governance_approval_summary;
  lines.push("Lifecycle / modo:");
  lines.push(
    grs
      ? `  lifecycle_state=${grs.lifecycle_state} mode=${grs.mode} continuity_fp=${grs.governance_continuity_fingerprint_prefix || "(vazio)"} semantic_fp=${grs.semantic_continuity_fingerprint_prefix || "(vazio)"}`
      : "  (sem governance-runtime.json)",
  );

  lines.push("");

  lines.push("Approval:");
  lines.push(
    gas
      ? `  status=${gas.status} approval_id=${gas.approval_id} phase=${gas.governance_phase} sem_fp=${gas.semantic_continuity_fingerprint_prefix || "-"}`
      : "  (sem governance-approval.json)",
  );

  lines.push("");

  lines.push("Blockers (runtime):");
  lines.push(`  count=${grs ? grs.blockers_count : 0}`);
  lines.push("");

  lines.push("Continuidade (leitura):");
  lines.push(`  status=${r.continuity_readonly.status}${r.continuity_readonly.reason ? ` reason=${r.continuity_readonly.reason}` : ""}`);
  lines.push(`  semantic_continuity_mismatch=${Boolean(r.continuity_readonly.semantic_continuity_mismatch)}`);
  lines.push(
    `  would_sync_mark_stale=${r.would_sync_mark_stale.would_mark_stale} bound=${r.would_sync_mark_stale.bound_fingerprint_prefix || "-"} current=${r.would_sync_mark_stale.current_fingerprint_prefix || "-"}`,
  );
  lines.push(
    `  semantic_fp_sync: bound=${r.would_sync_mark_stale.bound_semantic_prefix || "-"} current=${r.would_sync_mark_stale.current_semantic_prefix || "-"} semantic_only=${r.would_sync_mark_stale.would_mark_stale_semantic_only === true}`,
  );

  lines.push("");

  lines.push("Eligibility:");
  lines.push(`  replay (governance): ${r.eligibility.replay_eligible_governance ? "OK" : "BLOQUEADO"}`);
  lines.push(`  resume (governance): ${r.eligibility.resume_eligible_governance ? "OK" : "BLOQUEADO"}`);
  lines.push(`  resume (pipeline): ${r.eligibility.resume_eligible_pipeline ? "OK" : "BLOQUEADO"}`);
  if (!r.eligibility.resume_pipeline.ok && r.eligibility.resume_pipeline.reason) {
    lines.push(`    pipeline_reason=${r.eligibility.resume_pipeline.reason}`);
  }
  lines.push("");

  const tel = r.telemetry_summary;
  lines.push("Telemetry NDJSON (sumário):");
  lines.push(
    `  events=${tel.events_total} replay_blocks=${tel.replay_blocks} resume_blocks=${tel.resume_blocks} stale=${tel.stale_events} invalidations=${tel.invalidation_events} hitl_required=${tel.hitl_required_events} semantic_replay_blocked=${tel.semantic_replay_blocks ?? 0} semantic_resume_blocked=${tel.semantic_resume_blocks ?? 0} semantic_stale_like=${tel.semantic_stale_like_events ?? 0}`,
  );

  lines.push("");

  const sgc = r.semantic_governance_continuity;
  lines.push("Continuidade semântica (snapshot governance):");
  lines.push(
    sgc
      ? `  status=${sgc.status} current_sem_prefix=${sgc.semantic_continuity_fingerprint_prefix || "-"} bound_sem_prefix=${sgc.bound_semantic_prefix || "-"}`
      : "  (snapshot indisponível)",
  );
  if (sgc && Array.isArray(sgc.stale_reasons_sorted) && sgc.stale_reasons_sorted.length) {
    lines.push("  motivos stale:");
    for (const sr of sgc.stale_reasons_sorted.slice(0, 14)) lines.push(`    - ${sr}`);
    if (sgc.stale_reasons_sorted.length > 14) lines.push(`    … +${sgc.stale_reasons_sorted.length - 14}`);
  }

  lines.push("Consistency issues:");
  if (!r.consistency.issues.length) {
    lines.push("  (nenhum)");
  } else {
    for (const it of r.consistency.issues) {
      lines.push(`  [${it.severity}] ${it.code}: ${it.message}`);
    }
  }
  lines.push("");

  lines.push("Explainability:");
  const ex = r.explanations;
  lines.push(`  replay_blocked: ${ex.replay_blocked || "(n/a)"}`);
  lines.push(`  resume_governance_blocked: ${ex.resume_governance_blocked || "(n/a)"}`);
  lines.push(`  stale_why: ${ex.stale_why || "(n/a)"}`);
  if (ex.fingerprint_divergence) {
    lines.push(`  fingerprint_divergence: ${JSON.stringify(ex.fingerprint_divergence)}`);
  }
  if (ex.semantic_fingerprint_divergence) {
    lines.push(`  semantic_fingerprint_divergence: ${JSON.stringify(ex.semantic_fingerprint_divergence)}`);
  }
  if (ex.enforcement_blocker_codes && ex.enforcement_blocker_codes.length) {
    lines.push(`  enforcement_BLOCK_codes: ${ex.enforcement_blocker_codes.join(",")}`);
  }
  lines.push("");
  lines.push(
    persisted
      ? `Relatório escrito: ${GOVERNANCE_DIAGNOSTICS_FILENAME}`
      : "Persistência omitida (--no-write).",
  );

  return lines.join("\n");
}

/**
 * @param {string[]} argv
 * @param {{ repoRoot?: string|null }} [_ctx]
 */
function runGovernanceInspect(argv, _ctx = {}) {
  const json = argv.includes("--json");
  const noWrite = argv.includes("--no-write");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const runIdArg = positional[0];

  if (!runIdArg) {
    console.error(
      "Uso: setup-boss governance inspect <runId | latest | índice> [--json] [--no-write]",
    );
    process.exitCode = 1;
    return;
  }

  let outputDir;
  try {
    outputDir = resolveOutputDir(runIdArg);
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
    return;
  }

  const report = buildGovernanceDiagnosticsReport(outputDir, { persist: !noWrite });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatHumanReport(report, { persisted: !noWrite }));
}

module.exports = {
  runGovernanceInspect,
  formatHumanReport,
};
