"use strict";

const crypto = require("crypto");

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

/**
 * @param {object} row
 * @param {string} fingerprintSha256
 */
function computeLineageId(row, fingerprintSha256) {
  const base = `sb-struct-lineage|v1|${String(row?.path ?? "")}|${row?.patch_index ?? -1}|${fingerprintSha256}`;

  return sha256HexUtf8(base);
}

/**
 * @param {object[]} rows — telemetria híbrida (ordenada por patch_index)
 * @param {object} fingerprintReport — resultado de buildStructuralFingerprintReport
 */
function buildStructuralLineageReport(rows, fingerprintReport) {
  const rws = Array.isArray(rows) ? rows.slice().sort((a, b) => (a.patch_index ?? 0) - (b.patch_index ?? 0)) : [];
  const fpByIndex = new Map(
    (fingerprintReport?.per_patch || []).map((p) => [p.patch_index, p]),
  );
  /** @type {Map<string, { lineage_id: string, patch_index: number }>} */
  const lastByPath = new Map();
  const entries = [];
  const continuity_gaps = [];

  for (let i = 0; i < rws.length; i++) {
    const row = rws[i];
    const fp = fpByIndex.get(row.patch_index) || null;
    const fingerprint_sha256 = fp?.fingerprint_sha256 || "";
    const lineage_id = computeLineageId(row, fingerprint_sha256);
    const pathKey = String(row.path ?? "");
    const prev = lastByPath.get(pathKey);
    const parent_lineage_id = prev ? prev.lineage_id : null;

    if (parent_lineage_id) {
      const prevPatch = prev.patch_index;
      if (typeof row.patch_index === "number" && row.patch_index <= prevPatch) {
        continuity_gaps.push({
          kind: "patch_order_inversion",
          path: pathKey,
          patch_index: row.patch_index,
          previous_patch_index: prevPatch,
        });
      }
    }

    entries.push({
      patch_index: row.patch_index,
      path: row.path,
      lineage_id,
      parent_lineage_id,
      fingerprint_sha256,
      sequence_same_file: row.sequence_same_file ?? null,
    });

    lastByPath.set(pathKey, { lineage_id, patch_index: row.patch_index ?? -1 });
  }

  let parent_resolve_ok = true;

  for (const e of entries) {
    if (!e.parent_lineage_id) continue;
    const found = entries.some((x) => x.lineage_id === e.parent_lineage_id);
    if (!found) {
      parent_resolve_ok = false;
      continuity_gaps.push({
        kind: "parent_lineage_unresolved",
        patch_index: e.patch_index,
        path: e.path,
        parent_lineage_id: e.parent_lineage_id,
      });
    }
  }

  return {
    schema_version: 1,
    phase: "4.9.6.1",
    generated_at: new Date().toISOString(),
    entries,
    continuity: {
      ok: continuity_gaps.length === 0 && parent_resolve_ok,
      gaps: continuity_gaps,
    },
  };
}

module.exports = {
  computeLineageId,
  buildStructuralLineageReport,
};
