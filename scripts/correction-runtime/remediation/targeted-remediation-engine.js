/**
 * Produz targets dirigidos por prioridades (determinísticas).
 */

const VALIDATION_TARGETS = "validation-targets.json";
const { getCorrectionPolicies } = require("../policies/correction-policies");

function readJson(fs, pathMod, dir, filename) {
  try {
    const p = pathMod.join(dir, filename);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function buildValidationGraphBrief(fs, pathMod, outputDir, snapshot) {
  let vt =
    snapshot.plan && snapshot.plan.validation && snapshot.plan.validation.graph
      ? snapshot.plan.validation.graph
      : null;
  if (!vt && outputDir) {
    vt = readJson(fs, pathMod, outputDir, VALIDATION_TARGETS);
  }
  if (!vt || typeof vt !== "object") return [];
  const nodes = Array.isArray(vt.nodes) ? vt.nodes : [];
  return nodes.slice(0, 40).map((n) =>
    typeof n.id === "string"
      ? n.id
      : n.validator_id != null
        ? String(n.validator_id)
        : "",
  ).filter(Boolean);
}

function prioritizedRemediationTargets({ failures, correctionHints, snapshot, outputDir }) {
  const fsLocal = require("fs");
  const pathMod = require("path");

  /** @type {Array<{priority:number,target_id:string,target_kind:string,hint:string,data?:object}>} */
  const targets = [];

  const pushTarget = (t) => targets.push({ ...t, priority: Number(t.priority) || 500 });

  for (const bucket of failures || []) {
    const cls = bucket.classification || "";
    for (const item of bucket.items || []) {
      let pri = 500;
      if (cls === "reconciliation_failure") pri = 20;
      if (cls === "structural_failure") pri += item.subtype === "replay mismatch" ? 10 : 30;
      if (cls === "validation_failure") pri = 55;
      if (cls === "executor_failure") pri = 42;
      if (cls === "semantic_failure") pri = 72;
      if (cls === "runtime_failure") pri = 62;

      pushTarget({
        priority: pri + (typeof item.confidence === "number" ? (1 - item.confidence) * 10 : 0),
        target_id: `${cls}::${item.id}`,
        target_kind: cls,
        hint:
          Array.isArray(item.remediation_hints) && item.remediation_hints[0]
            ? item.remediation_hints[0]
            : `Corrige causa em ${cls} (${item.subtype || "subtype"})`,
        data: { subtype: item.subtype, evidence_trim: JSON.stringify(item.evidence || []).slice(0, 400) },
      });
    }
  }

  const graphIds = buildValidationGraphBrief(fsLocal, pathMod, outputDir, snapshot);
  if (snapshot.validation_results && correctionHints && correctionHints.validation_fix_required) {
    const detailRows =
      snapshot.validation_results.summary &&
      Array.isArray(snapshot.validation_results.summary.failures_detail)
        ? snapshot.validation_results.summary.failures_detail
        : [];
    for (const row of detailRows.slice(0, 25)) {
      if (!row || row.status === "passed") continue;
      pushTarget({
        priority: 50,
        target_id: `validation::node::${String(row.validator_id || row.validator_type || "").slice(0, 240)}`,
        target_kind: "validation_failure",
        hint: row.message ? String(row.message).slice(0, 520) : "Reexecutar validator falhado",
        data: { validator_type: row.validator_type, validator_id: row.validator_id },
      });
    }

    if (!detailRows.length && graphIds.length) {
      for (const gid of graphIds.slice(0, 8)) {
        pushTarget({
          priority: 60,
          target_id: `validation::graph_hint::${gid}`,
          target_kind: "validation_failure",
          hint: `Validator relacionado segundo validation graph (${gid})`,
          data: { graph_id: gid },
        });
      }
    }
  }

  const opTargets = Array.isArray(snapshot.executor_changes)
    ? snapshot.executor_changes.filter(
        (op) =>
          op &&
          (op.failed === true ||
            (Array.isArray(op.results) && op.results.some((r) => r && r.failed))),
      )
    : [];
  for (const op of opTargets.slice(0, 30)) {
    const oid =
      op.operation_id != null
        ? String(op.operation_id)
        : op.id != null
          ? String(op.id)
          : "unknown_operation";
    pushTarget({
      priority: 40,
      target_id: `executor::operation::${oid}`,
      target_kind: "executor_failure",
      hint: "Reintentar PATCH apenas para esta operation_id usando snippet alinhado",
      data: { operation_id: oid, path_hint: op.path || op.relative_path || null },
    });
  }

  if (snapshot.reconciliation && snapshot.reconciliation.unexpected_changes > 0) {
    pushTarget({
      priority: 15,
      target_id: "reconciliation::unexpected_changes_review",
      target_kind: "reconciliation_failure",
      hint:
        `Reconcile ${snapshot.reconciliation.unexpected_changes} alterações não planeadas segundo reconciliation.json`,
      data: snapshot.reconciliation,
    });
  }

  targets.sort((a, b) => a.priority - b.priority || a.target_id.localeCompare(b.target_id));

  const pol = getCorrectionPolicies();
  const envCap = Number(process.env.SETUP_BOSS_CORRECTION_PRIMING_TARGETS_CAP);
  const cap = Number.isFinite(envCap)
    ? Math.max(1, Math.floor(envCap))
    : Math.max(1, Math.floor(Number(pol.progressive_remediation_max_targets_prime || 20)));
  return targets.slice(0, cap);
}

function describeRetryScope(targetsPrime) {
  const kinds = [...new Set((targetsPrime || []).map((t) => t.target_kind).filter(Boolean))];
  const opIds =
    targetsPrime &&
    targetsPrime
      .filter((t) => t.target_kind === "executor_failure" && t.data && t.data.operation_id)
      .map((t) => t.data.operation_id)
      .slice(0, 25);
  return {
    constrained_to_kinds_sorted: kinds.sort(),
    operation_ids_prioritized_slice: [...new Set(opIds)],
    guidance:
      kinds.length &&
      kinds.every((k) => k === "validation_failure") &&
      !(opIds || []).length
        ? "retry_local_validation_only_likely"
        : kinds.includes("reconciliation_failure")
          ? "reconciliation_first_then_executor"
          : "executor_micro_then_review",
  };
}

module.exports = {
  prioritizedRemediationTargets,
  describeRetryScope,
};
