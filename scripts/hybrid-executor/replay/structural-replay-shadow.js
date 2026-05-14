"use strict";

const fs = require("fs");
const path = require("path");

const { isStructuralReplayShadowEnabled, getStructuralExecutionMinConfidenceFraction } = require("../feature-flags");
const { getArtifactContract } = require("../runtime/runtime-lifecycle");
const { buildStructuralFingerprintReport } = require("./structural-fingerprint");
const { buildStructuralLineageReport } = require("./structural-lineage");
const { buildStructuralStaleAnalysisReport } = require("./structural-stale-detector");
const { classifyAllStructuralReplayRows } = require("./structural-replay-classifier");
const { runStructuralReplayOverlaySimulation } = require("./structural-replay-overlay");

function safeWriteJson(outputDir, name, data, outputFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outputFs && typeof outputFs.writeJson === "function") outputFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

function classificationHistogram(classified) {
  return (Array.isArray(classified) ? classified : []).reduce((acc, c) => {
    const k = c?.classification || "unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

let _structuralReplayShadowPayloadBuildCount = 0;

function getStructuralReplayShadowPayloadBuildCount() {
  return _structuralReplayShadowPayloadBuildCount;
}

function resetStructuralReplayShadowPayloadBuildCount() {
  _structuralReplayShadowPayloadBuildCount = 0;
}

/**
 * @param {object} o
 * @param {string} o.outputDir
 * @param {{ writeJson?: Function }|null} [o.outputFs]
 * @param {object[]} o.rows
 * @param {number} [o.runDistinctFiles]
 * @param {number} [o.minScoreRequired]
 * @param {string} [o.projectRoot]
 * @param {object|null} [o.initialOverlay]
 */
function buildStructuralReplayShadowPayload(o) {
  _structuralReplayShadowPayloadBuildCount += 1;

  const rows = Array.isArray(o.rows) ? o.rows : [];

  const minFrac = getStructuralExecutionMinConfidenceFraction();
  const minScore =
    typeof o.minScoreRequired === "number"
      ? o.minScoreRequired
      : Math.min(100, Math.max(0, Math.round(minFrac * 100)));

  const meta = {
    runDistinctFiles: o.runDistinctFiles,
    minScoreRequired: minScore,
  };

  const fpReport = buildStructuralFingerprintReport(rows, meta);
  const lineageReport = buildStructuralLineageReport(rows, fpReport);
  const staleReport = buildStructuralStaleAnalysisReport(rows, fpReport, meta);
  const overlaySim = runStructuralReplayOverlaySimulation(rows, {
    projectRoot: o.projectRoot || "",
    initialOverlay: o.initialOverlay || null,
  });

  const classified = classifyAllStructuralReplayRows(rows, {
    staleReport,
    runDistinctFiles: o.runDistinctFiles,
    minScoreRequired: minScore,
  });

  const byIdx = new Map(overlaySim.per_patch.map((p) => [p.patch_index, p]));
  const perPatchRich = classified.map((c) => ({
    ...c,
    overlay_replay_diagnostics: byIdx.get(c.patch_index) ?? null,
  }));

  const contractReplay = getArtifactContract("structural-replay-shadow.json");
  const contractCls = getArtifactContract("structural-replay-classification.json");
  const contractCont = getArtifactContract("structural-replay-continuity.json");
  const sv = contractReplay?.schema_version ?? 1;
  const ph = contractReplay?.phase ?? "4.9.7";

  const continuity = {
    schema_version: contractCont?.schema_version ?? sv,
    phase: contractCont?.phase ?? ph,
    generated_at: new Date().toISOString(),
    shadow_only: true,
    lineage_continuity: lineageReport.continuity,
    overlay_chain: {
      ok: !overlaySim.chain_abort,
      abort: overlaySim.chain_abort,
      per_patch: overlaySim.per_patch,
    },
    fingerprint_per_patch: (fpReport.per_patch || []).map((p) => ({
      patch_index: p.patch_index,
      path: p.path,
      fingerprint_sha256: p.fingerprint_sha256,
    })),
  };

  const classificationPayload = {
    schema_version: contractCls?.schema_version ?? sv,
    phase: contractCls?.phase ?? ph,
    generated_at: new Date().toISOString(),
    shadow_only: true,
    summary: {
      per_patch: rows.length,
      classification_counts: classificationHistogram(classified),
    },
    per_patch: perPatchRich,
  };

  const shadowPayload = {
    schema_version: contractReplay?.schema_version ?? sv,
    phase: contractReplay?.phase ?? ph,
    generated_at: new Date().toISOString(),
    shadow_only: true,
    enabled: true,
    replay_simulation: {
      overlay: overlaySim,
      lineage_entry_count: lineageReport.entries?.length ?? 0,
      stale_finding_count: staleReport.findings?.length ?? 0,
    },
    diagnostics: {
      lineage_gaps: lineageReport.continuity?.gaps?.length ?? 0,
      overlay_chain_aborted: !!overlaySim.chain_abort,
      governance_integrated: perPatchRich.some((x) => x.governance_linkage?.applies_structural_governance),
    },
    per_patch: perPatchRich,
  };

  return { shadowPayload, classificationPayload, continuity, lineageReport, fpReport, staleReport };
}

/**
 * @param {object} o
 * @param {{ shadowPayload: object, classificationPayload: object, continuity: object }|null|undefined} [prebuilt] — reutilizar payload (4.9.7.2)
 */
function writeStructuralReplayShadowArtifacts(o, prebuilt) {
  if (!isStructuralReplayShadowEnabled()) return;
  if (!o?.outputDir) return;

  const minFrac = getStructuralExecutionMinConfidenceFraction();
  const minScore =
    typeof o.minScoreRequired === "number"
      ? o.minScoreRequired
      : Math.min(100, Math.max(0, Math.round(minFrac * 100)));

  const pack =
    prebuilt && prebuilt.shadowPayload && prebuilt.classificationPayload && prebuilt.continuity
      ? prebuilt
      : buildStructuralReplayShadowPayload({
          ...o,
          minScoreRequired: minScore,
        });

  safeWriteJson(o.outputDir, "structural-replay-shadow.json", pack.shadowPayload, o.outputFs || null);
  safeWriteJson(
    o.outputDir,
    "structural-replay-classification.json",
    pack.classificationPayload,
    o.outputFs || null,
  );
  safeWriteJson(o.outputDir, "structural-replay-continuity.json", pack.continuity, o.outputFs || null);
}

module.exports = {
  buildStructuralReplayShadowPayload,
  writeStructuralReplayShadowArtifacts,
  getStructuralReplayShadowPayloadBuildCount,
  resetStructuralReplayShadowPayloadBuildCount,
};
