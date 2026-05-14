/**
 * Resolve modo effectivo do Governance Runtime (env + policy + perfil).
 */

const {
  GOVERNANCE_RUNTIME_MODE_REPORT,
  GOVERNANCE_RUNTIME_MODE_ENFORCE,
  VALIDATION_CRITICAL_RESOLUTION_APPROVAL,
} = require("./governance-runtime-constants");
const { loadMergedPolicy } = require("./policy-loader");

/**
 * @param {string} projectRootAbs
 * @param {{ policyProfile?: string | null, forcePolicyBypass?: boolean, disableGovernance?: boolean }} [flowOpts]
 */
function resolveGovernanceRuntimeMode(projectRootAbs, flowOpts = {}) {
  const pack = loadMergedPolicy({
    projectRootAbs: projectRootAbs || "",
    policyProfileCli: flowOpts.policyProfile != null ? flowOpts.policyProfile : null,
    forcePolicyBypassFlow: flowOpts.forcePolicyBypass === true,
    disableGovernanceFlow: flowOpts.disableGovernance === true,
  });

  if (pack.disabled) {
    return {
      mode: GOVERNANCE_RUNTIME_MODE_REPORT,
      allow_hard_enforcement: false,
      validation_critical_resolution: "block",
      pack,
    };
  }

  const mode =
    pack.merged.governance_runtime_mode === GOVERNANCE_RUNTIME_MODE_ENFORCE
      ? GOVERNANCE_RUNTIME_MODE_ENFORCE
      : GOVERNANCE_RUNTIME_MODE_REPORT;

  const allow_hard_enforcement =
    mode === GOVERNANCE_RUNTIME_MODE_ENFORCE && !pack.bypass;

  const validation_critical_resolution =
    pack.merged.validation_critical_resolution === VALIDATION_CRITICAL_RESOLUTION_APPROVAL
      ? VALIDATION_CRITICAL_RESOLUTION_APPROVAL
      : "block";

  return { mode, allow_hard_enforcement, validation_critical_resolution, pack };
}

module.exports = {
  resolveGovernanceRuntimeMode,
};
