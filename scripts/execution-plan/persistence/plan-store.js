/**
 * Persistência do Execution Plan nos artefactos da run.
 */

const fs = require("fs");
const path = require("path");
const { applyTransition } = require("../lifecycle/lifecycle-engine");

const EXECUTION_PLAN_FILENAME = "execution-plan.json";

function planPathFor(outputDir) {
  return path.join(String(outputDir || ""), EXECUTION_PLAN_FILENAME);
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function loadPlan(outputDir) {
  const p = planPathFor(outputDir);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {object} plan
 */
function savePlan(outputDir, plan) {
  const dir = String(outputDir || "");
  if (!dir) throw new Error("outputDir obrigatório");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = planPathFor(dir);
  fs.writeFileSync(p, JSON.stringify(plan, null, 2), "utf-8");
}

/**
 * @param {object} plan
 * @param {string} to
 * @param {object} meta
 * @returns {{ ok: boolean, plan?: object, error?: object }}
 */
function updatePlanState(plan, to, meta) {
  return applyTransition(plan, to, meta);
}

/**
 * @param {object} plan
 * @param {string} to
 * @param {object} meta
 * @returns {object} novo plano (mutação controlada)
 */
function appendPlanTransition(plan, to, meta) {
  const r = applyTransition(plan, to, meta);
  if (!r.ok || !r.plan) {
    const msg = r.error && r.error.message ? r.error.message : "Transição inválida";
    throw new Error(msg);
  }
  return r.plan;
}

module.exports = {
  EXECUTION_PLAN_FILENAME,
  planPathFor,
  loadPlan,
  savePlan,
  updatePlanState,
  appendPlanTransition,
};
