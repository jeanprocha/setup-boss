/**
 * Motor de validação estrutural do Execution Plan (Fase 4.1).
 */

const { EXECUTION_PLAN_SCHEMA_VERSION } = require("../schema/constants");
const { isValidLifecycleState } = require("../lifecycle/lifecycle-engine");

/** @typedef {{ code: string, message: string, path?: string|null }} PlanValidationIssue */

/**
 * @param {unknown} plan
 * @returns {PlanValidationIssue[]}
 */
function validateSchemaPresence(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") {
    issues.push({
      code: "PLAN_NOT_OBJECT",
      message: "Execution plan deve ser um objecto JSON.",
      path: "$",
    });
    return issues;
  }
  const req = [
    "schema_version",
    "plan_id",
    "run_id",
    "revision_id",
    "lineage_id",
    "generated_at",
    "generated_by",
    "lifecycle_state",
    "intent",
    "operations",
    "allowed_files",
    "metadata",
    "fingerprints",
    "telemetry",
    "execution_strategy",
    "validation",
    "risk_hints",
  ];
  for (const k of req) {
    if (!(k in plan)) {
      issues.push({
        code: "MISSING_FIELD",
        message: `Campo obrigatório ausente: ${k}`,
        path: `$.${k}`,
      });
    }
  }
  if (
    plan.schema_version != null &&
    Number(plan.schema_version) !== EXECUTION_PLAN_SCHEMA_VERSION
  ) {
    issues.push({
      code: "SCHEMA_VERSION_MISMATCH",
      message: `schema_version esperado ${EXECUTION_PLAN_SCHEMA_VERSION}, recebido ${plan.schema_version}`,
      path: "$.schema_version",
    });
  }
  return issues;
}

/**
 * @param {unknown} plan
 * @returns {PlanValidationIssue[]}
 */
function validateLifecycleKnown(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") return issues;
  const st = plan.lifecycle_state;
  if (!isValidLifecycleState(st)) {
    issues.push({
      code: "INVALID_LIFECYCLE_STATE",
      message: `lifecycle_state desconhecido: ${String(st)}`,
      path: "$.lifecycle_state",
    });
  }
  return issues;
}

/**
 * @param {unknown} plan
 * @returns {PlanValidationIssue[]}
 */
function validateOperationsIntegrity(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") return issues;
  if (!Array.isArray(plan.operations)) {
    issues.push({
      code: "OPERATIONS_NOT_ARRAY",
      message: "`operations` deve ser um array.",
      path: "$.operations",
    });
    return issues;
  }
  const seen = new Set();
  for (let i = 0; i < plan.operations.length; i += 1) {
    const op = plan.operations[i];
    const base = `$.operations[${i}]`;
    if (!op || typeof op !== "object") {
      issues.push({
        code: "OPERATION_NOT_OBJECT",
        message: "Operação inválida (não é objecto).",
        path: base,
      });
      continue;
    }
    const oid = op.operation_id;
    if (oid == null || String(oid).trim() === "") {
      issues.push({
        code: "OPERATION_ID_MISSING",
        message: "operation_id obrigatório.",
        path: `${base}.operation_id`,
      });
    } else if (seen.has(String(oid))) {
      issues.push({
        code: "DUPLICATE_OPERATION_ID",
        message: `operation_id duplicado: ${String(oid)}`,
        path: `${base}.operation_id`,
      });
    } else {
      seen.add(String(oid));
    }
    if (op.type == null || String(op.type).trim() === "") {
      issues.push({
        code: "OPERATION_TYPE_MISSING",
        message: "type obrigatório.",
        path: `${base}.type`,
      });
    }
    if (op.mode == null || String(op.mode).trim() === "") {
      issues.push({
        code: "OPERATION_MODE_MISSING",
        message: "mode obrigatório.",
        path: `${base}.mode`,
      });
    }
    if (op.dependencies != null && !Array.isArray(op.dependencies)) {
      issues.push({
        code: "OPERATION_DEPENDENCIES_BAD_TYPE",
        message: "dependencies deve ser array de operation_id.",
        path: `${base}.dependencies`,
      });
    }
  }

  const depIssues = detectDependencyProblems(plan.operations);
  issues.push(...depIssues);

  return issues;
}

/**
 * @param {unknown[]} operations
 * @returns {PlanValidationIssue[]}
 */
