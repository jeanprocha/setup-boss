"use strict";

const fs = require("fs");
const path = require("path");

const {
  buildStructuralTransformPlans,
} = require("./structural/transform-plan-builder");
const { resolveStructuralOrTextualPatch } = require("./structural/structural-execution-gate");
const { createStructuralFallbackManager } = require("./structural/structural-fallback-manager");
const {
  isHybridExecutionApplyActive,
  getStructuralExecutionMinConfidenceFraction,
  isStructuralGovernanceEnabled,
  isStructuralReplayFoundationEnabled,
  isStructuralReplayShadowEnabled,
  isHybridRuntimeObservabilityEnabled,
  getHybridRuntimeEnvSnapshot,
} = require("./feature-flags");
const { writeStructuralGovernanceArtifacts } = require("./governance/structural-governance-gate");
const { writeStructuralReplayFoundationArtifacts } = require("./replay/structural-fingerprint");
const { writeStructuralReplayShadowArtifacts, buildStructuralReplayShadowPayload } = require("./replay/structural-replay-shadow");
const { getArtifactContract, buildRuntimeLifecycleSummary } = require("./runtime/runtime-lifecycle");
const { createReplayPayloadRunScope } = require("./runtime/replay-payload-session-cache");
const { buildAggregatedHybridTelemetry } = require("./runtime/runtime-telemetry-summary");
const { runArtifactValidationSuite } = require("./runtime/runtime-artifact-validator");

function safeWriteJson(outputDir, name, data, outputFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outputFs && typeof outputFs.writeJson === "function") outputFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

/**
 * Resolve um patch com structural-first + fallback textual (nunca bloqueia o textual).
 * @param {{
 *   projectRoot: string,
 *   relativePath: string,
 *   before: string,
 *   change: object,
 *   allowedFiles: string[],
 *   overlay: object|null,
 *   patchIndex: number,
 * }} ctx
 */
function resolveHybridPatchStep(ctx) {
  const minFrac = getStructuralExecutionMinConfidenceFraction();
  const rel = ctx.relativePath;
  const gateOverlay =
    ctx.overlay && typeof ctx.overlay === "object"
      ? { ...ctx.overlay, [rel]: ctx.before }
      : { [rel]: ctx.before };

  return resolveStructuralOrTextualPatch({
    before: ctx.before,
    change: ctx.change,
    minConfidenceFraction: minFrac,
    relativePath: rel,
    buildPlan: () =>
      buildStructuralTransformPlans({
        projectRoot: ctx.projectRoot,
        overlay: gateOverlay,
        allowedFiles: ctx.allowedFiles,
        changes: [
          {
            operation: "patch",
            path: rel,
            search: ctx.change.search,
            replace: ctx.change.replace,
            reason: ctx.change.reason || "",
          },
        ],
      }),
  });
}

/**
 * Grava artefactos 4.9.4 (best-effort).
 * @param {{
 *   outputDir: string,
 *   outputFs?: { writeJson?: Function }|null,
 *   rows: object[],
 *   startedAt: string,
 *   finishedAt: string,
 *   durationMs: number,
 *   runDistinctFiles?: number,
 *   projectRoot?: string,
 *   initialOverlay?: Record<string, string>|null,
 * }} o
 */
