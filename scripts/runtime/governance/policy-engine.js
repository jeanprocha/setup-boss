/**
 * Motor principal de política + artefactos policy-report.json / governance-decisions.json.
 */

const fs = require("fs");
const path = require("path");

const { loadMergedPolicy } = require("./policy-loader");
const {
  signalsFromPreflight,
  normalizeRel,
  collectProtectedTouches,
} = require("./governance-checks");

const SCHEMA_POLICY_REPORT = "2.7-policy-report";
const SCHEMA_DECISIONS = "2.7-governance-decisions";

function bypassActive(pack) {
  return !!(pack && pack.bypass === true);
}

function allowsHardGate(pack) {
  if (!pack || !pack.merged) return false;
  if (bypassActive(pack)) return false;
  const e = String(pack.merged.enforcement || "").toUpperCase();
  return e === "BLOCK_CRITICAL" || e === "BLOCK_ENTERPRISE";
}

function mandatoryDryWithoutBypass(flag, dryFlow, bypass) {
  return Boolean(flag) && dryFlow !== true && bypass !== true;
}

/** @typedef {{ code: string, severity: string, message?: string, blocker?: boolean }} GovDecision */

/**
 * Avalia política antes do pipeline (após analyzer de preflight).
 */
function evaluateRuntimeGovernance(input) {
  const flowOptions = input.flowOptions || {};
  const pack = loadMergedPolicy({
    projectRootAbs: input.projectRootAbs,
    policyProfileCli: flowOptions.policyProfile || null,
    forcePolicyBypassFlow: flowOptions.forcePolicyBypass === true,
    disableGovernanceFlow: flowOptions.disableGovernance === true,
  });

  /** @type {GovDecision[]} */
  const decisions = [];
  /** @type {{ code: string, severity: string }[]} */
  const telemetryCodes = [];

  function emitTc(code, severity) {
    telemetryCodes.push({ code: String(code), severity: String(severity) });
    if (input.telemetry && typeof input.telemetry.emit === "function") {
      input.telemetry.emit(`governance.${code}`, { severity });
    }
  }

  const envMaxCorrRaw = Number(input.envMaxCorrections);
  const envMaxCorr =
    Number.isFinite(envMaxCorrRaw) && envMaxCorrRaw >= 0 ? envMaxCorrRaw : 3;

  function effectiveCorrections(mergedCaps) {
    let cap = mergedCaps.max_correction_iterations_cap;
    cap =
      cap != null && Number.isFinite(Number(cap)) ? Number(cap) : null;
    if (cap == null) return envMaxCorr;
    return Math.min(envMaxCorr, Math.max(0, cap));
  }

  if (pack.disabled) {
    emitTc("policy.disabled", "INFO");
    return {
      loaded: pack,
      decisions,
      telemetryCodes,
      block_pipeline: false,
      mandated_dry_run: false,
      mandate_apply_later_estimated: false,
      needs_operator_confirmation: false,
      bypass_used: false,
      effective_max_correction_iterations: envMaxCorr,
      governance_mirror: {
        governance_schema: SCHEMA_POLICY_REPORT,
        governance_disabled: true,
        profile_resolved: "NORMAL",
        effective_max_correction_iterations: envMaxCorr,
      },
      policy_report_payload: null,
      decisions_payload: null,
    };
  }

  const merged = pack.merged;
  const sig = signalsFromPreflight(input.preflightReport, input.taskContent);
  const hard = allowsHardGate(pack);

  let mandatedDryRun = false;
  const motivosDry = [];

  if (merged.require_dry_run_for_high_risk && sig.elevatedRisk) {
    mandatedDryRun = true;
    motivosDry.push("elevated_risk");
  }
  if (merged.require_dry_run_for_runtime_core && sig.runtimeCoreSuggested) {
    mandatedDryRun = true;
    motivosDry.push("runtime_core_signals");
  }
  if (
    merged.require_dry_run_for_migration_or_security &&
    sig.migrationOrSecuritySignals
  ) {
    mandatedDryRun = true;
    motivosDry.push("migration_or_security");
  }
  if (
    String(merged.enforcement || "").toUpperCase() === "BLOCK_ENTERPRISE" &&
    sig.elevatedComplexity &&
    sig.elevatedRisk
  ) {
    mandatedDryRun = true;
    motivosDry.push("enterprise_complexity_and_risk");
  }

  const mandateApplyLaterGuess =
    merged.require_apply_later_for_runtime_core_estimate &&
    sig.runtimeCoreSuggested &&
    !input.dryRun;

  if (mandatoryDryWithoutBypass(mandatedDryRun, input.dryRun, pack.bypass)) {
    decisions.push({
      code: "MANDATORY_DRY_RUN",
      severity: hard ? "BLOCK" : "WARN",
      message:
        `Perfil ${merged.profile}: dry-run obrigatório (${motivosDry.join(", ")}). Rode com --dry-run ou apply depois.`,
      blocker: hard,
    });
    emitTc("dry_run.required", hard ? "BLOCK" : "WARN");

    if (!hard) {
      decisions.push({
        code: "POLICY_NOTICE_DRY_RUN_SOFT",
        severity: "NOTICE",
        message:
          "Perfis SOFT (WARN enforcement) não travam aqui — decisões implícitas passam visíveis, operador soberano.",
        blocker: false,
      });
    }
  }

  if (mandatedDryRun && !input.dryRun && bypassActive(pack)) {
    decisions.push({
      code: "POLICY_OVERRIDE_MANDATORY_DRY_RUN",
      severity: "OVERRIDE",
      message: "Bypass explícito permite apply físico mesmo com política pedindo dry-run.",
      blocker: false,
    });
    emitTc("dry_run.override", "OVERRIDE");
  }

  if (mandateApplyLaterGuess && hard && bypassActive(pack) === false) {
    decisions.push({
      code: "MANDATE_APPLY_LATER_RUNTIME_HINT",
      severity: hard ? "BLOCK" : "WARN",
      message:
        "Política sugere fluxo dry-run → apply físico apenas via CLI (setup-boss apply).",
      blocker: hard,
    });
    emitTc("apply_later.runtime_hint", hard ? "BLOCK" : "WARN");
  }

  const costMid =
    input.preflightReport?.cost?.estimated_cost_usd_mid != null
      ? Number(input.preflightReport.cost.estimated_cost_usd_mid)
      : null;
  const pricing = !!input.preflightReport?.cost?.pricing_available;

  if (
    pricing &&
    merged.max_estimated_cost_usd != null &&
    Number.isFinite(Number(merged.max_estimated_cost_usd)) &&
    costMid != null
  ) {
    const capUsd = Number(merged.max_estimated_cost_usd);
    const ratio =
      merged.warn_cost_ratio_of_cap != null &&
      Number.isFinite(Number(merged.warn_cost_ratio_of_cap))
        ? Number(merged.warn_cost_ratio_of_cap)
        : 0.92;
    const warnLine = capUsd * ratio;

    if (costMid > capUsd) {
      const blockCost = hard;
      decisions.push({
        code: "COST_HARD_CAP_EXCEEDED",
        severity: blockCost ? "BLOCK" : "WARN",
        message: blockCost
          ? `Estimated cost exceeds policy: Estimated ~$${costMid.toFixed(
              2,
            )}, policy max ~$${capUsd.toFixed(2)}`
          : `Custo (${costMid.toFixed(2)} USD) acima do teto configurado (${capUsd.toFixed(
              2,
            )}) — WARN.`,
        blocker: blockCost && bypassActive(pack) === false,
      });
      emitTc("cost.over_cap", blockCost ? "BLOCK" : "WARN");
    } else if (costMid >= warnLine) {
      decisions.push({
        code: "COST_SOFT_THRESHOLD",
        severity: "WARN",
        message: `Estimativa $${costMid.toFixed(
          2,
        )} acima dos ${ratio * 100}% do máximo ($${capUsd.toFixed(2)}).`,
        blocker: false,
      });
      emitTc("cost.near_cap", "WARN");
    }
  }

  const estFilesMax = Number(sig.maxFilesEstimate) || 0;
  if (
    merged.max_files_estimate != null &&
    Number.isFinite(Number(merged.max_files_estimate))
  ) {
    const capFiles = Number(merged.max_files_estimate);

    if (estFilesMax > capFiles) {
      const blockScope = allowsHardGate(pack);

      decisions.push({
        code: "FILES_ESTIMATE_OVER_POLICY_CAP",
        severity: blockScope ? "BLOCK" : "WARN",
        message: `${estFilesMax} ficheiros estimados ultrapassam política (${capFiles}).`,
        blocker: blockScope && bypassActive(pack) === false,
      });

      emitTc("files_estimate.violation", blockScope ? "BLOCK" : "WARN");
    }
  }

  const estChars =
    input.preflightReport?.prompts?.totals?.est_prompt_chars_sum != null
      ? Number(input.preflightReport.prompts.totals.est_prompt_chars_sum)
      : null;

  if (
    merged.max_prompt_chars_estimate != null &&
    Number.isFinite(Number(merged.max_prompt_chars_estimate)) &&
    estChars != null
  ) {
    const capChars = Number(merged.max_prompt_chars_estimate);

    if (estChars > capChars) {
      const blockPrompt = hard;

      decisions.push({
        code: "PROMPT_SIZE_ABOVE_POLICY_CAP",
        severity: blockPrompt ? "BLOCK" : "WARN",
        message:
          `[Prompt chars estimados: ${Math.round(estChars)}, limite: ${capChars}]`,
        blocker: blockPrompt && bypassActive(pack) === false,
      });

      emitTc("prompt_size.violation", blockPrompt ? "BLOCK" : "WARN");
    }
  }

  const histInfl =
    input.preflightReport?.historical_intelligence?.aggregates
      ?.avg_inflation_ratio != null
      ? Number(
          input.preflightReport.historical_intelligence.aggregates
            .avg_inflation_ratio,
        )
      : null;

  if (
    histInfl != null &&
    merged.inflation_warn_threshold != null &&
    Number.isFinite(Number(merged.inflation_warn_threshold)) &&
    histInfl > Number(merged.inflation_warn_threshold)
  ) {
    decisions.push({
      code: "INFLATION_HISTORICAL_HIGH",
      severity: "WARN",
      message: `Inflação histórica média (${histInfl.toFixed(3)}) > threshold (${Number(
        merged.inflation_warn_threshold,
      ).toFixed(3)}).`,
      blocker: false,
    });
    emitTc("cost.inflation_signal", "WARN");
  }

  const effCorr = effectiveCorrections(merged);
  if (merged.max_correction_iterations_cap != null) {
    decisions.push({
      code: "CORRECTION_CAP_POLICY",
      severity: "INFO",
      message: `Corrections effective cap combinado: ${effCorr}.`,
      blocker: false,
    });
    emitTc("correction.cap_active", "INFO");
  }

  let needsOperatorConfirmation =
    Boolean(merged.require_manual_confirm_escalated) &&
    (sig.elevatedRisk ||
      sig.runtimeCoreSuggested ||
      sig.migrationOrSecuritySignals);

  if (
    String(merged.enforcement || "").toUpperCase() === "BLOCK_ENTERPRISE" &&
    sig.elevatedComplexity &&
    mandateApplyLaterGuess
  ) {
    needsOperatorConfirmation = true;
  }

  const blockPipeline =
    bypassActive(pack) === false && decisions.some((d) => d.blocker === true);

  const lifecycleHints = [];
  if (blockPipeline) lifecycleHints.push("POLICY_BLOCKED");
  if (bypassActive(pack)) lifecycleHints.push("POLICY_OVERRIDE");
  if (needsOperatorConfirmation) lifecycleHints.push("AWAITING_APPROVAL");

  const governanceMirror = {
    governance_schema: SCHEMA_POLICY_REPORT,
    governance_disabled: false,
    profile_resolved: merged.profile,
    enforcement: merged.enforcement,
    effective_max_correction_iterations: effCorr,
    bypass_used_this_run: bypassActive(pack),
    sensitive_runtime_signals_task: !!sig.runtimeCoreSuggested,
    dry_run_policy_mandatory: mandatedDryRun,
    dry_run_satisfied_flow: !!input.dryRun,
    manual_confirmation_recommended: !!needsOperatorConfirmation,
    blockers_detected_pre_pipeline: Boolean(blockPipeline),
    apply_later_policy_signal: mandateApplyLaterGuess,
    policy_violations_blockers: decisions.filter((d) => d.blocker === true)
      .length,
  };

  const policy_report_payload = {
    governance_schema: SCHEMA_POLICY_REPORT,
    generated_at: new Date().toISOString(),
    profile_resolved: pack.profile_resolved,
    policy_sources: pack.source_layers,
    policy_file_path: pack.policy_file_path,
    policy_file_present: pack.policy_file_present,
    bypass_flag: bypassActive(pack),
    enforcement: merged.enforcement,
    signals_preflight_aligned: sig,
    decisions_snapshot: decisions,
    telemetry_compact: telemetryCodes,
    mandated_dry_run: mandatedDryRun,
    mandate_apply_later_estimated: mandateApplyLaterGuess,
    governance_profile: merged.profile,
    correction_cap_effective: effCorr,
  };

  const decisions_payload = {
    governance_schema: SCHEMA_DECISIONS,
    generated_at: new Date().toISOString(),
    profile_resolved: pack.profile_resolved,
    overrides_used: bypassActive(pack),
    decisions,
    blocker_codes: decisions.filter((x) => x.blocker === true).map((x) => x.code),
    rationale_notes: [
      "Governança runtime local; overrides explicitos persistidos neste ficheiro e policy-report.json.",
    ],
    lifecycle_hints: lifecycleHints,
  };

  return {
    loaded: pack,
    decisions,
    telemetryCodes,
    block_pipeline: blockPipeline,
    mandated_dry_run: mandatedDryRun,
    mandate_apply_later_estimated: mandateApplyLaterGuess,
    needs_operator_confirmation: needsOperatorConfirmation,
    bypass_used: bypassActive(pack),
    effective_max_correction_iterations: effCorr,
    governance_mirror: governanceMirror,
    policy_report_payload,
    decisions_payload,
  };
}

