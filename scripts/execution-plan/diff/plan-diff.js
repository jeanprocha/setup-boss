/**
 * Diff determinístico entre duas revisões de Execution Plan (serializável / replay-safe).
 */

const { stableStringify } = require("../fingerprint/plan-fingerprint");
const { normalizeOperations } = require("../normalization/operation-normalizer");

function sortedUniqueStrings(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => String(x)))].sort((a, b) => a.localeCompare(b));
}

function fingerprintSnapshot(plan) {
  if (!plan || !plan.fingerprints || typeof plan.fingerprints !== "object") return {};
  const fp = plan.fingerprints;
  return {
    plan_content_sha256: fp.plan_content_sha256 != null ? String(fp.plan_content_sha256) : null,
    structural_inputs_sha256:
      fp.structural_inputs_sha256 != null ? String(fp.structural_inputs_sha256) : null,
  };
}

function metadataSnapshot(plan) {
  if (!plan || !plan.metadata || typeof plan.metadata !== "object") return {};
  const keys = ["run_context_version", "shadow"];
  const o = {};
  for (const k of keys) {
    if (k in plan.metadata) o[k] = plan.metadata[k];
  }
  return o;
}

/**
 * @param {object|null|undefined} oldPlan
 * @param {object|null|undefined} newPlan
 */
function diffExecutionPlans(oldPlan, newPlan) {
  const older = oldPlan && typeof oldPlan === "object" ? oldPlan : {};
  const newer = newPlan && typeof newPlan === "object" ? newPlan : {};

  const oldOps = normalizeOperations(Array.isArray(older.operations) ? older.operations : []);
  const newOps = normalizeOperations(Array.isArray(newer.operations) ? newer.operations : []);
  const oldById = new Map(oldOps.map((o) => [String(o.operation_id), o]));
  const newById = new Map(newOps.map((o) => [String(o.operation_id), o]));

  const operations_added = [];
  const operations_removed = [];
  const operations_modified = [];

  for (const id of newById.keys()) {
    if (!oldById.has(id)) operations_added.push(id);
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) operations_removed.push(id);
  }
  for (const id of oldById.keys()) {
    if (!newById.has(id)) continue;
    const a = oldById.get(id);
    const b = newById.get(id);
    if (stableStringify(a) !== stableStringify(b)) {
      operations_modified.push(id);
    }
  }

  const lifecycle_changes =
    String(older.lifecycle_state || "") !== String(newer.lifecycle_state || "")
      ? { before: older.lifecycle_state || null, after: newer.lifecycle_state || null }
      : null;

  const oldDeps = {};
  for (const op of oldOps) {
    oldDeps[String(op.operation_id)] = op.dependencies || [];
  }
  const newDeps = {};
  for (const op of newOps) {
    newDeps[String(op.operation_id)] = op.dependencies || [];
  }
  const dependency_changes = {};
  const depIds = sortedUniqueStrings([...Object.keys(oldDeps), ...Object.keys(newDeps)]);
  for (const id of depIds) {
    const x = stableStringify(oldDeps[id] || []);
    const y = stableStringify(newDeps[id] || []);
    if (x !== y) dependency_changes[id] = { before: oldDeps[id] || [], after: newDeps[id] || [] };
  }

  const oldAf = sortedUniqueStrings(Array.isArray(older.allowed_files) ? older.allowed_files : []);
  const newAf = sortedUniqueStrings(Array.isArray(newer.allowed_files) ? newer.allowed_files : []);
  const allowed_files_changes =
    stableStringify(oldAf) !== stableStringify(newAf)
      ? { added: newAf.filter((f) => !oldAf.includes(f)), removed: oldAf.filter((f) => !newAf.includes(f)) }
      : null;

  const fpOld = fingerprintSnapshot(older);
  const fpNew = fingerprintSnapshot(newer);
  const fingerprint_changes =
    stableStringify(fpOld) !== stableStringify(fpNew) ? { before: fpOld, after: fpNew } : null;

  const mdOld = metadataSnapshot(older);
  const mdNew = metadataSnapshot(newer);
  const metadata_changes =
    stableStringify(mdOld) !== stableStringify(mdNew) ? { before: mdOld, after: mdNew } : null;

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    plan_ids: {
      before: older.plan_id != null ? String(older.plan_id) : null,
      after: newer.plan_id != null ? String(newer.plan_id) : null,
    },
    operations_added,
    operations_removed,
    operations_modified,
    lifecycle_changes,
    dependency_changes,
    allowed_files_changes,
    fingerprint_changes,
    metadata_changes,
    extensions: {},
  };
}

module.exports = {
  diffExecutionPlans,
};
