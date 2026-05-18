"use strict";

const fs = require("fs");
const path = require("path");

const SHARED_RUNTIME_CONTEXT_REL = "strategy/shared-runtime-context.json";

/** @type {readonly string[]} */
const DEFAULT_CONSTRAINTS = Object.freeze([
  "preparation_only",
  "no_code_execution",
  "no_dag",
  "linear_ordering",
]);

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
 * @param {string} title
 */
function normalizeSectionTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * @param {string} md
 * @returns {{ title: string, body: string }[]}
 */
function parseMarkdownSections(md) {
  const lines = String(md || "").split(/\r?\n/);
  /** @type {{ title: string, body: string[] }[]} */
  const chunks = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) chunks.push({ title: cur.title, body: cur.body.join("\n").trim() });
  return chunks.map((c) => ({ title: c.title, body: c.body }));
}

/**
 * @param {string} planPath
 */
function extractGlobalObjectiveFromPlan(planPath) {
  if (!fs.existsSync(planPath)) return "";
  const md = fs.readFileSync(planPath, "utf-8");
  for (const { title, body } of parseMarkdownSections(md)) {
    if (normalizeSectionTitle(title) === "objetivo") {
      const t = String(body || "").trim().replace(/\s+/g, " ");
      return t.length > 4000 ? t.slice(0, 4000) : t;
    }
  }
  return "";
}

/**
 * @param {Record<string, unknown>} rc
 */
function extractObjectiveFromRunContext(rc) {
  const task = rc.task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return "";
  const pv = /** @type {Record<string, unknown>} */ (task).preview;
  if (typeof pv !== "string") return "";
  const t = pv.trim().replace(/\s+/g, " ");
  return t.length > 4000 ? t.slice(0, 4000) : t;
}

/**
 * @param {Record<string, unknown>} complexityDoc
 * @param {Record<string, unknown>} aiDoc
 * @param {Record<string, unknown>} decompositionDoc
 * @param {Record<string, unknown>} executionOrderDoc
 */
