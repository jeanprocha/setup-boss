/**
 * Reconciliação best-effort: execution-plan.json vs executor-changes.json (Fase 4.1.1 shadow).
 * O executor permanece fonte de verdade operacional; isto mede aderência e divergência.
 */

const fs = require("fs");
const path = require("path");
const { normalizePath } = require("../normalization/operation-normalizer");
const { PLAN_OPERATION_TYPE } = require("../schema/constants");

const RECON_FILE = "execution-reconciliation.json";

/**
 * @param {unknown} row
 * @returns {{ path: string, search: string|null, replace: string|null, index: number }|null}
 */
function normalizeExecutorChange(row, index) {
  if (!row || typeof row !== "object") return null;
  const p = row.path != null ? normalizePath(row.path) : null;
  if (!p) return null;
  return {
    path: p,
    search: row.search != null ? String(row.search) : null,
    replace: row.replace != null ? String(row.replace) : null,
    index,
  };
}

/**
 * @param {object} plan
 * @returns {object[]} operações com ficheiro (âmbito / alvo)
 */
function planOperationsWithFile(plan) {
  if (!plan || !Array.isArray(plan.operations)) return [];
  return plan.operations.filter((op) => op && normalizePath(op.file));
}

/**
 * Heurística: FILE_SCOPE primeiro; depois qualquer operação com file.
 * @param {object} plan
 * @returns {Map<string, object>} path -> operação representativa (primeira)
 */
function buildPathToPlanOp(plan) {
  const map = new Map();
  const ops = planOperationsWithFile(plan);
  const preferred = ops.filter((o) => o.type === PLAN_OPERATION_TYPE.FILE_SCOPE);
  const ordered = preferred.length ? [...preferred, ...ops.filter((o) => o.type !== PLAN_OPERATION_TYPE.FILE_SCOPE)] : ops;
  for (const op of ordered) {
    const fp = normalizePath(op.file);
    if (!fp || map.has(fp)) continue;
    map.set(fp, op);
  }
  return map;
}

/**
 * @param {object} planOp
 * @param {{ path: string, search: string|null, replace: string|null }} ch
 * @returns {'path'|'path_search'}
 */
function matchKind(planOp, ch) {
  if (planOp.search != null && ch.search != null && String(planOp.search) === String(ch.search)) {
    if (planOp.replace == null || ch.replace == null) return "path_search";
    if (String(planOp.replace) === String(ch.replace)) return "path_search";
    return "path";
  }
  return "path";
}

/**
 * @param {object|null} plan
 * @param {unknown[]} executorChanges
 * @param {{ plan_id?: string, run_id?: string }} meta
 */
function reconcileExecutionPlan(plan, executorChanges, meta = {}) {
  const runId = meta.run_id != null ? String(meta.run_id) : plan && plan.run_id != null ? String(plan.run_id) : "";
  const planId = meta.plan_id != null ? String(meta.plan_id) : plan && plan.plan_id != null ? String(plan.plan_id) : "";

  const changesRaw = Array.isArray(executorChanges) ? executorChanges : [];
  const normalizedChanges = [];
  for (let i = 0; i < changesRaw.length; i += 1) {
    const n = normalizeExecutorChange(changesRaw[i], i);
    if (n) normalizedChanges.push(n);
  }

  const pathToPlan = plan ? buildPathToPlanOp(plan) : new Map();
  const plannedPaths = new Set(pathToPlan.keys());

  const matched_operations = [];
  const unmatched_operations = [];
  const unexpected_changes = [];

  const matchedPathHits = new Set();

  for (const ch of normalizedChanges) {
    const pop = pathToPlan.get(ch.path);
    if (!pop) {
      unexpected_changes.push({
        executor_index: ch.index,
        path: ch.path,
        reason: "no_plan_operation_for_path",
      });
      continue;
    }
    matchedPathHits.add(ch.path);
    matched_operations.push({
      operation_id: pop.operation_id != null ? String(pop.operation_id) : null,
      executor_index: ch.index,
      path: ch.path,
      match: matchKind(pop, ch),
    });
  }

  for (const p of plannedPaths) {
    if (!matchedPathHits.has(p)) {
      const op = pathToPlan.get(p);
      unmatched_operations.push({
        operation_id: op && op.operation_id != null ? String(op.operation_id) : null,
        path: p,
        reason: "planned_scope_no_executor_change",
      });
    }
  }

  const planned_operations = plannedPaths.size;
  const matched = matched_operations.length;
  const unmatched = unmatched_operations.length;
  const unexpected = unexpected_changes.length;

  let status = "full";
  if (unexpected > 0) {
    status = "divergent";
  } else if (unmatched > 0 || (planned_operations === 0 && matched > 0)) {
    status = "partial";
  } else if (planned_operations === 0 && matched === 0) {
    status = "full";
  }

  return {
    schema_version: 1,
    plan_id: planId,
    run_id: runId,
    matched_operations,
    unmatched_operations,
    unexpected_changes,
    coverage: {
      planned_operations,
      matched,
      unmatched,
      unexpected,
    },
    status,
    generated_at: new Date().toISOString(),
    extensions: {},
  };
}

/**
 * @param {string} outputDir
 * @param {object} doc
 */
function saveExecutionReconciliation(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, RECON_FILE), JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadExecutionReconciliation(outputDir) {
  const p = path.join(String(outputDir || ""), RECON_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

module.exports = {
  RECON_FILE,
  reconcileExecutionPlan,
  saveExecutionReconciliation,
  loadExecutionReconciliation,
  normalizeExecutorChange,
};
