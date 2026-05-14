const { normalizePath } = require("../../execution-plan/normalization/operation-normalizer");
const { finding } = require("./invariant-types");

function planOperationPaths(plan) {
  if (!plan || !Array.isArray(plan.operations)) return new Set();
  const s = new Set();
  for (const op of plan.operations) {
    if (!op || typeof op !== "object") continue;
    if (op.file) {
      const p = normalizePath(op.file);
      if (p) s.add(p);
    }
  }
  return s;
}

function changePaths(changes) {
  const s = new Set();
  if (!Array.isArray(changes)) return s;
  for (const ch of changes) {
    if (!ch || typeof ch !== "object") continue;
    const p = normalizePath(ch.path);
    if (p) s.add(p);
  }
  return s;
}

function evaluateOperationInvariant(snapshot) {
  const out = [];
  const plan = snapshot.plan;
  const changes = snapshot.executor_changes;
  if (!plan || !Array.isArray(plan.operations)) return out;

  const planned = planOperationPaths(plan);
  const touched = changePaths(changes);

  for (const p of touched) {
    if (!planned.has(p) && planned.size > 0) {
      out.push(
        finding(
          "operation_invariant.orphan_change",
          "operation",
          "medium",
          "warn",
          { path: p },
          ["Adicionar FILE_SCOPE ao plano ou remover a alteração fora de escopo."],
        ),
      );
    }
  }

  const orphanOps = [];
  for (const p of planned) {
    if (!touched.has(p) && planned.size > 0 && touched.size > 0) {
      orphanOps.push(p);
    }
  }
  if (orphanOps.length > 5) {
    out.push(
      finding(
        "operation_invariant.many_planned_untouched",
        "operation",
        "low",
        "warn",
        { count: orphanOps.length, sample: orphanOps.slice(0, 5) },
        ["Confirmar se operações planeadas foram intentionally skipadas."],
      ),
    );
  }

  return out;
}

module.exports = { evaluateOperationInvariant };
