"use strict";

const { isStructuralIdempotencyEnabled } = require("../feature-flags");
const { analyzeIdempotencyForRow } = require("./structural-idempotency");

function spansOverlap(a, b) {
  if (!a || !b) return false;
  if (typeof a.start !== "number" || typeof a.end !== "number") return false;
  if (typeof b.start !== "number" || typeof b.end !== "number") return false;
  if (a.end <= a.start || b.end <= b.start) return false;

  return a.start < b.end && b.start < a.end;
}

/**
 * @param {object[]} rows
 */
function detectSupersededStructuralTransforms(rows) {
  /** @type {Record<string, object[]>} */
  const byPath = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const p = row?.path;
    const span = row?.plan_entry?.node_span;
    if (!p || !span) continue;

    if (!byPath[p]) byPath[p] = [];
    byPath[p].push(row);
  }

  /** @type {object[]} */
  const out = [];

  for (const path of Object.keys(byPath)) {
    const list = byPath[path].sort((a, b) => (a.patch_index ?? 0) - (b.patch_index ?? 0));

    for (let i = 0; i < list.length; i++) {
      const ai = list[i].plan_entry?.node_span;
      if (!ai) continue;

      for (let j = i + 1; j < list.length; j++) {
        const bj = list[j].plan_entry?.node_span;
        if (!bj) continue;

        if (spansOverlap(ai, bj)) {
          out.push({
            kind: "superseded_transform",
            path,
            superseded_patch_index: list[i].patch_index,
            superseding_patch_index: list[j].patch_index,
          });
        }
      }
    }
  }

  return out;
}

function detectSelectorMissing(planEntry) {
  if (!planEntry || planEntry.op !== "replace_node") {
    return { missing: true, reason: "no_replace_node_plan" };
  }

  const span = planEntry.node_span;

  if (!span || typeof span.start !== "number" || typeof span.end !== "number") {
    return { missing: true, reason: "node_span_absent" };
  }

  if (planEntry.mapping_status !== "mapped") {
    return { missing: true, reason: "mapping_not_mapped" };
  }

  return { missing: false, reason: null };
}

/**
 * Usa hints capturados em apply time (`structural_replay`).
 */
function detectStaleSelectorFromReplay(row) {
  const sr = row?.structural_replay;
  if (!sr) return null;

  if (sr.span_out_of_bounds) {
    return { kind: "stale_selector", reason: "span_out_of_bounds", patch_index: row.patch_index };
  }

  if (sr.search_missing_in_span) {
    return { kind: "stale_selector", reason: "search_not_in_mvp_span", patch_index: row.patch_index };
  }

  return null;
}

/**
 * @param {object[]} rows
 * @param {object} _fingerprintReport
 * @param {object} _meta
 */
function buildStructuralStaleAnalysisReport(rows, _fingerprintReport, _meta) {
  const rws = Array.isArray(rows) ? rows : [];
  /** @type {object[]} */
  const findings = [];

  for (const row of rws) {
    const sel = detectSelectorMissing(row.plan_entry ?? null);

    if (sel.missing) {
      findings.push({
        kind: "selector_missing",
        patch_index: row.patch_index,
        path: row.path,
        reason: sel.reason,
      });
    }

    const stale = detectStaleSelectorFromReplay(row);
    if (stale) findings.push(stale);

    if (isStructuralIdempotencyEnabled()) {
      const idem = analyzeIdempotencyForRow(row, row.plan_entry ?? null);

      for (const f of idem.findings || []) findings.push({ ...f, patch_index: row.patch_index, path: row.path });
    }
  }

  for (const s of detectSupersededStructuralTransforms(rws)) {
    findings.push(s);
  }

  return {
    schema_version: 1,
    phase: "4.9.6.1",
    generated_at: new Date().toISOString(),
    summary: {
      finding_counts: findings.reduce((acc, f) => {
        const k = f.kind || "unknown";
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    },
    findings,
  };
}

module.exports = {
  spansOverlap,
  detectSupersededStructuralTransforms,
  detectSelectorMissing,
  detectStaleSelectorFromReplay,
  buildStructuralStaleAnalysisReport,
};
