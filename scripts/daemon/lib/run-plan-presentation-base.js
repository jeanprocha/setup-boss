"use strict";

const { resolveOutputDir } = require("../../../core/run-resolver");
const {
  readPlanPresentationBaseSnapshot,
  readPlanPresentationBaseSnapshotDoc,
  writePlanPresentationBaseSnapshot,
} = require("../../../core/plan-presentation-base-snapshot.js");

/**
 * @param {string} runIdOrPath
 */
function resolveOutputForRun(runIdOrPath) {
  try {
    const outputDir = resolveOutputDir(runIdOrPath);
    if (!outputDir) {
      return {
        ok: false,
        code: "output_unavailable",
        message: "Output da run indisponível.",
      };
    }
    return { ok: true, outputDir };
  } catch (e) {
    return {
      ok: false,
      code: "output_unavailable",
      message: e instanceof Error ? e.message : "Output da run indisponível.",
    };
  }
}

/**
 * @param {string} runId
 */
function collectPlanPresentationBaseForRun(runId) {
  const out = resolveOutputForRun(runId);
  if (!out.ok) return out;

  const doc = readPlanPresentationBaseSnapshotDoc(out.outputDir);
  const presentation = readPlanPresentationBaseSnapshot(out.outputDir);
  if (!presentation) {
    return {
      ok: true,
      data: { available: false, snapshot: null, presentation: null },
    };
  }

  return {
    ok: true,
    data: {
      available: true,
      snapshot: doc
        ? {
            schemaVersion: doc.schemaVersion,
            generatedAt: doc.generatedAt,
            canonicalized: doc.canonicalized,
            source: doc.source,
            planVersion: doc.planVersion,
          }
        : null,
      presentation,
    },
  };
}

/**
 * @param {string} runId
 * @param {{ presentation: object }} body
 */
function upsertPlanPresentationBaseForRun(runId, body) {
  const out = resolveOutputForRun(runId);
  if (!out.ok) return out;

  const presentation = body?.presentation;
  if (!presentation || typeof presentation !== "object") {
    return {
      ok: false,
      code: "plan_presentation_base_invalid",
      message: "Campo presentation é obrigatório.",
    };
  }

  try {
    const doc = writePlanPresentationBaseSnapshot(out.outputDir, presentation, {
      source: "ui",
    });
    return {
      ok: true,
      data: {
        schemaVersion: doc.schemaVersion,
        generatedAt: doc.generatedAt,
        canonicalized: doc.canonicalized,
        source: doc.source,
        planVersion: doc.planVersion,
      },
    };
  } catch (e) {
    return {
      ok: false,
      code: "plan_presentation_base_invalid",
      message: e instanceof Error ? e.message : "Apresentação inválida.",
    };
  }
}

module.exports = {
  collectPlanPresentationBaseForRun,
  upsertPlanPresentationBaseForRun,
};