function writeHybridExecutionArtifacts(o) {
  const rows = Array.isArray(o.rows) ? o.rows : [];
  const structuralCount = rows.filter((r) => r.execution_mode_used === "structural").length;
  const textualCount = rows.filter((r) => r.execution_mode_used === "textual").length;

  /** @type {Record<string, number>} */
  const fbHist = {};

  for (const r of rows) {
    if (!r || r.execution_mode_used !== "textual") continue;
    const codes = Array.isArray(r.fallback_reason_codes) ? r.fallback_reason_codes : [];

    for (const c of codes) {
      if (!c) continue;
      fbHist[c] = (fbHist[c] || 0) + 1;
    }
  }

  /** @type {Record<string, number>} */
  const trHist = {};

  for (const r of rows) {
    const k = String(r.fallback_trigger || "none").trim() || "none";
    trHist[k] = (trHist[k] || 0) + 1;
  }

  /** @type {Record<string, number[]>} */
  const byPath = {};

  for (const r of rows) {
    if (!r || !r.path) continue;
    if (!byPath[r.path]) byPath[r.path] = [];
    byPath[r.path].push(r.patch_index);
  }

  let maxPerFile = 0;

  for (const p of Object.keys(byPath)) {
    maxPerFile = Math.max(maxPerFile, byPath[p].length);
  }

  const hybridContract = getArtifactContract("hybrid-execution-results.json");
  const hybridPayload = {
    schema_version: hybridContract?.schema_version ?? 2,
    phase: hybridContract?.phase ?? "4.9.4.1",
    hybrid_execution_apply_active: isHybridExecutionApplyActive(),
    min_confidence_fraction: getStructuralExecutionMinConfidenceFraction(),
    started_at: o.startedAt,
    finished_at: o.finishedAt,
    duration_ms: o.durationMs,
    summary: {
      patch_steps: rows.length,
      execution_mode_structural: structuralCount,
      execution_mode_textual: textualCount,
      mixed_execution_modes: structuralCount > 0 && textualCount > 0,
      fallback_reason_histogram: fbHist,
      fallback_trigger_histogram: trHist,
    },
    diagnostics: {
      overlay_sequencing: {
        patch_indices_by_path: byPath,
        max_patches_single_file: maxPerFile,
      },
    },
    per_patch: rows,
  };

  safeWriteJson(o.outputDir, "hybrid-execution-results.json", hybridPayload, o.outputFs || null);

  const fb = createStructuralFallbackManager();

  for (const r of rows) {
    fb.record({
      patch_index: r.patch_index,
      path: r.path,
      execution_mode_used: r.execution_mode_used,
      fallback_reason: r.fallback_reason,
      fallback_reason_codes: r.fallback_reason_codes,
      fallback_trigger: r.fallback_trigger,
      confidence_score: r.gate_snapshot?.confidence_score ?? null,
      min_score_required: r.gate_snapshot?.min_score_required ?? null,
      gate_allowed_structural: !!(r.gate_snapshot && r.gate_snapshot.allowed),
    });
  }

  const fbReport = fb.buildFallbackReport();
  safeWriteJson(o.outputDir, "structural-fallback-report.json", fbReport, o.outputFs || null);

  if (isStructuralGovernanceEnabled()) {
    const derivedDistinct =
      typeof o.runDistinctFiles === "number"
        ? o.runDistinctFiles
        : new Set(rows.map((r) => r.path).filter(Boolean)).size;

    writeStructuralGovernanceArtifacts({
      outputDir: o.outputDir,
      outputFs: o.outputFs || null,
      rows,
      runDistinctFiles: derivedDistinct,
      minScoreRequired: Math.min(
        100,
        Math.max(0, Math.round(getStructuralExecutionMinConfidenceFraction() * 100)),
      ),
    });
  }

  if (isStructuralReplayFoundationEnabled()) {
    const derivedDistinct =
      typeof o.runDistinctFiles === "number"
        ? o.runDistinctFiles
        : new Set(rows.map((r) => r.path).filter(Boolean)).size;

    writeStructuralReplayFoundationArtifacts({
      outputDir: o.outputDir,
      outputFs: o.outputFs || null,
      rows,
      runDistinctFiles: derivedDistinct,
      minScoreRequired: Math.min(
        100,
        Math.max(0, Math.round(getStructuralExecutionMinConfidenceFraction() * 100)),
      ),
    });
  }

  if (!isStructuralReplayShadowEnabled() && !isHybridRuntimeObservabilityEnabled()) {
    return;
  }

  const derivedDistinctReplay =
    typeof o.runDistinctFiles === "number"
      ? o.runDistinctFiles
      : new Set(rows.map((r) => r.path).filter(Boolean)).size;
  const minScoreHybridReplay = Math.min(
    100,
    Math.max(0, Math.round(getStructuralExecutionMinConfidenceFraction() * 100)),
  );
  const replayOptsUnified = {
    outputDir: o.outputDir,
    outputFs: o.outputFs || null,
    rows,
    runDistinctFiles: derivedDistinctReplay,
    minScoreRequired: minScoreHybridReplay,
    projectRoot: o.projectRoot || "",
    initialOverlay: o.initialOverlay && typeof o.initialOverlay === "object" ? o.initialOverlay : null,
  };

  /** @type {ReturnType<typeof createReplayPayloadRunScope>|null} */
  let replayPayloadRunScope = null;

  if (isStructuralReplayShadowEnabled()) {
    replayPayloadRunScope = createReplayPayloadRunScope();
    const replayPack = replayPayloadRunScope.getOrBuild(() =>
      buildStructuralReplayShadowPayload(replayOptsUnified),
    );

    writeStructuralReplayShadowArtifacts(o, replayPack);
  }

  if (isHybridRuntimeObservabilityEnabled()) {
    /** @type {Record<string, object>} */
    const bundle = {
      "hybrid-execution-results.json": hybridPayload,
      "structural-fallback-report.json": fbReport,
    };

    if (isStructuralReplayShadowEnabled() && replayPayloadRunScope) {
      try {
        const rp = replayPayloadRunScope.getOrBuild(() =>
          buildStructuralReplayShadowPayload(replayOptsUnified),
        );
        bundle["structural-replay-shadow.json"] = rp.shadowPayload;
        bundle["structural-replay-classification.json"] = rp.classificationPayload;
        bundle["structural-replay-continuity.json"] = rp.continuity;
      } catch (_) {}
    }

    const summaryContract = getArtifactContract("hybrid-runtime-summary.json");
    const validation = runArtifactValidationSuite(bundle);

    const summaryPayload = {
      schema_version: summaryContract?.schema_version ?? 1,
      phase: summaryContract?.phase ?? "4.9.7.1",
      generated_at: new Date().toISOString(),
      lifecycle: buildRuntimeLifecycleSummary(getHybridRuntimeEnvSnapshot()),
      telemetry_aggregate: buildAggregatedHybridTelemetry(rows, {
        startedAt: o.startedAt,
        finishedAt: o.finishedAt,
        durationMs: o.durationMs,
        runDistinctFiles: derivedDistinctReplay,
      }),
      artifact_validation: validation,
      bundle_files: Object.keys(bundle),
    };

    safeWriteJson(o.outputDir, "hybrid-runtime-summary.json", summaryPayload, o.outputFs || null);
  }
}

module.exports = {
  resolveHybridPatchStep,
  writeHybridExecutionArtifacts,
};
