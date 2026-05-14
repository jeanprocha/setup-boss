/**
 * Erro terminal padronizado para enforcement do Governance Runtime.
 */

const { RuntimeTerminalError } = require("../runtime-errors");
const { GOVERNANCE_PIPELINE_BLOCKED_CODE } = require("./governance-runtime-constants");

class GovernanceEnforcementError extends RuntimeTerminalError {
  /**
   * @param {string} message
   * @param {{
   *   code?: string,
   *   source_runtime?: string,
   *   governance_phase?: string,
   *   blocker_codes?: string[],
   *   replay_safe?: boolean,
   *   loggerHandled?: boolean,
   * }=} opts
   */
  constructor(message, opts = {}) {
    super(message || "Governance enforcement bloqueou o pipeline.", {
      code: opts.code || GOVERNANCE_PIPELINE_BLOCKED_CODE,
      exitCode: 1,
      loggerHandled: opts.loggerHandled !== false,
    });
    this.name = "GovernanceEnforcementError";
    this.source_runtime = String(opts.source_runtime || "validation");
    this.governance_phase = String(opts.governance_phase || "post_validation");
    this.blocker_codes = Array.isArray(opts.blocker_codes)
      ? opts.blocker_codes.map((x) => String(x))
      : [];
    this.replay_safe = opts.replay_safe !== false;
  }

  toGovernanceContract() {
    return {
      code: this.code,
      source_runtime: this.source_runtime,
      governance_phase: this.governance_phase,
      blocker_codes: this.blocker_codes,
      replay_safe: this.replay_safe,
      message: this.message,
    };
  }
}

module.exports = {
  GovernanceEnforcementError,
};
