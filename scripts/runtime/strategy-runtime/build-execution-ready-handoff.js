"use strict";

const fs = require("fs");
const path = require("path");

const { SHARED_RUNTIME_CONTEXT_REL } = require("./build-shared-runtime-context");

const STRATEGY_READINESS_REL = "strategy/strategy-readiness.json";
const EXECUTION_READY_HANDOFF_REL = "strategy/execution-ready-handoff.json";
const HANDOFF_STATUS = "execution_ready_handoff_completed";
const HANDOFF_PHASE = "3.8";

/**
 * @param {string} fp
 * @returns {object|null}
 */
function readJsonObject(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const j = JSON.parse(raw);
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ outputDirAbs: string }} p
 * @returns {{
 *   ok: true,
 *   doc: Record<string, unknown>,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
function buildExecutionReadyHandoff(p) {
  const root = path.resolve(String(p.outputDirAbs || ""));
  const strategyDir = path.join(root, "strategy");
  const subtasksDir = path.join(strategyDir, "subtasks");

  const complexity = readJsonObject(path.join(strategyDir, "complexity-analysis.json"));
  const ai = readJsonObject(path.join(strategyDir, "ai-strategy.json"));
  const decomposition = readJsonObject(path.join(strategyDir, "decomposition.json"));
  const executionOrder = readJsonObject(path.join(strategyDir, "execution-order.json"));
  const sharedRuntime = readJsonObject(path.join(root, SHARED_RUNTIME_CONTEXT_REL));
  const readiness = readJsonObject(path.join(strategyDir, "strategy-readiness.json"));
  const manifest = readJsonObject(path.join(strategyDir, "strategy-manifest.json"));

  if (!complexity || !ai || !decomposition || !executionOrder || !sharedRuntime || !readiness || !manifest) {
    return {
      ok: false,
      error: {
        code: "HANDOFF_PREREQ_MISSING",
        message:
          "Ficheiros strategy necessários em falta para execution-ready-handoff (complexity, ai, decomposition, execution-order, shared-runtime-context, strategy-readiness, strategy-manifest).",
      },
    };
  }

  if (!fs.existsSync(subtasksDir) || !fs.statSync(subtasksDir).isDirectory()) {
    return {
      ok: false,
      error: { code: "HANDOFF_SUBTASKS_DIR", message: "strategy/subtasks/ em falta." },
    };
  }

  /** @type {string[]} */
  const subtaskRelPaths = [];
  try {
    for (const ent of fs.readdirSync(subtasksDir)) {
      if (/^\d{3}\.json$/i.test(ent)) {
        subtaskRelPaths.push(`strategy/subtasks/${ent}`);
      }
    }
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return {
      ok: false,
      error: { code: "HANDOFF_SUBTASKS_READ", message: `strategy/subtasks: ${msg}` },
    };
  }
  subtaskRelPaths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const rSum = readiness.summary;
  const sumObj =
    rSum && typeof rSum === "object" && !Array.isArray(rSum)
      ? /** @type {Record<string, unknown>} */ (rSum)
      : null;
  const classification = String(
    (sumObj && sumObj.complexity) || /** @type {Record<string, unknown>} */ (complexity).classification || "",
  );
  const aiMode = String(
    (sumObj && sumObj.ai_mode) || /** @type {Record<string, unknown>} */ (ai).recommended_mode || "",
  );
  const orderingMode = String(
    (sumObj && sumObj.ordering_mode) ||
      /** @type {Record<string, unknown>} */ (executionOrder).ordering_mode ||
      "linear",
  );
  const subtaskCount =
    sumObj && typeof sumObj.subtask_count === "number" && Number.isInteger(sumObj.subtask_count)
      ? /** @type {number} */ (sumObj.subtask_count)
      : subtaskRelPaths.length;

  const generatedAt = new Date().toISOString();

  const doc = {
    version: 1,
    phase: HANDOFF_PHASE,
    status: HANDOFF_STATUS,
    execution_mode: "strategy_only",
    summary: {
      complexity: classification,
      ai_mode: aiMode,
      subtask_count: subtaskCount,
      ordering_mode: orderingMode,
    },
    artifacts: {
      strategy_manifest: "strategy/strategy-manifest.json",
      execution_strategy: "strategy/execution-strategy.json",
      complexity_analysis: "strategy/complexity-analysis.json",
      ai_strategy: "strategy/ai-strategy.json",
      decomposition: "strategy/decomposition.json",
      execution_order: "strategy/execution-order.json",
      shared_runtime_context: SHARED_RUNTIME_CONTEXT_REL,
      strategy_readiness: STRATEGY_READINESS_REL,
    },
    subtasks: subtaskRelPaths,
    shared_context_ref: SHARED_RUNTIME_CONTEXT_REL,
    next_phase: "phase4_execution_runtime",
    generated_at: generatedAt,
  };

  return { ok: true, doc };
}

module.exports = {
  buildExecutionReadyHandoff,
  EXECUTION_READY_HANDOFF_REL,
  HANDOFF_STATUS,
  HANDOFF_PHASE,
};
