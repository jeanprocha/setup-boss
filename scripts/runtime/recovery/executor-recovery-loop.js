/**
 * Loop supervisionado: micro-retries do executor + integração com artefactos/checkpoints.
 */

const fs = require("fs");
const path = require("path");
const { RUNTIME_LIFECYCLE } = require("../replay/lifecycle");
const { appendCheckpoint } = require("../replay/checkpoint-manager");
const { createBudgetSession } = require("./retry-budget");
const { classifyExecutorBlockedJson } = require("./failure-classifier");
const { resolveStrategy } = require("./recovery-strategies");
const { buildRecoveryDiagnosisText } = require("./diagnostics");
const {
  appendHistoryEntry,
  finalizeLogSession,
} = require("./recovery-artifacts");
const { buildHistoricalRecoveryHints } = require("./historical-recovery");

function readExecutorResult(outputDir, cache) {
  const resultPath = path.join(outputDir, "executor-result.json");
  const exists = cache
    ? cache.existsSync(resultPath)
    : fs.existsSync(resultPath);
  if (!exists) return null;
  try {
    return cache ? cache.readJsonSync(resultPath) : JSON.parse(fs.readFileSync(resultPath, "utf-8"));
  } catch (_) {
    return null;
  }
}

function writeDiagnosisFile(outputDir, text) {
  try {
    fs.writeFileSync(
      path.join(outputDir, "executor-recovery-diagnosis.txt"),
      text,
      "utf-8",
    );
  } catch (_) {
    /* best effort */
  }
}

/**
 * @param {object} opts
 * @param {object} opts.ctx
 * @param {string} opts.outputDir
 * @param {string} opts.runId
 * @param {function} opts.runExecutor
 * @param {boolean} [opts.dryRun]
 * @param {string|null} [opts.projectOutputsDir]
 * @param {function} [opts.onLifecyclePatch]
 */
