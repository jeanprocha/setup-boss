"use strict";

const DEFAULT_ARTIFACTS = Object.freeze([
  "strategy/execution-strategy.json",
  "strategy/complexity-analysis.json",
  "strategy/ai-strategy.json",
  "strategy/decomposition.json",
  "strategy/execution-order.json",
  "strategy/shared-runtime-context.json",
  "strategy/strategy-readiness.json",
  "strategy/execution-ready-handoff.json",
]);

/**
 * @param {{
 *   runId: string,
 *   createdAt: string,
 *   phase?: string,
 *   status?: string,
 *   strategyArtifacts?: string[],
 * }} p
 * @returns {Record<string, unknown>}
 */
function buildStrategyManifest(p) {
  const runId = String(p.runId || "").trim();
  const createdAt = String(p.createdAt || "").trim();
  const arts =
    Array.isArray(p.strategyArtifacts) && p.strategyArtifacts.length > 0
      ? p.strategyArtifacts.map((x) => String(x))
      : [...DEFAULT_ARTIFACTS];
  return {
    version: 1,
    phase: String(p.phase || "3.8"),
    status: String(p.status || "execution_ready_handoff_completed"),
    created_at: createdAt,
    run_id: runId,
    strategy_artifacts: arts,
  };
}

module.exports = { buildStrategyManifest, DEFAULT_ARTIFACTS };
