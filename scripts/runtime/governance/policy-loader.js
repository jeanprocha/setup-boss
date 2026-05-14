/**
 * Carrega `.setup-boss/policy.json`, env e overrides de CLI.
 */

const fs = require("fs");
const path = require("path");

const {
  PROFILE_DEFAULTS,
  DEFAULT_PROTECTED_SUFFIXES,
  normalizeProfileName,
} = require("./profiles");

function readJsonSafe(p) {
  try {
    const o = JSON.parse(fs.readFileSync(p, "utf-8"));
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
}

function coerceNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @returns {"report"|"enforce"|null} */
function normalizeGovernanceRuntimeMode(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "enforce") return "enforce";
  if (s === "report") return "report";
  return null;
}

/** @returns {"block"|"approval"|null} */
function normalizeValidationCriticalResolution(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "approval") return "approval";
  if (s === "block") return "block";
  return null;
}

function resolveProjectPolicyPath(projectRootAbs) {
  return path.join(projectRootAbs, ".setup-boss", "policy.json");
}

function uniqNormalizedPaths(entries) {
  const seen = new Set();
  const out = [];

  for (const x of entries || []) {
    const s = String(x || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;

    seen.add(k);
    out.push(s);
  }

  return out;
}

/**
 * Alinha env do processo com flags explícitas de CLI (run / apply / resume).
 * Só altera variáveis quando o valor correspondente é passado em flowOpts.
 *
 * @param {{ policyProfile?: string | null, forcePolicyBypass?: boolean, disableGovernance?: boolean } | null | undefined} flowOpts
 */
function applyCliGovernanceToProcessEnv(flowOpts) {
  if (!flowOpts || typeof flowOpts !== "object") return;
  const pp = flowOpts.policyProfile;
  if (pp != null && String(pp).trim()) {
    process.env.SETUP_BOSS_POLICY_PROFILE = String(pp).trim();
  }
  if (flowOpts.forcePolicyBypass === true) {
    process.env.SETUP_BOSS_FORCE_POLICY_BYPASS = "1";
  }
  if (flowOpts.disableGovernance === true) {
    process.env.SETUP_BOSS_DISABLE_GOVERNANCE = "1";
  }
}

function envOverridesParsed() {
  const profileRaw = process.env.SETUP_BOSS_POLICY_PROFILE || "";
  const cost = coerceNum(process.env.SETUP_BOSS_POLICY_MAX_COST_USD, null);
  const files = coerceNum(process.env.SETUP_BOSS_POLICY_MAX_FILES, null);
  const corrections = coerceNum(
    process.env.SETUP_BOSS_POLICY_MAX_CORRECTIONS,
    null,
  );

  return {
    profile: normalizeProfileName(profileRaw),
    max_estimated_cost_usd: Number.isFinite(cost) ? cost : null,
    max_files: Number.isFinite(files) ? Math.max(1, Math.floor(files)) : null,
    max_correction_iterations: Number.isFinite(corrections)
      ? Math.max(0, Math.floor(corrections))
      : null,
    bypass: /^1|true|yes$/i.test(
      String(process.env.SETUP_BOSS_FORCE_POLICY_BYPASS || "").trim(),
    ),
    disabled:
      /^1|true|yes$/i.test(
        String(process.env.SETUP_BOSS_DISABLE_GOVERNANCE || "").trim(),
      ) || /^NONE|OFF|DISABLED$/i.test(profileRaw.trim()),
    governance_runtime_mode: normalizeGovernanceRuntimeMode(
      process.env.SETUP_BOSS_GOVERNANCE_MODE,
    ),
    validation_critical_resolution: normalizeValidationCriticalResolution(
      process.env.SETUP_BOSS_VALIDATION_CRITICAL_RESOLUTION,
    ),
  };
}

/**
 * @typedef {typeof PROFILE_DEFAULTS.NORMAL & {
 *   profile: string,
 *   protected_paths: string[],
 *   max_correction_iterations_cap: number | null,
 *   governance_runtime_mode: "report" | "enforce",
 *   validation_critical_resolution: "block" | "approval",
 * }} PolicyMerged */

/**
 * @param {{
 *   projectRootAbs: string,
 *   policyProfileCli?: string | null,
 *   forcePolicyBypassFlow?: boolean,
 *   disableGovernanceFlow?: boolean,
 * }} opts
 */
function loadMergedPolicy(opts) {
  const envOv = envOverridesParsed();

  const filePath = opts.projectRootAbs
    ? resolveProjectPolicyPath(opts.projectRootAbs)
    : "";

  const filePresent = !!(filePath && fs.existsSync(filePath));
  const fileObjRaw = filePresent ? readJsonSafe(filePath) : {};

  const policyProfileCliTrim =
    opts.policyProfileCli != null && String(opts.policyProfileCli).trim()
      ? String(opts.policyProfileCli).trim()
      : null;

  if (opts.disableGovernanceFlow || envOv.disabled) {
    /** @type {PolicyMerged} */
    const nm = {
      ...PROFILE_DEFAULTS.NORMAL,
      profile: "NORMAL",
      protected_paths: uniqNormalizedPaths(DEFAULT_PROTECTED_SUFFIXES.slice()),
      max_correction_iterations_cap: null,
    };
    return {
      disabled: true,
      profile_resolved: "NORMAL",
      merged: nm,
      policy_file_path: filePath,
      policy_file_present: filePresent,
      bypass:
        !!(opts.forcePolicyBypassFlow || envOv.bypass) ||
        /^1|true|yes$/i.test(String(fileObjRaw.allow_operator_bypass_always)),
      source_layers: ["governance_disabled"],
    };
  }

  const pick = (...vals) => vals.find((v) => v !== undefined && v !== null);

  const profileFromFile =
    typeof fileObjRaw.profile === "string"
      ? normalizeProfileName(fileObjRaw.profile)
      : null;

  const cliForcedProfile = Boolean(policyProfileCliTrim);

  /** @type {string} */
  let resolvedProfile = profileFromFile || envOv.profile;
  if (policyProfileCliTrim) {
    resolvedProfile = normalizeProfileName(policyProfileCliTrim);
  }

  resolvedProfile = resolvedProfile || "NORMAL";

  let baseline =
    PROFILE_DEFAULTS[resolvedProfile] || PROFILE_DEFAULTS.NORMAL;

  /** @type {PolicyMerged} */
  let merged = {
    ...baseline,
    profile: resolvedProfile,
    enforcement: baseline.enforcement,
    max_estimated_cost_usd: pick(
      fileObjRaw.max_estimated_cost_usd != null ? Number(fileObjRaw.max_estimated_cost_usd) : null,
      baseline.max_estimated_cost_usd ?? null,
    ),
    warn_cost_ratio_of_cap: pick(
      fileObjRaw.warn_cost_ratio_of_cap != null
        ? Number(fileObjRaw.warn_cost_ratio_of_cap)
        : null,
      baseline.warn_cost_ratio_of_cap ?? null,
    ),
    max_files_estimate: pick(
      fileObjRaw.max_files != null ? Math.floor(Number(fileObjRaw.max_files)) : null,
      fileObjRaw.max_files_estimate != null
        ? Math.floor(Number(fileObjRaw.max_files_estimate))
        : null,
      baseline.max_files_estimate ?? null,
    ),
    max_prompt_chars_estimate: pick(
      fileObjRaw.max_prompt_chars != null
        ? Math.floor(Number(fileObjRaw.max_prompt_chars))
        : null,
      fileObjRaw.max_prompt_chars_estimate != null
        ? Math.floor(Number(fileObjRaw.max_prompt_chars_estimate))
        : null,
      baseline.max_prompt_chars_estimate ?? null,
    ),
    inflation_warn_threshold: pick(
      fileObjRaw.inflation_warn_threshold != null
        ? Number(fileObjRaw.inflation_warn_threshold)
        : null,
      baseline.inflation_warn_threshold ?? null,
    ),

    require_dry_run_for_high_risk: pick(
      fileObjRaw.require_dry_run_for_high_risk,
      baseline.require_dry_run_for_high_risk,
    ),
    require_dry_run_for_runtime_core: pick(
      fileObjRaw.require_dry_run_for_runtime_core,
      baseline.require_dry_run_for_runtime_core,
    ),
    require_dry_run_for_migration_or_security: pick(
      fileObjRaw.require_dry_run_for_migration_or_security,
      baseline.require_dry_run_for_migration_or_security,
    ),
    require_manual_confirm_escalated: pick(
      fileObjRaw.require_manual_confirm_escalated,
      baseline.require_manual_confirm_escalated,
    ),
    require_apply_later_for_runtime_core_estimate: pick(
      fileObjRaw.require_apply_later_for_runtime_core_estimate,
      baseline.require_apply_later_for_runtime_core_estimate,
    ),
    block_physical_apply_when_protected_match: pick(
      fileObjRaw.block_physical_apply_when_protected_match,
      baseline.block_physical_apply_when_protected_match,
    ),

    governance_runtime_mode: pick(
      normalizeGovernanceRuntimeMode(fileObjRaw.governance_runtime_mode),
      normalizeGovernanceRuntimeMode(baseline.governance_runtime_mode),
      "report",
    ),

    validation_critical_resolution: pick(
      normalizeValidationCriticalResolution(fileObjRaw.validation_critical_resolution),
      normalizeValidationCriticalResolution(baseline.validation_critical_resolution),
      "block",
    ),

    max_correction_iterations_cap:
      pick(
        fileObjRaw.max_correction_iterations_cap != null
          ? Math.floor(Number(fileObjRaw.max_correction_iterations_cap))
          : null,
        fileObjRaw.max_correction_iterations != null
          ? Math.floor(Number(fileObjRaw.max_correction_iterations))
          : null,
        baseline.max_correction_iterations_cap ?? null,
        null,
      ),

    protected_paths: uniqNormalizedPaths([
      ...(fileObjRaw.protected_paths || []),
      ...DEFAULT_PROTECTED_SUFFIXES,
    ]),
  };

  if (cliForcedProfile) {
    baseline = PROFILE_DEFAULTS[merged.profile] || PROFILE_DEFAULTS.NORMAL;
    merged.enforcement = baseline.enforcement;

    const fileCapsFiles =
      fileObjRaw.max_files != null || fileObjRaw.max_files_estimate != null;

    merged.max_files_estimate = pick(
      fileObjRaw.max_files != null
        ? Math.floor(Number(fileObjRaw.max_files))
        : null,
      fileObjRaw.max_files_estimate != null
        ? Math.floor(Number(fileObjRaw.max_files_estimate))
        : null,
      fileCapsFiles ? null : baseline.max_files_estimate ?? merged.max_files_estimate,
      merged.max_files_estimate,
    );

    const fileCapsPrompt =
      fileObjRaw.max_prompt_chars != null ||
      fileObjRaw.max_prompt_chars_estimate != null;
    merged.max_prompt_chars_estimate = pick(
      fileObjRaw.max_prompt_chars != null
        ? Math.floor(Number(fileObjRaw.max_prompt_chars))
        : null,
      fileObjRaw.max_prompt_chars_estimate != null
        ? Math.floor(Number(fileObjRaw.max_prompt_chars_estimate))
        : null,
      fileCapsPrompt ? null : baseline.max_prompt_chars_estimate ?? merged.max_prompt_chars_estimate,
      merged.max_prompt_chars_estimate,
    );

    merged.inflation_warn_threshold = pick(
      fileObjRaw.inflation_warn_threshold != null
        ? Number(fileObjRaw.inflation_warn_threshold)
        : null,
      baseline.inflation_warn_threshold,
      merged.inflation_warn_threshold,
    );

    merged.warn_cost_ratio_of_cap = pick(
      fileObjRaw.warn_cost_ratio_of_cap != null
        ? Number(fileObjRaw.warn_cost_ratio_of_cap)
        : null,
      baseline.warn_cost_ratio_of_cap,
      merged.warn_cost_ratio_of_cap,
    );

    merged.require_dry_run_for_high_risk = pick(
      fileObjRaw.require_dry_run_for_high_risk,
      baseline.require_dry_run_for_high_risk,
    );
    merged.require_dry_run_for_runtime_core = pick(
      fileObjRaw.require_dry_run_for_runtime_core,
      baseline.require_dry_run_for_runtime_core,
    );
    merged.require_dry_run_for_migration_or_security = pick(
      fileObjRaw.require_dry_run_for_migration_or_security,
      baseline.require_dry_run_for_migration_or_security,
    );
    merged.require_manual_confirm_escalated = pick(
      fileObjRaw.require_manual_confirm_escalated,
      baseline.require_manual_confirm_escalated,
    );
    merged.require_apply_later_for_runtime_core_estimate = pick(
      fileObjRaw.require_apply_later_for_runtime_core_estimate,
      baseline.require_apply_later_for_runtime_core_estimate,
    );
    merged.block_physical_apply_when_protected_match = pick(
      fileObjRaw.block_physical_apply_when_protected_match,
      baseline.block_physical_apply_when_protected_match,
    );

    merged.max_correction_iterations_cap = pick(
      fileObjRaw.max_correction_iterations_cap != null
        ? Math.floor(Number(fileObjRaw.max_correction_iterations_cap))
        : null,
      fileObjRaw.max_correction_iterations != null
        ? Math.floor(Number(fileObjRaw.max_correction_iterations))
        : null,
      baseline.max_correction_iterations_cap ?? merged.max_correction_iterations_cap,
    );

    merged.governance_runtime_mode = pick(
      normalizeGovernanceRuntimeMode(fileObjRaw.governance_runtime_mode),
      normalizeGovernanceRuntimeMode(baseline.governance_runtime_mode),
      merged.governance_runtime_mode,
    );

    merged.validation_critical_resolution = pick(
      normalizeValidationCriticalResolution(fileObjRaw.validation_critical_resolution),
      normalizeValidationCriticalResolution(baseline.validation_critical_resolution),
      merged.validation_critical_resolution,
    );
  }

  if (envOv.max_estimated_cost_usd != null) {
    merged.max_estimated_cost_usd = envOv.max_estimated_cost_usd;
  }

  if (envOv.max_files != null) {
    merged.max_files_estimate = envOv.max_files;
  }

  if (envOv.max_correction_iterations != null) {
    merged.max_correction_iterations_cap = envOv.max_correction_iterations;
  }

  if (envOv.governance_runtime_mode != null) {
    merged.governance_runtime_mode = envOv.governance_runtime_mode;
  }

  if (envOv.validation_critical_resolution != null) {
    merged.validation_critical_resolution = envOv.validation_critical_resolution;
  }

  merged.profile = merged.profile || resolvedProfile;

  const bypass =
    Boolean(opts.forcePolicyBypassFlow || envOv.bypass) ||
    /^1|true|yes$/i.test(String(fileObjRaw.allow_operator_bypass_always || ""));

  const layers = [];
  layers.push(cliForcedProfile ? "cli_profile_override" : "no_cli_profile");
  if (filePresent) layers.push(".setup-boss/policy.json");
  layers.push(profileFromFile ? `file_profile:${profileFromFile}` : "profile_env_or_normal");
  if (policyProfileCliTrim) layers.push(`cli_profile:${policyProfileCliTrim}`);

  return {
    disabled: false,
    profile_resolved: merged.profile,
    merged,
    policy_file_path: filePath,
    policy_file_present: filePresent,
    bypass,
    source_layers: layers,
  };
}

module.exports = {
  loadMergedPolicy,
  resolveProjectPolicyPath,
  envOverridesParsed,
  uniqNormalizedPaths,
  applyCliGovernanceToProcessEnv,
  normalizeGovernanceRuntimeMode,
  normalizeValidationCriticalResolution,
};
