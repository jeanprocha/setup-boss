"use strict";

const { collectOrchestrationBootstrap, mapExecutionState } = require("./run-execute-api");
const { collectExecutionForRun } = require("./run-execution");
const { collectStrategyForRun } = require("./run-strategy");
const { collectClarificationForRun } = require("./run-clarification");

const ACTIVE_ORCH_STATES = new Set([
  "queued",
  "execution_starting",
  "execution_running",
  "execution_reviewing",
  "execution_correcting",
  "execution_recovering",
]);

const TERMINAL_ORCH_STATES = new Set([
  "execution_completed",
  "execution_failed",
  "completed",
  "failed",
]);

const TERMINAL_LIFECYCLE = new Set([
  "execution_completed",
  "execution_failed",
  "execution_blocked",
]);

/**
 * @param {string} severity
 * @param {string} code
 * @param {string} message
 */
function issue(severity, code, message) {
  return { severity, code, message };
}

/**
 * Valida coerência entre orchestration bootstrap, execution bundle e fases anteriores.
 * @param {{
 *   runId: string,
 *   outputDir?: string|null,
 *   jobs?: import("./queue-store").Job[],
 *   orchestrationBootstrap?: ReturnType<typeof collectOrchestrationBootstrap>|null,
 *   executionBundle?: object|null,
 *   strategyBundle?: object|null,
 *   clarificationBundle?: object|null,
 * }} input
 */
function validateRuntimeConsistency(input) {
  const issues = [];
  const runId = String(input.runId || "").trim();
  if (!runId) {
    return {
      ok: false,
      issues: [issue("error", "run_id_required", "runId é obrigatório.")],
    };
  }

  const boot =
    input.orchestrationBootstrap != null
      ? input.orchestrationBootstrap
      : input.outputDir
        ? collectOrchestrationBootstrap(runId, input.outputDir)
        : collectOrchestrationBootstrap(runId, null);

  const execCollected =
    input.executionBundle != null
      ? { ok: true, data: input.executionBundle }
      : collectExecutionForRun(runId, input.jobs || null);

  const stratCollected =
    input.strategyBundle != null
      ? { ok: true, data: input.strategyBundle }
      : collectStrategyForRun(runId, input.jobs || null);

  const clarCollected =
    input.clarificationBundle != null
      ? { ok: true, data: input.clarificationBundle }
      : collectClarificationForRun(runId, input.jobs || null);

  const orchState = String(boot.orchestrationState || "").toLowerCase();
  const execState = String(boot.executionState || "").toLowerCase();
  const recoveryStatus = boot.recoveryStatus != null ? String(boot.recoveryStatus) : null;

  if (ACTIVE_ORCH_STATES.has(orchState)) {
    const approved =
      clarCollected.ok && clarCollected.data?.approval?.status === "approved";
    if (!approved) {
      issues.push(
        issue(
          "error",
          "ORCH_ACTIVE_WITHOUT_APPROVAL",
          `Orchestration activa (${orchState}) sem clarificação aprovada.`,
        ),
      );
    }
    const stratReady =
      stratCollected.ok &&
      (stratCollected.data?.summary?.operationalReadiness === "ready" ||
        String(stratCollected.data?.summary?.phase3Status || "")
          .toLowerCase()
          .includes("strategy"));
    if (stratCollected.ok && !stratReady) {
      const rs = String(stratCollected.data?.summary?.operationalReadiness || "");
      if (rs && rs !== "ready") {
        issues.push(
          issue(
            "warn",
            "ORCH_ACTIVE_STRATEGY_NOT_READY",
            `Orchestration activa com strategy readiness=${rs}.`,
          ),
        );
      }
    }
  }

  if (execCollected.ok && execCollected.data?.summary) {
    const lifePhase = String(
      execCollected.data.summary.lifecycle?.phase || "",
    ).toLowerCase();
    const mapped = mapExecutionState(orchState, lifePhase);
    if (
      mapped &&
      execState &&
      mapped !== execState &&
      !(mapped === "execution_running" && execState === "execution_starting")
    ) {
      issues.push(
        issue(
          "warn",
          "ORCH_EXEC_STATE_DRIFT",
          `Bootstrap executionState=${execState} difere do mapeado=${mapped} (lifecycle=${lifePhase}).`,
        ),
      );
    }

    if (TERMINAL_ORCH_STATES.has(orchState) && !TERMINAL_LIFECYCLE.has(lifePhase)) {
      issues.push(
        issue(
          "warn",
          "TERMINAL_ORCH_NON_TERMINAL_LIFECYCLE",
          `Orchestration terminal (${orchState}) com lifecycle=${lifePhase}.`,
        ),
      );
    }

    if (ACTIVE_ORCH_STATES.has(orchState) && TERMINAL_LIFECYCLE.has(lifePhase)) {
      const severity =
        orchState === "execution_starting" || orchState === "queued"
          ? "warn"
          : "error";
      issues.push(
        issue(
          severity,
          "ACTIVE_ORCH_TERMINAL_LIFECYCLE",
          `Orchestration activa (${orchState}) com lifecycle terminal (${lifePhase}).`,
        ),
      );
    }
  } else if (ACTIVE_ORCH_STATES.has(orchState)) {
    issues.push(
      issue(
        "warn",
        "ORCH_ACTIVE_NO_EXECUTION_BUNDLE",
        `Orchestration activa sem execution read model disponível.`,
      ),
    );
  }

  if (recoveryStatus === "stale" || recoveryStatus === "orphaned") {
    if (ACTIVE_ORCH_STATES.has(orchState) && TERMINAL_LIFECYCLE.has(String(boot.lifecyclePhase || ""))) {
      issues.push(
        issue(
          "warn",
          "RECOVERY_MARKER_WITH_TERMINAL_LIFE",
          `recoveryStatus=${recoveryStatus} com lifecycle terminal — esperado orphan/stale legítimo.`,
        ),
      );
    }
  }

  const errors = issues.filter((x) => x.severity === "error");
  return { ok: errors.length === 0, issues, orchestrationState: orchState, recoveryStatus };
}

module.exports = {
  validateRuntimeConsistency,
  ACTIVE_ORCH_STATES,
  TERMINAL_ORCH_STATES,
};
