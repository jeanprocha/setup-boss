"use strict";

const path = require("path");

const {
  readUpdatedPlanRaw,
  writeUpdatedPlan,
  listPlanCommentThreads,
  readAdditionalAnswers,
} = require("./plan-comment-store.js");
const {
  loadBasePlanPresentation,
  loadPlanExcerptForComment,
} = require("../../../core/load-base-plan-presentation.js");
const { generateUpdatedPlanHeuristic } = require("./generate-updated-plan-heuristic.js");
const {
  buildOperationalExecutableStrategy,
} = require("../../../core/build-operational-executable-strategy.js");
const { updatedPlanDocIsStale } = require("../../../core/operational-plan-staleness.js");

/**
 * Próxima versão de plano (v1 = inicial; cada updated-plan incrementa).
 * @param {string} outputDir
 */
function resolveNextPlanVersion(outputDir) {
  const threads = listPlanCommentThreads(outputDir);
  let max = 1;
  for (const t of threads) {
    if (t.updatedPlan?.planVersion && t.updatedPlan.planVersion > max) {
      max = t.updatedPlan.planVersion;
    }
  }
  return max + 1;
}

/**
 * @param {{
 *   outputDir: string,
 *   commentId: string,
 *   commentText: string,
 *   analysis?: object|null,
 *   planExcerpt?: string,
 * }} input
 */
function buildUpdatedPlanPresentation(input) {
  const outputDir = String(input.outputDir || "").trim();
  const commentId = String(input.commentId || "").trim();
  const planExcerpt =
    input.planExcerpt || loadPlanExcerptForComment(outputDir, commentId);
  const additionalAnswersDoc = readAdditionalAnswers(outputDir, commentId);
  const additionalAnswers = additionalAnswersDoc?.answers ?? null;
  const basePresentation = loadBasePlanPresentation(outputDir, commentId);

  return generateUpdatedPlanHeuristic({
    planExcerpt,
    basePresentation,
    commentText: input.commentText,
    analysis: input.analysis,
    additionalAnswers,
  });
}

/**
 * @param {{
 *   outputDir: string,
 *   commentId: string,
 *   commentText: string,
 *   analysis?: object|null,
 *   planExcerpt?: string,
 * }} input
 */
async function generateUpdatedPlanForComment(input) {
  const outputDir = String(input.outputDir || "").trim();
  const commentId = String(input.commentId || "").trim();
  if (!outputDir || !commentId) {
    return {
      ok: false,
      code: "plan_update_invalid",
      message: "outputDir e commentId são obrigatórios.",
    };
  }

  const existingFile = readUpdatedPlanRaw(outputDir, commentId);
  const basePresentation = loadBasePlanPresentation(outputDir, commentId);

  if (existingFile?.normalized && basePresentation?.hasContent) {
    const stale = updatedPlanDocIsStale(
      {
        ...existingFile.normalized,
        schemaVersion: existingFile.raw.schemaVersion,
        canonicalized: existingFile.raw.canonicalized,
      },
      basePresentation,
    );
    if (!stale) {
      const { needsSchemaMigration: _m, ...payload } = existingFile.normalized;
      if (existingFile.normalized.needsSchemaMigration) {
        const migrated = writeUpdatedPlan(outputDir, commentId, payload);
        return { ok: true, updatedPlan: migrated, idempotent: true };
      }
      return { ok: true, updatedPlan: payload, idempotent: true };
    }
  }

  const presentation = buildUpdatedPlanPresentation(input);
  const planVersion =
    existingFile?.normalized?.planVersion > 0
      ? existingFile.normalized.planVersion
      : resolveNextPlanVersion(outputDir);

  const updatedPlan = writeUpdatedPlan(outputDir, commentId, {
    commentId,
    planVersion,
    supersedesPlanVersion: planVersion - 1,
    generatedAt: new Date().toISOString(),
    presentation,
  });

  if (planVersion > 1) {
    try {
      buildOperationalExecutableStrategy({
        outputDirAbs: path.resolve(outputDir),
        planVersion,
        sourcePlanVersion: planVersion,
        write: true,
      });
    } catch {
      /* OES opcional */
    }
  }

  return { ok: true, updatedPlan, idempotent: false, regenerated: Boolean(existingFile) };
}

/**
 * Regenera plano stale (sobrescreve artefato).
 *
 * @param {{
 *   outputDir: string,
 *   commentId: string,
 *   commentText: string,
 *   analysis?: object|null,
 *   planExcerpt?: string,
 * }} input
 */
function regenerateStaleUpdatedPlanForComment(input) {
  const outputDir = String(input.outputDir || "").trim();
  const commentId = String(input.commentId || "").trim();
  if (!outputDir || !commentId) {
    return {
      ok: false,
      code: "plan_update_invalid",
      message: "outputDir e commentId são obrigatórios.",
    };
  }

  const existingFile = readUpdatedPlanRaw(outputDir, commentId);
  const presentation = buildUpdatedPlanPresentation(input);
  const planVersion =
    existingFile?.normalized?.planVersion > 0
      ? existingFile.normalized.planVersion
      : resolveNextPlanVersion(outputDir);

  const updatedPlan = writeUpdatedPlan(outputDir, commentId, {
    commentId,
    planVersion,
    supersedesPlanVersion: planVersion - 1,
    generatedAt: new Date().toISOString(),
    presentation,
  });

  return { ok: true, updatedPlan, regenerated: true };
}

module.exports = {
  generateUpdatedPlanForComment,
  regenerateStaleUpdatedPlanForComment,
  resolveNextPlanVersion,
  buildUpdatedPlanPresentation,
};
