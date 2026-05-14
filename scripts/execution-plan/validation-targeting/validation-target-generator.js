/**
 * Gera validation-targets.json de forma determinística (Fase 4.1.2).
 */

const crypto = require("crypto");
const path = require("path");
const { normalizePath } = require("../normalization/operation-normalizer");
const { inferValidationScope } = require("./scope-inference");
const { inferValidators } = require("./validator-inference");
const { collectDependencyHints } = require("./dependency-hints");

const REASON_PRIORITY = [
  "reconciliation_unexpected",
  "reconciliation_unmatched",
  "executor_change",
  "operation_match",
];

function reasonRank(r) {
  const i = REASON_PRIORITY.indexOf(r);
  return i === -1 ? REASON_PRIORITY.length : i;
}

function stableTargetId(planId, runId, file, reason, sourceOpIds) {
  const payload = [
    String(planId || ""),
    String(runId || ""),
    String(file || ""),
    String(reason || ""),
    [...sourceOpIds].sort((x, y) => String(x).localeCompare(String(y))).join("|"),
  ].join("\u001f");
  const h = crypto.createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
  return `vt-${h}`;
}

function readExecutorChangesNormalized(raw) {
  const rows = Array.isArray(raw) ? raw : [];
  const paths = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const np = row && typeof row === "object" ? normalizePath(row.path) : null;
    if (np) paths.push(np);
  }
  return paths;
}

/**
 * Acumula candidatos por ficheiro.
 * @returns {Map<string, { reasons: Set<string>, operation_ids: Set<string> }>}
 */
function accumulateCandidates(plan, reconciliation, executorPaths) {
  /** @type {Map<string, { reasons: Set<string>, operation_ids: Set<string> }>} */
  const map = new Map();

  function touch(file, reason, opIds = []) {
    const f = normalizePath(file);
    if (!f) return;
    let slot = map.get(f);
    if (!slot) {
      slot = { reasons: new Set(), operation_ids: new Set() };
      map.set(f, slot);
    }
    slot.reasons.add(reason);
    for (const id of opIds) {
      if (id != null && String(id).trim() !== "") slot.operation_ids.add(String(id));
    }
  }

  const ops = plan && Array.isArray(plan.operations) ? plan.operations : [];
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    const fp = normalizePath(op.file);
    if (!fp) continue;
    const oid = op.operation_id != null ? String(op.operation_id) : null;
    touch(fp, "operation_match", oid ? [oid] : []);
  }

  for (const fp of executorPaths) {
    touch(fp, "executor_change");
  }

  if (reconciliation && typeof reconciliation === "object") {
    const unmatched = Array.isArray(reconciliation.unmatched_operations)
      ? reconciliation.unmatched_operations
      : [];
    for (const row of unmatched) {
      if (!row || typeof row !== "object") continue;
      const fp = normalizePath(row.path);
      const oid = row.operation_id != null ? String(row.operation_id) : null;
      touch(fp, "reconciliation_unmatched", oid ? [oid] : []);
    }
    const unexpected = Array.isArray(reconciliation.unexpected_changes)
      ? reconciliation.unexpected_changes
      : [];
    for (const row of unexpected) {
      if (!row || typeof row !== "object") continue;
      touch(normalizePath(row.path), "reconciliation_unexpected");
    }
  }

  return map;
}

function resolveAllowedSet(plan) {
  const raw = plan && Array.isArray(plan.allowed_files) ? plan.allowed_files : [];
  const s = new Set();
  for (const x of raw) {
    const n = normalizePath(x);
    if (n) s.add(n);
  }
  return s;
}

function riskHintsFor(file, primaryReason, allowedSet) {
  const hints = [];
  if (allowedSet.size > 0 && !allowedSet.has(file)) {
    hints.push("outside_architect_allowed_files");
  }
  if (primaryReason === "reconciliation_unexpected") {
    hints.push("executor_divergence_unexpected_path");
  }
  if (primaryReason === "reconciliation_unmatched") {
    hints.push("planned_scope_not_matched_by_executor");
  }
  return hints.sort((a, b) => a.localeCompare(b));
}

/**
 * @param {{
 *   plan: object,
 *   reconciliation: object|null,
 *   executorChanges: unknown[],
 *   projectRoot: string|null,
 *   runId: string,
 *   generatedAt?: string,
 * }} input
 */
function generateValidationTargets(input) {
  const plan = input.plan && typeof input.plan === "object" ? input.plan : {};
  const runId = String(input.runId || plan.run_id || "").trim();
  const planId = String(plan.plan_id || "").trim();
  const generatedAt = input.generatedAt || new Date().toISOString();

  const executorPaths = readExecutorChangesNormalized(input.executorChanges);
  const recon = input.reconciliation && typeof input.reconciliation === "object"
    ? input.reconciliation
    : null;

  const candidates = accumulateCandidates(plan, recon, executorPaths);
  const allowedSet = resolveAllowedSet(plan);
  const projectRoot = input.projectRoot != null ? String(input.projectRoot) : null;

  /** @type {object[]} */
  const targets = [];

  const sortedFiles = [...candidates.keys()].sort((a, b) => a.localeCompare(b));

  for (const file of sortedFiles) {
    const slot = candidates.get(file);
    const reasons = [...slot.reasons].sort((a, b) => reasonRank(a) - reasonRank(b));
    const primary = reasons[0] || "operation_match";

    const sourceOps = [...slot.operation_ids].sort((a, b) => a.localeCompare(b));
    const targetId = stableTargetId(planId, runId, file, primary, sourceOps);

    const validation_scope = inferValidationScope(file);
    const inferred_validators = inferValidators(file, { projectRoot });

    let abs = null;
    try {
      abs = projectRoot && file ? path.join(projectRoot, file) : null;
    } catch (_) {
      abs = null;
    }

    const dependency_hints = collectDependencyHints(abs, file);

    const target = {
      target_id: targetId,
      file,
      reason: primary,
      source_operation_ids: sourceOps,
      validation_scope,
      inferred_validators,
      dependency_hints,
      risk_hints: riskHintsFor(file, primary, allowedSet),
      metadata: {
        all_reasons: reasons,
      },
    };
    targets.push(target);
  }

  const validatorTypes = new Set();
  for (const t of targets) {
    for (const v of t.inferred_validators) validatorTypes.add(v);
  }

  const doc = {
    schema_version: 1,
    plan_id: planId,
    run_id: runId,
    generated_at: generatedAt,
    targets,
    summary: {
      total_targets: targets.length,
      unique_files: sortedFiles.length,
      validator_types: [...validatorTypes].sort((a, b) => a.localeCompare(b)),
    },
    extensions: {},
  };

  return doc;
}

module.exports = {
  generateValidationTargets,
  accumulateCandidates,
  stableTargetId,
  readExecutorChangesNormalized,
};
