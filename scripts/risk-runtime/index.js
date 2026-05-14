/**
 * Risk Runtime — API pública (Fase 4.3).
 */

const { isRiskEngineEnabled } = require("./feature-flags");
const { executeRiskPipeline } = require("./engine/risk-engine");

/**
 * @param {{ ctx: object|null, outputDir: string, runId: string }} args
 */
async function runRiskAnalysisAfterValidation(args) {
  if (!isRiskEngineEnabled()) {
    return { ok: true, skipped: true, reason: "risk_engine_off" };
  }

  try {
    const out = executeRiskPipeline({
      ctx: args && args.ctx,
      outputDir: args && args.outputDir,
      runId: args && args.runId,
    });
    return out;
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err,
      reason: "risk_engine_swallowed",
    };
  }
}

module.exports = {
  runRiskAnalysisAfterValidation,
  isRiskEngineEnabled,
};
