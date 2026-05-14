/**
 * API de conveniência — retry / recovery do runtime (fase 2.6).
 */

module.exports = {
  runExecutorWithRecovery: require("./executor-recovery-loop").runExecutorWithRecovery,
  withOpenAIResponsesRetry: require("./provider-retry").withOpenAIResponsesRetry,
  classifyExecutorBlockedJson: require("./failure-classifier").classifyExecutorBlockedJson,
  classifyProviderError: require("./failure-classifier").classifyProviderError,
  Classification: require("./failure-classifier").Classification,
  createBudgetSession: require("./retry-budget").createBudgetSession,
};
