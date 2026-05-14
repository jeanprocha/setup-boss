/**
 * Fingerprints determinísticos de estado de falha (dedupe / replay analytics).
 */

const { sha256HexOfObject } = require("../lib/stable-stringify");

function collectOperationFingerprints(snapshot) {
  const out = [];
  const changes = Array.isArray(snapshot.executor_changes) ? snapshot.executor_changes : [];
  for (const op of changes) {
    const id =
      op && op.operation_id != null
        ? String(op.operation_id)
        : op && op.id != null
          ? String(op.id)
          : "";
    const failed =
      Boolean(op && op.failed) ||
      Boolean(
        op &&
          Array.isArray(op.results) &&
          op.results.some((r) => r && r.failed),
      );
    if (id) out.push(`${id}:${failed ? "failed" : "ok"}`);
  }
  return out.sort().slice(0, 80);
}

function validationSummaryBrief(snapshot) {
  const vr = snapshot.validation_results;
  const s =
    vr && vr.summary && typeof vr.summary === "object" ? vr.summary : vr && typeof vr === "object" ? vr : null;
  if (!s) return null;
  return {
    status: s.status ?? s.overall ?? null,
    failed_validators:
      typeof s.failed_validators === "number"
        ? s.failed_validators
        : typeof s.failed_count === "number"
          ? s.failed_count
          : null,
    failed_validator_ids_sorted: collectFailedValidatorIds(s).slice(0, 60),
  };
}

function collectFailedValidatorIds(summary) {
  const ids = [];
  if (summary.failures_detail && Array.isArray(summary.failures_detail)) {
    for (const row of summary.failures_detail) {
      if (!row || row.status === "passed" || row.status === "skipped") continue;
      ids.push(row.validator_id ? String(row.validator_id) : String(row.validator_type || ""));
    }
  }
  return ids.filter(Boolean).sort();
}

function buildFailureSignatureCanonical({ classifications, failures, snapshot, reviewResults, correctionHints }) {
  const invIds = uniqSorted(
    (failures || []).flatMap((b) =>
      (b.items || []).filter((it) => (it.subtype || "").includes("invariants")).map((it) => it.id),
    ),
  );

  const flatItems =
    failures &&
    failures.flatMap((b) =>
      (b.items || []).map((it) => ({
        c: b.classification,
        id: it.id,
        st: it.subtype || "",
      })),
    );
  flatItems.sort((a, b) => `${a.c}|${a.id}|${a.st}`.localeCompare(`${b.c}|${b.id}|${b.st}`));

  const reconciliation = snapshot.reconciliation
    ? {
        status: snapshot.reconciliation.status,
        unexpected_changes: snapshot.reconciliation.unexpected_changes ?? null,
        orphan_operations: snapshot.reconciliation.orphan_operations ?? null,
      }
    : null;

  const rr =
    reviewResults && reviewResults.summary ? { req_corr: !!reviewResults.summary.requires_correction } : null;

  return {
    schema_version: 1,
    classifications: classifications || [],
    item_keys_sorted: flatItems.map((x) => `${x.c}::${x.id}::${x.st}`).slice(0, 240),
    invariant_hint_ids_sorted: uniqSorted(
      (correctionHints && correctionHints.invariant_violation_targets) || [],
    ),
    invariant_ids_sorted: invIds,
    reconciliation,
    validation: validationSummaryBrief(snapshot),
    operations: collectOperationFingerprints(snapshot),
    review_status_rr: rr,
    replay_checkpoint_last:
      snapshot.runtime_checkpoints && Array.isArray(snapshot.runtime_checkpoints.checkpoints)
        ? snapshot.runtime_checkpoints.checkpoints.slice(-1).map((c) =>
            typeof c.phaseCompleted === "string" ? c.phaseCompleted : "",
          )
        : null,
  };
}

function uniqSorted(arr) {
  return [...new Set((arr || []).map((x) => String(x)))].sort();
}

function computeFailureSignature({ classifications, failures, snapshot, reviewResults, correctionHints }) {
  const canonical = buildFailureSignatureCanonical({
    classifications,
    failures,
    snapshot,
    reviewResults,
    correctionHints,
  });
  const sha256 = sha256HexOfObject(canonical);
  return {
    fingerprint_canonical: canonical,
    failure_signature_sha256: sha256,
  };
}

module.exports = {
  computeFailureSignature,
  buildFailureSignatureCanonical,
};
