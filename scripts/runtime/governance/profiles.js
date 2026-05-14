/**
 * Perfis de execução (FAST / NORMAL / STRICT / ENTERPRISE).
 * Cada perfil define limites relativos aplicados antes do merge com policy.json.
 */

const PROFILE_NAMES = ["FAST", "NORMAL", "STRICT", "ENTERPRISE"];

/** @typedef {typeof PROFILE_DEFAULTS[NORMAL]} ProfileBaseline */

const PROFILE_DEFAULTS = {
  FAST: {
    governance_runtime_mode: "report",
    validation_critical_resolution: "block",
    enforcement: "WARN",
    max_estimated_cost_usd: null,
    warn_cost_ratio_of_cap: null,
    max_files_estimate: null,
    max_prompt_chars_estimate: null,
    inflation_warn_threshold: null,
    require_dry_run_for_high_risk: false,
    require_dry_run_for_runtime_core: false,
    require_dry_run_for_migration_or_security: false,
    require_manual_confirm_escalated: false,
    require_apply_later_for_runtime_core_estimate: false,
    block_physical_apply_when_protected_match: false,
    max_correction_iterations_cap: null,
  },
  NORMAL: {
    governance_runtime_mode: "report",
    validation_critical_resolution: "block",
    enforcement: "WARN",
    max_estimated_cost_usd: null,
    warn_cost_ratio_of_cap: 0.92,
    max_files_estimate: null,
    max_prompt_chars_estimate: null,
    inflation_warn_threshold: 0.75,
    require_dry_run_for_high_risk: false,
    require_dry_run_for_runtime_core: false,
    require_dry_run_for_migration_or_security: false,
    require_manual_confirm_escalated: false,
    require_apply_later_for_runtime_core_estimate: false,
    block_physical_apply_when_protected_match: false,
    max_correction_iterations_cap: null,
  },
  STRICT: {
    governance_runtime_mode: "report",
    validation_critical_resolution: "block",
    enforcement: "BLOCK_CRITICAL",
    max_estimated_cost_usd: null,
    warn_cost_ratio_of_cap: 0.9,
    max_files_estimate: 24,
    max_prompt_chars_estimate: 180_000,
    inflation_warn_threshold: 0.72,
    require_dry_run_for_high_risk: true,
    require_dry_run_for_runtime_core: true,
    require_dry_run_for_migration_or_security: true,
    require_manual_confirm_escalated: true,
    require_apply_later_for_runtime_core_estimate: false,
    block_physical_apply_when_protected_match: true,
    max_correction_iterations_cap: null,
  },
  ENTERPRISE: {
    governance_runtime_mode: "report",
    validation_critical_resolution: "block",
    enforcement: "BLOCK_ENTERPRISE",
    max_estimated_cost_usd: null,
    warn_cost_ratio_of_cap: 0.85,
    max_files_estimate: 20,
    max_prompt_chars_estimate: 120_000,
    inflation_warn_threshold: 0.68,
    require_dry_run_for_high_risk: true,
    require_dry_run_for_runtime_core: true,
    require_dry_run_for_migration_or_security: true,
    require_manual_confirm_escalated: true,
    require_apply_later_for_runtime_core_estimate: true,
    block_physical_apply_when_protected_match: true,
    max_correction_iterations_cap: null,
  },
};

const DEFAULT_PROTECTED_SUFFIXES = [
  "scripts/runtime/",
  "runtime/orchestration.js",
  "runtime/governance/",
  "orchestration.js",
  "executor.js",
  "correction.js",
  "replay/apply-later.js",
  "replay/resume-engine.js",
];

function normalizeProfileName(raw) {
  const upper = String(raw || "").trim().toUpperCase();
  if (/^(FAST|QUICK|DEV)$/.test(upper)) return "FAST";
  const m = upper.match(/\b(FAST|NORMAL|STRICT|ENTERPRISE)\b/);
  if (m) return m[1];
  return "NORMAL";
}

module.exports = {
  PROFILE_NAMES,
  PROFILE_DEFAULTS,
  DEFAULT_PROTECTED_SUFFIXES,
  normalizeProfileName,
};
