/**
 * Mapeia classificação → ações de recovery supervisionadas (sem alterar contratos de agentes).
 */

const StrategyId = {
  RETRY_PROVIDER_BACKOFF: "RETRY_PROVIDER_BACKOFF",
  EXECUTOR_RERUN_EXPAND_SNIPPETS: "EXECUTOR_RERUN_EXPAND_SNIPPETS",
  EXECUTOR_RERUN_TIGHTEN_WINDOW: "EXECUTOR_RERUN_TIGHTEN_WINDOW",
  EXECUTOR_RERUN_SAME_CONTEXT: "EXECUTOR_RERUN_SAME_CONTEXT",
  ABORT_SAFE: "ABORT_SAFE",
};

function resolveStrategy(classifierResult) {
  if (!classifierResult || typeof classifierResult !== "object") {
    return {
      strategy: StrategyId.ABORT_SAFE,
      label: "abort_safe",
      snippetTuning: null,
    };
  }

  const cause = classifierResult.cause || classifierResult.failure_type || "";

  if (classifierResult.classification === "PROVIDER_FAILURE") {
    return {
      strategy: StrategyId.RETRY_PROVIDER_BACKOFF,
      label: "provider_backoff",
      snippetTuning: null,
    };
  }

  if (
    cause === "search_not_found" ||
    cause === "context_insufficient"
  ) {
    return {
      strategy: StrategyId.EXECUTOR_RERUN_EXPAND_SNIPPETS,
      label: "expand_targeted_context",
      snippetTuning: {
        windowMultiplier: 1.35,
        snippetMultiplier: 1.12,
        targetedExtra: 1,
        tightenWindowFactor: 1,
      },
    };
  }

  if (cause === "search_not_unique") {
    return {
      strategy: StrategyId.EXECUTOR_RERUN_TIGHTEN_WINDOW,
      label: "tighten_search_context",
      snippetTuning: {
        windowMultiplier: 0.92,
        snippetMultiplier: 1,
        targetedExtra: 1,
        tightenWindowFactor: 0.82,
      },
    };
  }

  if (
    cause === "json_parse_failed" ||
    classifierResult.failure_type === "executor_json_parse_failed"
  ) {
    return {
      strategy: StrategyId.EXECUTOR_RERUN_SAME_CONTEXT,
      label: "rerun_executor_llm",
      snippetTuning: {
        windowMultiplier: 1.05,
        snippetMultiplier: 1,
        targetedExtra: 0,
        tightenWindowFactor: 1,
      },
    };
  }

  return {
    strategy: StrategyId.ABORT_SAFE,
    label: "abort_or_correction",
    snippetTuning: null,
  };
}

module.exports = {
  StrategyId,
  resolveStrategy,
};
