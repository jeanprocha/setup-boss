"use strict";

function histogramFromCodes(rows) {
  /** @type {Record<string, number>} */
  const h = {};

  for (const r of rows) {
    const codes = Array.isArray(r.fallback_reason_codes) ? r.fallback_reason_codes : [];

    for (const c of codes) {
      if (!c) continue;
      h[c] = (h[c] || 0) + 1;
    }
  }

  return h;
}

function histogramTriggers(rows) {
  /** @type {Record<string, number>} */
  const h = {};

  for (const r of rows) {
    const tr = String(r.fallback_trigger || "").trim() || "unknown";
    h[tr] = (h[tr] || 0) + 1;
  }

  return h;
}

function overlaySequencingFromRows(rows) {
  /** @type {Record<string, number[]>} */
  const indicesByPath = {};

  for (const r of rows) {
    if (!r || !r.path) continue;
    if (!indicesByPath[r.path]) indicesByPath[r.path] = [];
    indicesByPath[r.path].push(r.patch_index);
  }

  let maxDepth = 0;

  for (const p of Object.keys(indicesByPath)) {
    maxDepth = Math.max(maxDepth, indicesByPath[p].length);
  }

  return {
    patch_indices_by_path: indicesByPath,
    max_patches_single_file: maxDepth,
  };
}

const { getArtifactContract } = require("../runtime/runtime-lifecycle");

function createStructuralFallbackManager() {
  /** @type {object[]} */
  const telemetry = [];

  return {
    /** @param {object} row */
    record(row) {
      telemetry.push(row);
    },
    snapshot() {
      return telemetry.slice();
    },
    /** @returns {{ schema_version:number, phase:string, entries: object[], counts:object }} */
    buildFallbackReport() {
      const contract = getArtifactContract("structural-fallback-report.json");
      let textualSteps = 0;

      for (const t of telemetry) {
        if (t && t.execution_mode_used === "textual") textualSteps += 1;
      }

      const structuralSteps = telemetry.filter((x) => x.execution_mode_used === "structural").length;
      const divergenceSteps = telemetry.filter(
        (x) => x.execution_mode_used === "textual" && x.fallback_trigger === "divergence",
      ).length;
      const gateSteps = telemetry.filter(
        (x) => x.execution_mode_used === "textual" && x.fallback_trigger === "gate",
      ).length;
      const applyExcSteps = telemetry.filter(
        (x) => x.execution_mode_used === "textual" && x.fallback_trigger === "apply_exception",
      ).length;

      return {
        schema_version: contract?.schema_version ?? 2,
        phase: contract?.phase ?? "4.9.4.1",
        generated_at: new Date().toISOString(),
        counts: {
          patch_steps: telemetry.length,
          execution_mode_structural: structuralSteps,
          execution_mode_textual: textualSteps,
          textual_via_gate: gateSteps,
          textual_via_divergence: divergenceSteps,
          textual_via_apply_exception: applyExcSteps,
        },
        fallback_reason_histogram: histogramFromCodes(
          telemetry.filter((t) => t && t.execution_mode_used === "textual"),
        ),
        fallback_trigger_histogram: histogramTriggers(telemetry),
        overlay_sequencing: overlaySequencingFromRows(telemetry),
        entries: telemetry,
      };
    },
  };
}

module.exports = { createStructuralFallbackManager };
