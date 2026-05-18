const fs = require("fs");
const path = require("path");
const { discoverRuns } = require("../lib/runs-discovery");
const { summarizeRun, formatDurationMs } = require("../lib/run-summarize");
const { readJsonSafe } = require("../lib/json-io");
const { collectFailureSignals } = require("../lib/failure-diagnostics");
const { supportsColor, theme } = require("../render/ansi");
const { buildTemporalInspectReport } = require("../../runtime/replay/temporal-status");
const { summarizeRecoveryFromArtifacts } = require("../../runtime/recovery/recovery-artifacts");

const PREFERRED_ARTIFACTS = [
  "intake-manifest.json",
  "intake-classification.json",
  "intake-context-summary.json",
  "intake-discovery-analysis.json",
  "task-discovery.md",
  "task-plan-initial.md",
  "intake-llm-error.json",
  "preflight-analysis.json",
  "policy-report.json",
  "governance-decisions.json",
  "preflight-summary.md",
  "preflight-accuracy.json",
  "task.md",
  "run-log.json",
  "metadata.json",
  "run-metrics.json",
  "prompt-sizes.json",
  "architect-input.md",
  "architect-output.md",
  "architect-validation.json",
  "scan-output.md",
  "executor-input.md",
  "executor-output.md",
  "executor-result.json",
  "executor-changes.json",
  "patch-preview.md",
  "patch-preview-summary.json",
  "virtual-project-overlay.json",
  "patch-manifest.json",
  "runtime-checkpoints.json",
  "physical-apply-result.json",
  "retry-history.json",
  "recovery-log.json",
  "executor-recovery-diagnosis.txt",
  "review-output.json",
  "review-output.md",
  "correction-instructions.md",
  "correction-output.md",
  "knowledge-update.md",
  "run-context.json",
];

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
      error: `Prefixo ambíguo "${arg}". Correspondências: ${prefixes
        .map((p) => p.run_id)
        .slice(0, 6)
        .join(", ")}`,
    };
  }

  return { error: `Run não encontrada: "${arg}".` };
}

function listArtifactNames(outputDir) {
  let names = [];
  try {
    names = fs.readdirSync(outputDir);
  } catch (_) {
    return [];
  }

  const prefSet = new Set(PREFERRED_ARTIFACTS);
  const preferred = PREFERRED_ARTIFACTS.filter((n) => names.includes(n));
  const rest = names
    .filter((n) => !prefSet.has(n))
    .sort((a, b) => a.localeCompare(b));

  return { preferred, rest };
}

function printKv(t, label, value) {
  const L = t.bold(`${label}:`);
  console.log(`  ${L} ${value}`);
}