function detectDependencyProblems(operations) {
  const issues = [];
  if (!Array.isArray(operations)) return issues;

  const idSet = new Set();
  for (const op of operations) {
    if (op && typeof op === "object" && op.operation_id != null) {
      idSet.add(String(op.operation_id));
    }
  }

  const adj = new Map();
  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    if (!op || typeof op !== "object") continue;
    const oid = String(op.operation_id || "");
    const deps = Array.isArray(op.dependencies) ? op.dependencies.map(String) : [];
    for (const d of deps) {
      if (!idSet.has(d)) {
        issues.push({
          code: "DEPENDENCY_UNKNOWN_ID",
          message: `Dependência desconhecida "${d}" em ${oid || `#${i}`}`,
          path: `$.operations[${i}].dependencies`,
        });
      }
    }
    adj.set(oid, deps);
  }

  function hasCycleFrom(startId) {
    const visited = new Set();
    const stack = new Set();
    function dfs(node) {
      if (!node) return false;
      if (stack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      stack.add(node);
      const deps = adj.get(node) || [];
      for (const d of deps) {
        if (dfs(d)) return true;
      }
      stack.delete(node);
      return false;
    }
    return dfs(startId);
  }

  for (const id of idSet) {
    if (hasCycleFrom(id)) {
      issues.push({
        code: "DEPENDENCY_CYCLE",
        message: "Ciclo detectado em dependencies das operações.",
        path: "$.operations",
      });
      break;
    }
  }

  return issues;
}

/**
 * @param {unknown} plan
 * @returns {PlanValidationIssue[]}
 */
function validateAllowedFilesConsistency(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") return issues;
  if (!Array.isArray(plan.allowed_files)) {
    issues.push({
      code: "ALLOWED_FILES_NOT_ARRAY",
      message: "`allowed_files` deve ser um array de strings.",
      path: "$.allowed_files",
    });
    return issues;
  }
  const af = new Set(plan.allowed_files.map((x) => String(x).replace(/\\/g, "/")));
  if (!Array.isArray(plan.operations)) return issues;
  for (let i = 0; i < plan.operations.length; i += 1) {
    const op = plan.operations[i];
    if (!op || typeof op !== "object") continue;
    if (op.file == null || String(op.file).trim() === "") continue;
    const posix = String(op.file).replace(/\\/g, "/");
    if (af.size > 0 && !af.has(posix)) {
      issues.push({
        code: "OPERATION_FILE_NOT_ALLOWED",
        message: `Ficheiro da operação não está em allowed_files: ${posix}`,
        path: `$.operations[${i}].file`,
      });
    }
  }
  return issues;
}

/**
 * @param {unknown} plan
 * @returns {PlanValidationIssue[]}
 */
function validateForwardCompatUnknown(plan) {
  const issues = [];
  if (!plan || typeof plan !== "object") return issues;
  const allowedRoots = new Set([
    "schema_version",
    "plan_id",
    "run_id",
    "revision_id",
    "parent_revision_id",
    "lineage_id",
    "generated_at",
    "generated_by",
    "lifecycle_state",
    "lifecycle_transitions",
    "lifecycle_updated_at",
    "intent",
    "operations",
    "allowed_files",
    "metadata",
    "fingerprints",
    "telemetry",
    "execution_strategy",
    "validation",
    "risk_hints",
    "extensions",
    "revision_lineage",
    "revisions",
  ]);
  const unknown = Object.keys(plan).filter((k) => !allowedRoots.has(k));
  if (unknown.length > 0) {
    issues.push({
      code: "UNKNOWN_ROOT_FIELDS",
      message: `Campos extra no root (compatibilidade): ${unknown.join(", ")}`,
      path: "$",
    });
  }
  return issues;
}

/**
 * @param {object} plan
 * @returns {{ ok: boolean, errors: PlanValidationIssue[], warnings: PlanValidationIssue[], validated_at: string }}
 */
function validateExecutionPlanStructural(plan) {
  const validatedAt = new Date().toISOString();
  const errors = [];
  const warnings = [];

  errors.push(...validateSchemaPresence(plan));
  if (errors.some((e) => e.code === "PLAN_NOT_OBJECT")) {
    return { ok: false, errors, warnings, validated_at: validatedAt };
  }

  errors.push(...validateLifecycleKnown(plan));
  errors.push(...validateOperationsIntegrity(plan));
  errors.push(...validateAllowedFilesConsistency(plan));

  const fc = validateForwardCompatUnknown(plan);
  for (const w of fc) warnings.push(w);

  const ok = errors.length === 0;
  return { ok, errors, warnings, validated_at: validatedAt };
}

module.exports = {
  validateExecutionPlanStructural,
  validateSchemaPresence,
  validateLifecycleKnown,
  validateOperationsIntegrity,
  validateAllowedFilesConsistency,
};
