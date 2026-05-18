"use strict";

const { parsePlanExcerpt } = require("../../../core/parse-plan-excerpt.js");
const {
  generateFullUpdatedPlanPresentation,
  inferComplexityLevel: inferFromCore,
} = require("../../../core/generate-full-updated-plan-presentation.js");

/**
 * @param {{
 *   planExcerpt?: string,
 *   basePresentation?: object|null,
 *   commentText: string,
 *   analysis?: object|null,
 *   additionalAnswers?: Array<{ question: string, answer: string }>|null,
 * }} input
 */
function generateUpdatedPlanHeuristic(input) {
  const parsed = parsePlanExcerpt(input.planExcerpt || "");
  return generateFullUpdatedPlanPresentation({
    planExcerpt: input.planExcerpt,
    basePresentation: input.basePresentation,
    parsedExcerpt: parsed,
    commentText: input.commentText,
    analysis: input.analysis,
    additionalAnswers: input.additionalAnswers,
  });
}

module.exports = {
  generateUpdatedPlanHeuristic,
  inferComplexityLevel: inferFromCore,
};