function runInspect(argv, { repoRoot = null } = {}) {
  const arg = argv[0];
  const entries = discoverRuns({ includeLegacy: true, repoRoot });
  const sel = resolveInspectSelection(entries, arg);

  if (sel.error) {
    console.error(sel.error);
    process.exitCode = 1;
    return;
  }

  const { entry } = sel;
  const outDir = entry.output_dir;
  const sum = summarizeRun(outDir, entry);

  const useColor = supportsColor();
  const t = theme(useColor);

  if (sum.is_intake) {
    const title = t.bold(`Run ${sum.run_id}`);
    console.log(`${title}`);
    console.log(t.dim("—".repeat(64)));
    printKv(t, "Modo", "intake (Fase 1)");
    printKv(t, "Task", sum.task_title);
    printKv(
      t,
      "Project",
      sum.project_root || "(desconhecido / legado)",
    );
    printKv(t, "Output dir", outDir);
    printKv(t, "Status", sum.status);
    printKv(t, "Classification", sum.intake_classification || "—");
    printKv(t, "Confidence", sum.intake_confidence || "—");
    printKv(t, "Phase1", sum.phase1_status || "—");
    if (sum.intake_manifest) {
      printKv(t, "Manifest", sum.intake_manifest);
    }
    console.log("");
    console.log(t.bold("Artefactos"));
    const inv = listArtifactNames(outDir);
    const all = [...inv.preferred, ...inv.rest];
    for (const n of all.slice(0, 48)) {
      console.log(`  - ${n}`);
    }
    if (all.length > 48) {
      console.log(t.dim(`  … +${all.length - 48} mais`));
    }
    return;
  }

  const changes = readJsonSafe(
    path.join(outDir, "executor-changes.json"),
    2_000_000,
  );

  const title = t.bold(`Run ${sum.run_id}`);
  console.log(`${title}`);
  console.log(t.dim("—".repeat(64)));
  printKv(t, "Task", sum.task_title);
  printKv(
    t,
    "Project",
    sum.project_root || "(desconhecido / legado)",
  );
  printKv(t, "Output dir", outDir);
  printKv(t, "Status", sum.status);
  printKv(
    t,
    "MODE",
    sum.execution_mode === "dry_run" ? "DRY_RUN" : "APPLY",
  );
  printKv(
    t,
    "Run log status",
    (sum.runLog && sum.runLog.status) || "—",
  );
  printKv(
    t,
    "Timestamps",
    `${(sum.runLog && sum.runLog.started_at) || "—"}  →  ${(sum.runLog && sum.runLog.finished_at) || "—"}`,
  );
  printKv(t, "Duration", formatDurationMs(sum.duration_ms));
  printKv(
    t,
    "Review",
    sum.review && sum.review.status ? String(sum.review.status) : "—",
  );

  console.log("");
  console.log(t.bold("Continuidade temporal"));
  const temporal = buildTemporalInspectReport(outDir, sum.project_root);
  printKv(t, "Run state", String(temporal.lifecycle_state));
  printKv(
    t,
    "Replay available",
    temporal.replay_available ? "YES" : "NO",
  );
  if (temporal.replay_steps) {
    const rs = temporal.replay_steps;
    printKv(
      t,
      "Replay steps",
      `executor=${rs.executor ? "yes" : "no"} review=${rs.review ? "yes" : "no"} correction=${rs.correction ? "yes" : "no"}`,
    );
  }
  printKv(
    t,
    "Resume available",
    temporal.resume_available ? "YES" : "NO",
  );
  if (!temporal.resume_available && temporal.resume_reason) {
    printKv(t, "Resume blocked", String(temporal.resume_reason).slice(0, 320));
  }
  if (temporal.resume_next) {
    printKv(t, "Resume next phase", String(temporal.resume_next));
  }
  printKv(t, "Filesystem drift", String(temporal.filesystem_drift_summary));
  if (
    temporal.drift_detail_errors &&
    temporal.drift_detail_errors.length
  ) {
    for (const line of temporal.drift_detail_errors.slice(0, 6)) {
      console.log(`    ${t.dim(String(line).slice(0, 360))}`);
    }
  }
  printKv(
    t,
    "Stale manifest / integrity",
    temporal.stale_manifest ? "YES (executor-changes ≠ manifest)" : "NO",
  );
  printKv(
    t,
    "Checkpoints",
    String(temporal.checkpoints_count),
  );
  if (temporal.invalid_checkpoint_doc) {
    printKv(t, "Checkpoint doc", "INVALID_SCHEMA");
  }

  console.log("");
  console.log(t.bold("Execução / dry-run"));
  const exec = sum.execution || (sum.metadata && sum.metadata.execution);
  printKv(t, "Mode", exec && exec.mode === "dry_run" ? "DRY RUN" : "APPLY");
  printKv(
    t,
    "Applied changes (projeto físico)",
    exec && exec.applied_to_project === false
      ? "NO"
      : exec && exec.applied_to_project === true
        ? "YES"
        : "—",
  );
  const pendingPatches =
    exec &&
    exec.pending_apply === true &&
    Array.isArray(changes) &&
    changes.length > 0;
  printKv(
    t,
    "Pending patches",
    pendingPatches ? "YES" : exec && exec.pending_apply === false ? "NO" : "—",
  );
  const patchPreviewSum = readJsonSafe(
    path.join(outDir, "patch-preview-summary.json"),
    512_000,
  );
  if (patchPreviewSum && typeof patchPreviewSum === "object") {
    printKv(
      t,
      "Preview patch ops",
      String(patchPreviewSum.patch_operations ?? "—"),
    );
    printKv(
      t,
      "Preview files touched",
      String(patchPreviewSum.files_changed ?? "—"),
    );
    printKv(t, "Preview risk", String(patchPreviewSum.risk_level ?? "—"));
  }

  console.log("");
  console.log(t.bold("Correções"));
  printKv(
    t,
    "Iterações",
    String(sum.correction_iterations ?? 0),
  );
  if (sum.review && sum.review.requires_correction != null) {
    printKv(
      t,
      "requires_correction",
      String(sum.review.requires_correction),
    );
  }
  if (sum.review && sum.review.summary) {
    const s = String(sum.review.summary).slice(0, 1200);
    console.log(`  ${t.bold("summary:")} ${s}`);
  }
  if (sum.review && Array.isArray(sum.review.blocking_issues)) {
    console.log(`  ${t.bold("blocking_issues:")}`);
    for (const line of sum.review.blocking_issues.slice(0, 12)) {
      console.log(`    - ${String(line).slice(0, 500)}`);
    }
  }

  console.log("");
  console.log(t.bold("Ficheiros alterados"));
  if (Array.isArray(changes) && changes.length) {
    console.log(`  (${changes.length} entradas)`);
    for (const ch of changes.slice(0, 60)) {
      const fp =
        (ch && (ch.path || ch.file || ch.target)) ||
        JSON.stringify(ch).slice(0, 120);
      console.log(`    - ${fp}`);
    }
    if (changes.length > 60) console.log(`    … +${changes.length - 60} mais`);
  } else {
    console.log("  (executor-changes.json vazio ou ausente)");
  }

  const runCtx = readJsonSafe(path.join(outDir, "run-context.json"), 1_500_000);
  if (runCtx && Array.isArray(runCtx.allowed_files)) {
    printKv(t, "allowed_files", String(runCtx.allowed_files.length));
  }
  if (runCtx && runCtx.snippets) {
    printKv(
      t,
      "snippets em run-context",
      String(Object.keys(runCtx.snippets).length),
    );
  }

  const meta = sum.metadata || readJsonSafe(path.join(outDir, "metadata.json"), 1_500_000);

  console.log("");
  console.log(t.bold("Métricas & custo"));
  const rm = readJsonSafe(path.join(outDir, "run-metrics.json"), 2_000_000);
  if (rm && rm.totals) {
    printKv(
      t,
      "prompt chars (soma passos)",
      String(rm.totals.prompt_chars_sum_steps ?? "—"),
    );
    printKv(
      t,
      "prompt est. tokens",
      String(rm.totals.prompt_est_tokens_sum ?? "—"),
    );
  } else {
    console.log("  (run-metrics.json ausente — run antiga ou interrompida)");
  }

  if (rm && rm.telemetry_counts && typeof rm.telemetry_counts === "object") {
    console.log(`  ${t.bold("telemetry_counts:")}`);
    const entriesTc = Object.entries(rm.telemetry_counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
    for (const [k, v] of entriesTc) {
      console.log(`    ${k}: ${v}`);
    }
  }

  if (rm && rm.scan_cache && typeof rm.scan_cache === "object") {
    console.log(
      `  ${t.bold("scan_cache:")} ${JSON.stringify(rm.scan_cache).slice(0, 400)}`,
    );
  }

  if (rm && rm.executor_snippet_economics != null) {
    console.log(
      `  ${t.bold("executor_snippet_economics:")} ${JSON.stringify(rm.executor_snippet_economics).slice(0, 600)}`,
    );
  }

  if (rm && rm.inflation && Array.isArray(rm.inflation.top_blocks)) {
    console.log(`  ${t.bold("top inflation blocks:")}`);
    for (const b of rm.inflation.top_blocks.slice(0, 8)) {
      console.log(
        `    - ${b.step || ""} / ${b.block || ""}  ${b.chars ?? b.est_tokens ?? ""} chars`,
      );
    }
  }

  if (rm && rm.recovery && typeof rm.recovery === "object") {
    console.log(`  ${t.bold("recovery (run-metrics):")} ${JSON.stringify(rm.recovery).slice(0, 520)}`);
  }

  const pre = readJsonSafe(path.join(outDir, "preflight-analysis.json"), 2_500_000);
  const pacc = readJsonSafe(path.join(outDir, "preflight-accuracy.json"), 1_500_000);

  console.log("");
  console.log(t.bold("Recovery"));
  const recSum = summarizeRecoveryFromArtifacts(outDir);
  printKv(
    t,
    "Executor micro-retries (retry-history)",
    String(recSum.executor_micro_retries),
  );
  printKv(t, "Provider retries (retry-history)", String(recSum.provider_retries));
  printKv(
    t,
    "Context expansions (retry-history)",
    String(recSum.context_expansions),
  );
  printKv(t, "Recovery events", String(recSum.recovery_events));
  printKv(t, "Final outcome (recovery-log)", String(recSum.final_outcome));
  let recDiag = "";
  try {
    const dp = path.join(outDir, "executor-recovery-diagnosis.txt");
    if (fs.existsSync(dp)) {
      recDiag = fs.readFileSync(dp, "utf-8");
    }
  } catch (_) {
    recDiag = "";
  }
  if (recDiag && recDiag.trim()) {
    console.log(`  ${t.bold("last diagnosis:")}`);
    console.log(t.dim(`    ${recDiag.trim()
      .split("\n")
      .join("\n    ")
      .slice(0, 1500)}`));
  }

  if (meta && meta.execution && meta.execution.recovery_outcome) {
    printKv(
      t,
      "metadata.execution.recovery_outcome",
      String(meta.execution.recovery_outcome),
    );
  }

  console.log("");
  console.log(t.bold("Preflight & precisão da estimativa"));
  if (pre && typeof pre === "object") {
    printKv(t, "Complexidade (preflight)", String(pre.complexity?.tier ?? "—"));
    printKv(
      t,
      "Escopo ficheiros (est.)",
      `${pre.scope?.estimated_files_min ?? "—"}–${pre.scope?.estimated_files_max ?? "—"}`,
    );
    printKv(
      t,
      "Prompt chars (est.)",
      String(pre.prompts?.totals?.est_prompt_chars_sum ?? "—"),
    );
    printKv(
      t,
      "Tokens (est. banda)",
      `${pre.prompts?.totals?.est_tokens_band_low ?? "—"}–${pre.prompts?.totals?.est_tokens_band_high ?? "—"}`,
    );
    printKv(t, "Risco (preflight)", String(pre.risk?.tier ?? "—"));
    if (pre.cost?.pricing_available && pre.cost.estimated_cost_usd_mid != null) {
      printKv(
        t,
        "Custo USD (est. banda)",
        `$${pre.cost.estimated_cost_usd_low ?? "—"}–$${pre.cost.estimated_cost_usd_high ?? "—"} (mid $${pre.cost.estimated_cost_usd_mid})`,
      );
    } else {
      printKv(t, "Custo USD (est.)", "(preços por modelo não configurados)");
    }
  } else {
    console.log("  (preflight-analysis.json ausente — run anterior ao preflight ou artefacto apagado)");
  }

  if (pacc && pacc.deltas) {
    console.log("");
    console.log(`  ${t.bold("Real vs estimado:")}`);
    const d = pacc.deltas;
    printKv(
      t,
      "prompt_chars ratio (actual/est)",
      d.prompt_chars_ratio != null ? String(d.prompt_chars_ratio) : "—",
    );
    printKv(
      t,
      "tokens ratio",
      d.tokens_ratio != null ? String(d.tokens_ratio) : "—",
    );
    printKv(
      t,
      "cost ratio",
      d.cost_ratio != null ? String(d.cost_ratio) : "—",
    );
    printKv(
      t,
      "files delta (actual − est_mid)",
      d.files_delta != null ? String(d.files_delta) : "—",
    );
  } else if (pre) {
    console.log("");
    console.log(
      t.dim(
        "  (preflight-accuracy.json ainda não gerado — disponível após conclusão / métricas finais)",
      ),
    );
  }

  console.log("");
  console.log(t.bold("Governança"));
  const polRep = readJsonSafe(path.join(outDir, "policy-report.json"), 768_000);
  const govDec = readJsonSafe(path.join(outDir, "governance-decisions.json"), 768_000);
  const gvPre = pre && pre.governance;
  if (!(gvPre || polRep || govDec)) {
    console.log(
      t.dim(
        "  (sem artefactos de governança — run anterior à Fase 2.7 ou governance desactivada)",
      ),
    );
  } else {
    if (gvPre && typeof gvPre === "object") {
      printKv(
        t,
        "Preflight governance — perfil",
        String(gvPre.profile_resolved ?? "—"),
      );
      printKv(
        t,
        "Dry-run obrigatório (política)",
        gvPre.dry_run_policy_mandatory === true ? "SIM" : "NÃO",
      );
      printKv(
        t,
        "Dry-run satisfeito pelo fluxo",
        gvPre.dry_run_satisfied_flow === true ? "SIM" : "NÃO",
      );
      printKv(
        t,
        "Bypass (nesta run)",
        gvPre.bypass_used_this_run === true ? "SIM" : "NÃO",
      );
      printKv(
        t,
        "Correções (cap efectivo)",
        gvPre.effective_max_correction_iterations != null
          ? String(gvPre.effective_max_correction_iterations)
          : "—",
      );
      printKv(
        t,
        "Bloqueadores pré-pipeline",
        gvPre.blockers_detected_pre_pipeline === true ? "SIM" : "NÃO",
      );
    }
    if (
      govDec &&
      Array.isArray(govDec.lifecycle_hints) &&
      govDec.lifecycle_hints.length
    ) {
      printKv(t, "Lifecycle hints", govDec.lifecycle_hints.join(", "));
    }
    if (govDec && govDec.physical_apply_audit && typeof govDec.physical_apply_audit === "object") {
      const paa = govDec.physical_apply_audit;
      printKv(
        t,
        "Último apply físico (audit)",
        paa.ok === true ? `OK (${paa.profile_resolved ?? "—"})` : `BLOQUEADO/WARN (${paa.at ?? "?"})`,
      );
      if (!paa.ok && paa.message) {
        console.log(`    ${t.dim(String(paa.message).slice(0, 420))}`);
      }
    }
    if (govDec && govDec.resume_cli_audit && typeof govDec.resume_cli_audit === "object") {
      const ra = govDec.resume_cli_audit;
      printKv(
        t,
        "Último resume (governança CLI)",
        `${ra.next_phase ?? "—"} @ ${ra.at ?? "?"}`,
      );
      printKv(
        t,
        "resume — perfil efectivo",
        String(ra.profile_resolved ?? "—"),
      );
      printKv(
        t,
        "resume — policy_profile (CLI)",
        ra.policy_profile_cli != null ? String(ra.policy_profile_cli) : "—",
      );
      printKv(
        t,
        "resume — force bypass / governance off",
        `${ra.force_policy_bypass === true ? "bypass " : ""}${ra.disable_governance === true ? "off" : ""}`.trim() ||
          "—",
      );
    }
    if (polRep && typeof polRep === "object") {
      printKv(
        t,
        "policy-report — governance_profile",
        String(polRep.governance_profile ?? polRep.profile_resolved ?? "—"),
      );
      printKv(t, "Enforcement", String(polRep.enforcement ?? "—"));
    }
  }

  if (meta && meta.llm_usage_total) {
    const u = meta.llm_usage_total;
    printKv(
      t,
      "LLM total (metadata)",
      `in ${u.input_tokens ?? "—"} | out ${u.output_tokens ?? "—"} | ~USD ${u.estimated_cost_usd ?? "—"}`,
    );
  }

  const ps = readJsonSafe(path.join(outDir, "prompt-sizes.json"), 2_000_000);
  if (ps && typeof ps === "object") {
    console.log(`  ${t.bold("prompt-sizes (passos):")} ${Object.keys(ps).join(", ")}`);
  }

  console.log("");
  console.log(t.bold("Diagnóstico de falhas"));
  const sigs = collectFailureSignals(outDir, {
    runLog: sum.runLog,
    review: sum.review,
    architectVal: sum.architectVal,
  });
  if (sigs.length) {
    for (const s of sigs.slice(0, 20)) {
      console.log(`  - ${s}`);
    }
  } else {
    console.log("  (sem sinais categorizados)");
  }
  if (sum.runLog && Array.isArray(sum.runLog.errors) && sum.runLog.errors.length) {
    console.log(`  ${t.bold("run-log.errors:")}`);
    for (const er of sum.runLog.errors.slice(0, 10)) {
      console.log(
        `    [${er.step || "?"}] ${String(er.message || "").slice(0, 600)}`,
      );
    }
  }

  console.log("");
  console.log(t.bold("Artefactos"));
  const { preferred, rest } = listArtifactNames(outDir);
  for (const n of preferred) {
    const fp = path.join(outDir, n);
    let sz = "";
    try {
      sz = ` (${fs.statSync(fp).size} B)`;
    } catch (_) {
      sz = "";
    }
    console.log(`  • ${n}${sz}`);
  }
  if (rest.length) {
    console.log(t.dim(`  — outros (${rest.length}) —`));
    for (const n of rest.slice(0, 40)) {
      console.log(`  • ${n}`);
    }
    if (rest.length > 40) console.log(t.dim(`    … +${rest.length - 40} ficheiros`));
  }
}

module.exports = { runInspect, resolveInspectSelection };
