"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  isStructuralGovernanceEnabled,
  isStructuralReplayFoundationEnabled,
} = require("../feature-flags");
const { buildPatchGovernanceDecision } = require("../governance/structural-governance-gate");

function safeWriteJson(outputDir, name, data, outputFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outputFs && typeof outputFs.writeJson === "function") outputFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const keys = Object.keys(value).sort();

  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",")}}`;
}

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
}

/**
 * Digest do texto UTF-8 dentro do span [start,end) no snapshot `before`.
 */
function computeSpanContentSha256(before, span) {
  if (
    !span ||
    typeof span.start !== "number" ||
    typeof span.end !== "number" ||
    span.end <= span.start
  ) {
    return null;
  }

  const slice = String(before ?? "").slice(span.start, span.end);

  return sha256HexUtf8(slice);
}

function computeWholeFileSha256(before) {
  return sha256HexUtf8(String(before ?? ""));
}

/**
 * Payload canónico MVP para fingerprint estável (selector + node_kind + patch).
 * @param {object|null} planEntry
 * @param {{ path?: string, patch_index?: number }} row
 * @param {object|null} structuralReplay
 */
function buildCanonicalFingerprintPayload(planEntry, row, structuralReplay) {
  const pe = planEntry && typeof planEntry === "object" ? planEntry : null;
  const span = pe?.node_span;

  return {
    phase: "4.9.6.1",
    path: String(row?.path ?? ""),
    patch_index: typeof row?.patch_index === "number" ? row.patch_index : -1,
    op: pe?.op ?? null,
    node_kind: pe?.node_kind ?? null,
    node_path_hint: pe?.node_path_hint ?? null,
    mapping_status: pe?.mapping_status ?? null,
    node_span:
      span && typeof span.start === "number" && typeof span.end === "number"
        ? { start: span.start, end: span.end }
        : null,
    search: pe?.search != null ? String(pe.search) : null,
    replace: pe?.replace != null ? String(pe.replace) : null,
    span_content_sha256: structuralReplay?.span_content_sha256 ?? null,
    before_file_sha256: structuralReplay?.before_file_sha256 ?? null,
  };
}

function computeStructuralFingerprint(planEntry, row, structuralReplay) {
  const canonical = buildCanonicalFingerprintPayload(planEntry, row, structuralReplay);

  return {
    fingerprint_sha256: sha256HexUtf8(stableStringify(canonical)),
    canonical,
  };
}

function buildStructuralFingerprintReport(rows, meta) {
  const list = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const { fingerprint_sha256, canonical } = computeStructuralFingerprint(
      row.plan_entry ?? null,
      row,
      row.structural_replay ?? null,
    );

    /** @type {{ blockers?: string[], risk_tier?: string }|null} */
    let governance_linkage = null;

    if (isStructuralGovernanceEnabled()) {
      const d = buildPatchGovernanceDecision(row, {
        run_distinct_files: meta?.runDistinctFiles,
        min_score_required: meta?.minScoreRequired,
      });
      governance_linkage = {
        blockers: d.blockers,
        risk_tier: d.risk.tier,
      };
    }

    list.push({
      patch_index: row.patch_index,
      path: row.path,
      fingerprint_sha256,
      canonical,
      governance_linkage,
    });
  }

  return {
    schema_version: 1,
    phase: "4.9.6.1",
    generated_at: new Date().toISOString(),
    enabled: true,
    per_patch: list,
  };
}

/**
 * Escreve structural-fingerprint-report + delega lineage/stale (relatórios 4.9.6.1).
 * @param {{ outputDir: string, outputFs?: object|null, rows: object[], runDistinctFiles?: number, minScoreRequired?: number }} o
 */
function writeStructuralReplayFoundationArtifacts(o) {
  if (!isStructuralReplayFoundationEnabled()) return;
  if (!o?.outputDir) return;

  const meta = {
    runDistinctFiles: o.runDistinctFiles,
    minScoreRequired: o.minScoreRequired,
  };

  const fpReport = buildStructuralFingerprintReport(o.rows, meta);
  safeWriteJson(o.outputDir, "structural-fingerprint-report.json", fpReport, o.outputFs || null);

  const { buildStructuralLineageReport } = require("./structural-lineage");
  const lineageReport = buildStructuralLineageReport(o.rows, fpReport);
  safeWriteJson(o.outputDir, "structural-lineage-report.json", lineageReport, o.outputFs || null);

  const { buildStructuralStaleAnalysisReport } = require("./structural-stale-detector");
  const staleReport = buildStructuralStaleAnalysisReport(o.rows, fpReport, meta);
  safeWriteJson(o.outputDir, "structural-stale-analysis.json", staleReport, o.outputFs || null);
}

module.exports = {
  stableStringify,
  sha256HexUtf8,
  computeSpanContentSha256,
  computeWholeFileSha256,
  buildCanonicalFingerprintPayload,
  computeStructuralFingerprint,
  buildStructuralFingerprintReport,
  writeStructuralReplayFoundationArtifacts,
};
