/**
 * Execução pausa para HITL — governance approval pendente (v1).
 */

const { RuntimeTerminalError } = require("../runtime-errors");
const { GOVERNANCE_AWAITING_APPROVAL_CODE } = require("./governance-runtime-constants");

class GovernanceAwaitingApprovalError extends RuntimeTerminalError {
  /**
   * @param {string} message
   * @param {{
   *   approval_id?: string,
   *   governance_phase?: string,
   *   blocker_codes?: string[],
   *   replay_safe?: boolean,
   *   loggerHandled?: boolean,
   * }=} opts
   */
  constructor(message, opts = {}) {
    super(message || "Governance aguarda aprovação humana (governance-approval.json).", {
      code: GOVERNANCE_AWAITING_APPROVAL_CODE,
      exitCode: 1,
      loggerHandled: opts.loggerHandled !== false,
    });
    this.name = "GovernanceAwaitingApprovalError";
    this.approval_id = opts.approval_id != null ? String(opts.approval_id) : "";
    this.governance_phase = String(opts.governance_phase || "post_validation");
    this.blocker_codes = Array.isArray(opts.blocker_codes) ? opts.blocker_codes.map(String) : [];
    this.replay_safe = opts.replay_safe !== false;
  }

  toGovernanceContract() {
    return {
      code: this.code,
      approval_id: this.approval_id,
      governance_phase: this.governance_phase,
      blocker_codes: this.blocker_codes,
      replay_safe: this.replay_safe,
      message: this.message,
    };
  }
}

module.exports = {
  GovernanceAwaitingApprovalError,
};