function writeGovernanceArtifacts(outputDir, evalPack) {
  if (!outputDir || !evalPack) return;
  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (evalPack.policy_report_payload) {
    fs.writeFileSync(
      path.join(dir, "policy-report.json"),
      JSON.stringify(evalPack.policy_report_payload, null, 2),
      "utf-8",
    );
  }

  if (evalPack.decisions_payload) {
    fs.writeFileSync(
      path.join(dir, "governance-decisions.json"),
      JSON.stringify(evalPack.decisions_payload, null, 2),
      "utf-8",
    );
  }
}

/**
 * Persiste auditoria das flags de governança do `resume` em governance-decisions.json
 * (mescla com payload existente, ex.: preflight ou apply físico).
 *
 * @param {string} outputDir
 * @param {{
 *   projectRootAbs: string,
 *   nextPhase: string,
 *   policyProfileCli?: string | null,
 *   forcePolicyBypass?: boolean,
 *   disableGovernance?: boolean,
 * }} opts
 */
function appendResumeGovernanceAudit(outputDir, opts) {
  if (!outputDir || !opts || typeof opts !== "object") return;
  const {
    projectRootAbs,
    nextPhase,
    policyProfileCli = null,
    forcePolicyBypass = false,
    disableGovernance = false,
  } = opts;
  const prof =
    policyProfileCli != null && String(policyProfileCli).trim()
      ? String(policyProfileCli).trim()
      : null;
  const hasCliGov =
    !!prof || forcePolicyBypass === true || disableGovernance === true;
  if (!hasCliGov) return;

  const pack = loadMergedPolicy({
    projectRootAbs,
    policyProfileCli: prof,
    forcePolicyBypassFlow: forcePolicyBypass === true,
    disableGovernanceFlow: disableGovernance === true,
  });

  const p = path.join(path.resolve(outputDir), "governance-decisions.json");
  let root = {};
  if (fs.existsSync(p)) {
    try {
      root = JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch (_) {
      root = {};
    }
  }

  const decisions = [];
  if (disableGovernance === true) {
    decisions.push({
      code: "GOVERNANCE_DISABLED_RESUME_CLI",
      severity: "INFO",
      message: "resume: --disable-governance",
    });
  } else if (prof) {
    decisions.push({
      code: "CLI_PROFILE_RESUME",
      severity: "INFO",
      message: `resume: --policy-profile=${prof}`,
    });
  }
  if (forcePolicyBypass === true && pack.disabled !== true) {
    decisions.push({
      code: "POLICY_OVERRIDE_RESUME_CLI",
      severity: "OVERRIDE",
      message: "resume: --force-policy-bypass (auditoria CLI).",
    });
  }

  root.resume_cli_audit = {
    at: new Date().toISOString(),
    next_phase: nextPhase != null ? String(nextPhase) : null,
    policy_profile_cli: prof,
    force_policy_bypass: forcePolicyBypass === true,
    disable_governance: disableGovernance === true,
    profile_resolved: pack.profile_resolved,
    governance_disabled: pack.disabled === true,
    source_layers: Array.isArray(pack.source_layers)
      ? pack.source_layers.slice()
      : [],
    decisions,
  };

  fs.writeFileSync(p, JSON.stringify(root, null, 2), "utf-8");
}

function suggestedDryViolation(evalPack) {
  const g = evalPack.governance_mirror;
  return !!(
    g &&
    g.dry_run_policy_mandatory === true &&
    g.dry_run_satisfied_flow === false
  );
}

function mergeGovernanceIntoPreflight(preflightReport, evalPack) {
  preflightReport.governance = { ...(evalPack.governance_mirror || {}) };
  if (evalPack.loaded && evalPack.loaded.disabled === true) return;

  const reportWarnings = Array.isArray(preflightReport.warnings)
    ? preflightReport.warnings.slice()
    : [];

  for (const d of evalPack.decisions || []) {
    const sev = String(d.severity || "");
    if (!["BLOCK", "WARN", "NOTICE", "OVERRIDE", "INFO"].includes(sev)) continue;

    const code = `gov_${String(d.code).toLowerCase()}`;
    const msg =
      `[policy ${sev}] ${String(d.message || "").slice(0, 1800)}`;

    if (reportWarnings.some((w) => w.code === code)) continue;
    reportWarnings.push({ code, message: msg });
  }

  preflightReport.warnings = reportWarnings;
  escalateOperational(preflightReport, evalPack);

  preflightReport.governance.policy_recommends_dry_run_explicit =
    evalPack.block_pipeline ||
    suggestedDryViolation(evalPack) ||
    (evalPack.needs_operator_confirmation && !evalPack.bypass_used);
}

function escalateOperational(preflightReport, evalPack) {
  const cur = classifyOp(preflightReport.operational_severity);

  let target = cur;
  const shape = (evalPack.decisions || []).some((d) =>
    ["INFLATION_HISTORICAL_HIGH", "FILES_ESTIMATE_OVER_POLICY_CAP", "PROMPT_SIZE_ABOVE_POLICY_CAP"].includes(
      String(d.code),
    ),
  );
  const strongGov =
    evalPack.needs_operator_confirmation ||
    evalPack.block_pipeline ||
    suggestedDryViolation(evalPack);

  if (shape && target < 2) target = Math.max(target, 2);

  if (strongGov && target < 3) target = Math.max(target, 3);

  preflightReport.operational_severity = opLabel(target);
}

function classifyOp(level) {
  const m = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3,
    EXTREME: 3,
  };
  return m[String(level || "").toUpperCase()] ?? 0;
}