async function runExecutorWithRecovery(opts) {
  const {
    ctx,
    outputDir,
    runId,
    runExecutor,
    projectOutputsDir = null,
    onLifecyclePatch = null,
  } = opts;

  const budget = createBudgetSession();
  const recoverySummary = {
    had_recovery: false,
    final_outcome: "NONE",
    micro_attempts: 0,
    context_expansions: 0,
    budgets: budget.snapshot(),
    last_classification: null,
  };

  ctx.state.recovery_summary = recoverySummary;
  ctx.state.executor_recovery_snippet_tuning = null;
  ctx.state.recovery_budgets = {
    provider_retry_max: budget.limits.provider_retry,
  };

  if (projectOutputsDir) {
    const hints = buildHistoricalRecoveryHints(projectOutputsDir, outputDir);
    ctx.state.historical_recovery_hints = hints;
    for (const w of hints.warnings) {
      console.log(`[recovery] ${w}`);
    }
  }

  const maxMicroPasses = budget.limits.executor_micro_retry + 1;
  let microPass = 0;
  let lastBlocked = null;

  while (microPass < maxMicroPasses) {
    microPass += 1;
    recoverySummary.micro_attempts = microPass;

    if (microPass > 1) {
      recoverySummary.had_recovery = true;
      if (typeof onLifecyclePatch === "function") {
        onLifecyclePatch({
          lifecycle_state: RUNTIME_LIFECYCLE.RECOVERING,
          recovery: { micro_attempt: microPass },
        });
      }
    }

    await runExecutor(ctx);

    const result = readExecutorResult(outputDir, ctx.cache);
    if (result && result.status === "success") {
      if (recoverySummary.had_recovery && typeof onLifecyclePatch === "function") {
        onLifecyclePatch({
          lifecycle_state: RUNTIME_LIFECYCLE.RECOVERED,
          recovery_outcome: "RECOVERED_SUCCESSFULLY",
        });
      }

      finalizeLogSession(outputDir, runId, {
        final_outcome: recoverySummary.had_recovery
          ? "RECOVERED_SUCCESSFULLY"
          : "NONE",
        micro_attempts: microPass,
        budget_snapshot: budget.snapshot(),
      });

      if (recoverySummary.had_recovery) {
        appendCheckpoint({
          outputDir,
          runId,
          phaseCompleted: "AFTER_EXECUTOR_RECOVERY",
          artifactNames: [
            "executor-result.json",
            "retry-history.json",
            "recovery-log.json",
            "executor-recovery-diagnosis.txt",
          ],
          replayability: { notes: "recovery_success" },
          extra: {
            micro_attempts: microPass,
            outcome: "RECOVERED_SUCCESSFULLY",
          },
        });
      }

      ctx.state.executor_recovery_snippet_tuning = null;
      return recoverySummary;
    }

    lastBlocked = result;
    const fc = classifyExecutorBlockedJson(result || { status: "blocked" });
    recoverySummary.last_classification = fc;

    const strat = resolveStrategy(fc);
    const diag = buildRecoveryDiagnosisText({
      failureLabel: fc.cause || fc.failure_type,
      classification: fc.classification,
      cause: fc.cause,
      strategyLabel: strat.label,
      outcome: "PENDING_RETRY",
      attempt: microPass,
      maxAttempts: maxMicroPasses,
    });
    writeDiagnosisFile(outputDir, diag);

    if (!fc.retryable_micro) {
      recoverySummary.final_outcome = "RECOVERY_FAILED";
      if (typeof onLifecyclePatch === "function") {
        onLifecyclePatch({
          lifecycle_state: RUNTIME_LIFECYCLE.RECOVERY_FAILED,
        });
      }
      finalizeLogSession(outputDir, runId, {
        final_outcome: "RECOVERY_FAILED",
        micro_attempts: microPass,
        budget_snapshot: budget.snapshot(),
        blocked_classification: fc,
      });
      ctx.state.executor_recovery_snippet_tuning = null;
      const err = new Error(
        `Executor não concluiu com sucesso após recovery (${fc.failure_type || fc.cause || "blocked"}).`,
      );
      err.recovery_meta = { classification: fc, strategy: strat };
      throw err;
    }

    if (!budget.consume("executor_micro_retry")) {
      recoverySummary.final_outcome = "RETRY_EXHAUSTED";
      if (typeof onLifecyclePatch === "function") {
        onLifecyclePatch({
          lifecycle_state: RUNTIME_LIFECYCLE.RETRY_EXHAUSTED,
          recovery_outcome: null,
        });
      }
      finalizeLogSession(outputDir, runId, {
        final_outcome: "RETRY_EXHAUSTED",
        micro_attempts: microPass,
        budget_snapshot: budget.snapshot(),
      });
      ctx.state.executor_recovery_snippet_tuning = null;
      const err = new Error(
        "Retry exaustado para micro-recovery do executor (SETUP_BOSS_EXECUTOR_MICRO_RETRY_MAX).",
      );
      err.recovery_meta = { classification: fc, strategy: strat };
      throw err;
    }

    recoverySummary.context_expansions += strat.snippetTuning ? 1 : 0;
    ctx.state.executor_recovery_snippet_tuning = strat.snippetTuning;

    appendHistoryEntry(outputDir, {
      kind: "executor_micro",
      micro_pass: microPass,
      classification: fc.classification,
      cause: fc.cause,
      strategy: strat.label,
      success: false,
      context_expansion: strat.snippetTuning,
    });

    console.log(
      `\n[recovery] Micro-retry executor (${microPass}/${maxMicroPasses}) — strategy=${strat.label} classification=${fc.classification}`,
    );
  }

  recoverySummary.final_outcome = "RETRY_EXHAUSTED";
  ctx.state.executor_recovery_snippet_tuning = null;
  const err = new Error("Retry exaustado (limite interno de micro-passes).");
  err.recovery_meta = { last_blocked: lastBlocked };
  throw err;
}

module.exports = {
  runExecutorWithRecovery,
  readExecutorResult,
};