function buildStrategySummary(complexityDoc, aiDoc, decompositionDoc, executionOrderDoc) {
  const scores =
    complexityDoc.scores && typeof complexityDoc.scores === "object" && !Array.isArray(complexityDoc.scores)
      ? /** @type {Record<string, unknown>} */ (complexityDoc.scores)
      : {};
  const ordered = Array.isArray(executionOrderDoc.ordered_subtasks) ? executionOrderDoc.ordered_subtasks : [];
  /** @type {string[]} */
  const orderedIds = [];
  for (const row of ordered) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const sid = String(/** @type {Record<string, unknown>} */ (row).subtask_id || "");
    if (sid) orderedIds.push(sid);
  }
  return {
    complexity: {
      classification: String(complexityDoc.classification || ""),
      overall: Number(scores.overall),
    },
    ai_strategy: {
      recommended_mode: String(aiDoc.recommended_mode || ""),
      cost_profile: String(aiDoc.cost_profile || ""),
      quality_profile: String(aiDoc.quality_profile || ""),
    },
    decomposition: {
      strategy: String(decompositionDoc.strategy || ""),
      subtask_count: Number(decompositionDoc.subtask_count),
    },
    execution_order: {
      ordering_mode: String(executionOrderDoc.ordering_mode || ""),
      ordered_subtask_ids: orderedIds,
    },
  };
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
function buildSharedRuntimeContext(p) {
  const outputDirAbs = path.resolve(String(p.outputDirAbs || ""));
  const rcPath = path.join(outputDirAbs, "run-context.json");
  const planPath = path.join(outputDirAbs, "task-plan-refined.md");
  const strategyDir = path.join(outputDirAbs, "strategy");

  const runContext = readJsonObject(rcPath);
  if (!runContext) {
    return {
      ok: false,
      error: { code: "SHARED_CONTEXT_RUN_CONTEXT", message: "run-context.json em falta ou inválido." },
    };
  }

  const complexityDoc = readJsonObject(path.join(strategyDir, "complexity-analysis.json"));
  const aiDoc = readJsonObject(path.join(strategyDir, "ai-strategy.json"));
  const decompositionDoc = readJsonObject(path.join(strategyDir, "decomposition.json"));
  const executionOrderDoc = readJsonObject(path.join(strategyDir, "execution-order.json"));
  if (!complexityDoc || !aiDoc || !decompositionDoc || !executionOrderDoc) {
    return {
      ok: false,
      error: {
        code: "SHARED_CONTEXT_STRATEGY_ARTIFACTS",
        message: "Artefatos de estratégia necessários em falta para shared runtime context.",
      },
    };
  }

  let global_objective = extractGlobalObjectiveFromPlan(planPath);
  if (!global_objective) global_objective = extractObjectiveFromRunContext(runContext);

  const source_artifacts = [
    "run-context.json",
    "task-plan-refined.md",
    "strategy/complexity-analysis.json",
    "strategy/ai-strategy.json",
    "strategy/decomposition.json",
    "strategy/execution-order.json",
  ];

  const subtasksDir = path.join(strategyDir, "subtasks");
  /** @type {string[]} */
  const subtaskRefs = [];
  if (fs.existsSync(subtasksDir) && fs.statSync(subtasksDir).isDirectory()) {
    for (const ent of fs.readdirSync(subtasksDir)) {
      if (/^\d{3}\.json$/i.test(ent)) subtaskRefs.push(`strategy/subtasks/${ent}`);
    }
    subtaskRefs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  const context_refs = [...source_artifacts, SHARED_RUNTIME_CONTEXT_REL, ...subtaskRefs];

  const doc = {
    version: 1,
    phase: "3.6",
    status: "shared_runtime_context_completed",
    global_objective: global_objective || "",
    constraints: [...DEFAULT_CONSTRAINTS],
    source_artifacts,
    strategy_summary: buildStrategySummary(
      /** @type {Record<string, unknown>} */ (complexityDoc),
      /** @type {Record<string, unknown>} */ (aiDoc),
      /** @type {Record<string, unknown>} */ (decompositionDoc),
      /** @type {Record<string, unknown>} */ (executionOrderDoc),
    ),
    context_refs,
  };

  return { ok: true, doc };
}

/**
 * @param {{ strategyDir: string, relArtifactPath?: string }} p
 * @returns {{ ok: true } | { ok: false, error: { code: string, message: string } }}
 */
function applySharedContextRefsToSubtasks(p) {
  const strategyDir = path.resolve(String(p.strategyDir || ""));
  const rel = String(p.relArtifactPath || "").trim() || SHARED_RUNTIME_CONTEXT_REL;
  const subtasksDir = path.join(strategyDir, "subtasks");
  if (!fs.existsSync(subtasksDir) || !fs.statSync(subtasksDir).isDirectory()) {
    return { ok: false, error: { code: "SUBTASKS_DIR", message: "strategy/subtasks em falta." } };
  }
  const expected = [rel];
  for (const ent of fs.readdirSync(subtasksDir)) {
    if (!/^\d{3}\.json$/i.test(ent)) continue;
    const fp = path.join(subtasksDir, ent);
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    } catch {
      return { ok: false, error: { code: "SUBTASK_PARSE", message: `Falha ao ler ${ent}.` } };
    }
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      return { ok: false, error: { code: "SUBTASK_SHAPE", message: `Subtask inválida: ${ent}.` } };
    }
    const next = { ...doc, shared_context_refs: expected };
    fs.writeFileSync(fp, JSON.stringify(next, null, 2), "utf-8");
  }
  return { ok: true };
}

module.exports = {
  buildSharedRuntimeContext,
  applySharedContextRefsToSubtasks,
  SHARED_RUNTIME_CONTEXT_REL,
  DEFAULT_CONSTRAINTS,
};