function opLabel(n) {
  const arr = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const idx = Math.min(Math.max(Number(n), 0), arr.length - 1);

  return arr[idx];
}

/**
 * Governance para apply físico (apply-later); não altera o motor de patches.
 */
function evaluateApplyGovernance(opts) {
  const pack = loadMergedPolicy({
    projectRootAbs: opts.projectRootAbs,
    policyProfileCli: opts.policyProfileCli || null,
    forcePolicyBypassFlow: opts.forcePolicyBypass === true,
    disableGovernanceFlow: opts.disableGovernance === true,
  });

  const decisions = [];
  if (pack.disabled)
    return { ok: true, decisions, profile_resolved: pack.profile_resolved };

  const hits = collectProtectedTouches(opts.changes || [], pack.merged.protected_paths);
  if (!hits.length)
    return { ok: true, decisions, profile_resolved: pack.profile_resolved };

  const readable = hits.slice(0, 16).map(
    (h) => `${normalizeRel(h.path)} ← ${h.matched_patterns.join(", ")}`,
  );

  const blockPhys =
    !!pack.merged.block_physical_apply_when_protected_match && allowsHardGate(pack);

  decisions.push({
    code: "PROTECTED_PATH_PHYSICAL_APPLY",
    severity: blockPhys && bypassActive(pack) === false ? "BLOCK" : "WARN",
    blocker: blockPhys && bypassActive(pack) === false,
    message: readable.join("; "),
  });

  if (blockPhys && bypassActive(pack) === false)
    return {
      ok: false,
      decisions,
      message: `Politica bloqueia apply directo (${readable.slice(0, 5).join(", ")} — veja bypass auditado em documentação CLI).`,
      profile_resolved: pack.profile_resolved,
      blocked_paths: hits.map((h) => h.path),
    };

  if (bypassActive(pack)) {
    decisions.push({
      code: "POLICY_OVERRIDE_PROTECTED_APPLY",
      severity: "OVERRIDE",
      message:
        "--force-policy-bypass: apply físico com paths sensíveis (auditável).",
    });
  }

  return {
    ok: true,
    decisions,
    profile_resolved: pack.profile_resolved,
  };
}

/** @returns {number|null} */
function readEffectiveMaxCorrectionFromPreflightArtifacts(outputDir) {

  try {
    const jp = path.join(outputDir, "preflight-analysis.json");


    if (!fs.existsSync(jp)) {

      return null;

    }



    const o = JSON.parse(String(fs.readFileSync(jp, "utf8")));

    const gv = o?.governance?.effective_max_correction_iterations;

    if (gv == null || !Number.isFinite(Number(gv))) return null;
    return Math.max(0, Math.floor(Number(gv)));





  }



  catch (_) {



    return null;



  }



}




module.exports = {
  evaluateRuntimeGovernance,
  writeGovernanceArtifacts,
  appendResumeGovernanceAudit,
  mergeGovernanceIntoPreflight,
  evaluateApplyGovernance,
  readEffectiveMaxCorrectionFromPreflightArtifacts,
  allowsHardGate,
  bypassActive,
};
