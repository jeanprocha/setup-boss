"use strict";

const fs = require("fs");
const path = require("path");

const { validateStrategyArtifacts } = require("./validate-strategy-artifacts");
const { SHARED_RUNTIME_CONTEXT_REL } = require("./build-shared-runtime-context");

const STRATEGY_READINESS_REL = "strategy/strategy-readiness.json";
const STRATEGY_READY_STATUS = "strategy_ready";

const MODE_SET = new Set(["basic", "standard", "expert"]);

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
 * @param {string} root
 * @param {Record<string, unknown>} complexityDoc
 * @param {Record<string, unknown>} aiDoc
 * @param {Record<string, unknown>} decompositionDoc
 * @param {Record<string, unknown>} executionOrderDoc
 * @param {string[]} subtaskRelPathsSorted
 */
function collectReadinessWarnings(
  root,
  complexityDoc,
  aiDoc,
  decompositionDoc,
  executionOrderDoc,
  subtaskRelPathsSorted,
) {
  /** @type {string[]} */
  const warnings = [];
  const strategyDir = path.join(root, "strategy");
  const subtasksDir = path.join(strategyDir, "subtasks");
  const recommended = String(aiDoc.recommended_mode || "");

  const idSet = new Set(subtaskRelPathsSorted.map((p) => path.basename(p, ".json")));

  const subs = decompositionDoc.subtasks;
  if (Array.isArray(subs)) {
    for (const row of subs) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const id = String(/** @type {Record<string, unknown>} */ (row).id || "");
      if (!/^\d{3}$/.test(id)) continue;
      if (!idSet.has(id)) {
        warnings.push(`readiness: decomposition referencia subtask ${id} sem ficheiro em strategy/subtasks/.`);
      }
    }
  }

  const ordered = Array.isArray(executionOrderDoc.ordered_subtasks) ? executionOrderDoc.ordered_subtasks : [];
  const orderedIds = new Set(
    ordered.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return "";
      return String(/** @type {Record<string, unknown>} */ (row).subtask_id || "");
    }).filter(Boolean),
  );
  for (const id of idSet) {
    if (!orderedIds.has(id)) {
      warnings.push(`readiness: execution-order não cobre subtask ${id} em ordered_subtasks.`);
    }
  }

  const decCount = Number(decompositionDoc.subtask_count);
  if (Number.isInteger(decCount) && decCount !== subtaskRelPathsSorted.length) {
    warnings.push(
      `readiness: decomposition.subtask_count (${decCount}) difere do número de ficheiros em subtasks (${subtaskRelPathsSorted.length}).`,
    );
  }

  if (recommended && MODE_SET.has(recommended)) {
    for (const rel of subtaskRelPathsSorted) {
      const fp = path.join(root, rel);
      const st = readJsonObject(fp);
      if (!st) continue;
      const am = String(/** @type {Record<string, unknown>} */ (st).ai_mode || "");
      if (MODE_SET.has(am) && am !== recommended) {
        warnings.push(
          `readiness: subtask ${path.basename(rel, ".json")} ai_mode=${am} difere de ai-strategy.recommended_mode=${recommended}.`,
        );
      }
    }
  }

  const depWarn = executionOrderDoc.dependency_warnings;
  if (Array.isArray(depWarn) && depWarn.length) {
    for (const w of depWarn) {
      if (typeof w === "string" && w.trim()) {
        warnings.push(`readiness: execution-order dependency_warnings: ${w.trim()}`);
      }
    }
  }

  const manifestPath = path.join(strategyDir, "strategy-manifest.json");
  const man = readJsonObject(manifestPath);
  const arts = man && Array.isArray(man.strategy_artifacts) ? /** @type {string[]} */ (man.strategy_artifacts) : [];
  const required = [
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    "strategy/execution-order.json",
    SHARED_RUNTIME_CONTEXT_REL,
  ];
  for (const req of required) {
    if (!arts.includes(req)) {
      warnings.push(`readiness: strategy-manifest.strategy_artifacts em falta: ${req}.`);
    }
  }
  for (const rp of subtaskRelPathsSorted) {
    if (!arts.includes(rp)) {
      warnings.push(`readiness: strategy-manifest.strategy_artifacts em falta: ${rp}.`);
    }
  }

  const execPath = path.join(strategyDir, "execution-strategy.json");
  const ex = readJsonObject(execPath);
  if (ex) {
    const e = /** @type {Record<string, unknown>} */ (ex);
    if (e.complexity_analysis_ready !== true) warnings.push("readiness: execution-strategy.complexity_analysis_ready deve ser true.");
    if (e.ai_strategy_ready !== true) warnings.push("readiness: execution-strategy.ai_strategy_ready deve ser true.");
    if (e.decomposition_ready !== true) warnings.push("readiness: execution-strategy.decomposition_ready deve ser true.");
    if (e.ordering_ready !== true) warnings.push("readiness: execution-strategy.ordering_ready deve ser true.");
    if (e.shared_context_ready !== true) warnings.push("readiness: execution-strategy.shared_context_ready deve ser true.");
  }

  const rcPath = path.join(root, "run-context.json");
  const rc = readJsonObject(rcPath);
  const p3 = rc && typeof rc === "object" ? /** @type {Record<string, unknown>} */ (rc).phase3 : null;
  if (p3 && typeof p3 === "object" && !Array.isArray(p3)) {
    const dx = /** @type {Record<string, unknown>} */ (p3).decomposition;
    if (dx && typeof dx === "object" && Number.isInteger(Number(dx.subtask_count))) {
      if (Number(dx.subtask_count) !== subtaskRelPathsSorted.length) {
        warnings.push("readiness: run-context.phase3.decomposition.subtask_count incoerente com ficheiros de subtasks.");
      }
    }
    const exo = /** @type {Record<string, unknown>} */ (p3).execution_order;
    if (exo && typeof exo === "object" && String(exo.ordering_mode || "") !== String(executionOrderDoc.ordering_mode || "")) {
      warnings.push("readiness: run-context.phase3.execution_order.ordering_mode difere de execution-order.json.");
    }
    const cx = /** @type {Record<string, unknown>} */ (p3).complexity;
    if (cx && typeof cx === "object" && String(cx.classification || "") !== String(complexityDoc.classification || "")) {
      warnings.push("readiness: run-context.phase3.complexity.classification difere de complexity-analysis.json.");
    }
    const ax = /** @type {Record<string, unknown>} */ (p3).ai_strategy;
    if (ax && typeof ax === "object" && String(ax.recommended_mode || "") !== String(aiDoc.recommended_mode || "")) {
      warnings.push("readiness: run-context.phase3.ai_strategy.recommended_mode difere de ai-strategy.json.");
    }
  }

  const sharedPath = path.join(strategyDir, "shared-runtime-context.json");
  const sh = readJsonObject(sharedPath);
  const cr = sh && typeof sh === "object" && !Array.isArray(sh) ? /** @type {Record<string, unknown>} */ (sh).context_refs : null;
  if (Array.isArray(cr)) {
    const refs = cr.filter((x) => typeof x === "string");
    for (const rel of subtaskRelPathsSorted) {
      if (!refs.includes(rel)) {
        warnings.push(`readiness: shared-runtime-context.context_refs não inclui ${rel}.`);
      }
    }
  }

  return warnings;
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
function buildStrategyReadiness(p) {
  const outputDirAbs = path.resolve(String(p.outputDirAbs || ""));
  const strategyDir = path.join(outputDirAbs, "strategy");
  const subtasksDir = path.join(strategyDir, "subtasks");

  const val = validateStrategyArtifacts(outputDirAbs, { phase37: false });
  const baseErrors = val.ok ? [] : val.errors.slice();

  const complexityDoc = readJsonObject(path.join(strategyDir, "complexity-analysis.json"));
  const aiDoc = readJsonObject(path.join(strategyDir, "ai-strategy.json"));
  const decompositionDoc = readJsonObject(path.join(strategyDir, "decomposition.json"));
  const executionOrderDoc = readJsonObject(path.join(strategyDir, "execution-order.json"));

  if (!complexityDoc || !aiDoc || !decompositionDoc || !executionOrderDoc) {
    return {
      ok: false,
      error: { code: "READINESS_LOAD", message: "Artefatos de estratégia em falta para readiness." },
    };
  }

  /** @type {string[]} */
  const subtaskRelPathsSorted = [];
  if (fs.existsSync(subtasksDir)) {
    const ents = fs.readdirSync(subtasksDir).filter((e) => /^\d{3}\.json$/i.test(e));
    ents.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    for (const e of ents) subtaskRelPathsSorted.push(`strategy/subtasks/${e}`);
  }

  const warnings = collectReadinessWarnings(
    outputDirAbs,
    /** @type {Record<string, unknown>} */ (complexityDoc),
    /** @type {Record<string, unknown>} */ (aiDoc),
    /** @type {Record<string, unknown>} */ (decompositionDoc),
    /** @type {Record<string, unknown>} */ (executionOrderDoc),
    subtaskRelPathsSorted,
  );

  const valid = baseErrors.length === 0;

  const classification = String(complexityDoc.classification || "");
  const aiMode = String(aiDoc.recommended_mode || "");
  const orderingMode = String(executionOrderDoc.ordering_mode || "linear");
  const subtaskCount = subtaskRelPathsSorted.length;

  const artifacts = [
    "strategy/execution-strategy.json",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    "strategy/execution-order.json",
    SHARED_RUNTIME_CONTEXT_REL,
    ...subtaskRelPathsSorted,
  ];

  const generatedAt = new Date().toISOString();
  const doc = {
    version: 1,
    phase: "3.7",
    status: STRATEGY_READY_STATUS,
    validation: {
      valid: valid,
      errors: baseErrors,
      warnings,
    },
    summary: {
      complexity: classification,
      ai_mode: aiMode,
      subtask_count: subtaskCount,
      ordering_mode: orderingMode,
    },
    artifacts,
    generated_at: generatedAt,
  };

  return { ok: true, doc };
}

module.exports = {
  buildStrategyReadiness,
  collectReadinessWarnings,
  STRATEGY_READINESS_REL,
  STRATEGY_READY_STATUS,
};
