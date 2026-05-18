"use strict";

const {
  sanitizeUpdatedPlanPresentation,
} = require("../../../core/generate-full-updated-plan-presentation.js");
const {
  normalizeComplexityObject,
} = require("../../../core/operational-plan-complexity.js");
const {
  OPERATIONAL_PLAN_SCHEMA_VERSION,
} = require("../../../core/operational-plan-staleness.js");

/** @typedef {"question" | "no_change" | "update_plan" | "needs_questions"} PlanCommentClassification */

const CLASSIFICATIONS = Object.freeze([
  "question",
  "no_change",
  "update_plan",
  "needs_questions",
]);

const ANALYSIS_FILE = "plan-comment-analysis.json";
const COMMENT_FILE = "comment.json";
const ADDITIONAL_QUESTIONS_FILE = "additional-questions.json";
const ADDITIONAL_ANSWERS_FILE = "additional-answers.json";
const UPDATED_PLAN_FILE = "updated-plan.json";
const COMMENTS_ROOT = "plan-comments";

/**
 * @param {unknown} v
 * @returns {v is PlanCommentClassification}
 */
function isClassification(v) {
  return typeof v === "string" && CLASSIFICATIONS.includes(v);
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeAnalysisDoc(raw, commentId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const classification = o.classification;
  if (!isClassification(classification)) return null;
  const suggestedQuestions = Array.isArray(o.suggestedQuestions)
    ? o.suggestedQuestions
        .map((q) => String(q || "").trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return {
    commentId: String(o.commentId || commentId || "").trim() || commentId,
    classification,
    reason: String(o.reason || "").trim() || "Análise concluída.",
    assistantResponse:
      o.assistantResponse != null ? String(o.assistantResponse).trim() : "",
    requiresNewPlan: Boolean(o.requiresNewPlan),
    requiresQuestions: Boolean(o.requiresQuestions),
    suggestedQuestions,
    planChangeSummary:
      o.planChangeSummary != null ? String(o.planChangeSummary).trim() : "",
    analyzedAt:
      typeof o.analyzedAt === "string" && o.analyzedAt
        ? o.analyzedAt
        : new Date().toISOString(),
    mode: o.mode === "llm" ? "llm" : "heuristic",
  };
}

/**
 * @param {unknown} raw
 * @param {string} commentId
 */
function normalizeAdditionalQuestionsDoc(raw, commentId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const questionsRaw = Array.isArray(o.questions) ? o.questions : [];
  /** @type {Array<{ id: string, text: string }>} */
  const questions = [];
  for (let i = 0; i < questionsRaw.length; i++) {
    const q = questionsRaw[i];
    if (!q || typeof q !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (q);
    const text = String(row.text || "").trim();
    if (!text) continue;
    const id =
      String(row.id || "").trim() ||
      `q-${commentId}-${i + 1}`;
    questions.push({ id, text });
  }
  if (!questions.length) return null;
  return {
    commentId: String(o.commentId || commentId || "").trim() || commentId,
    createdAt:
      typeof o.createdAt === "string" && o.createdAt
        ? o.createdAt
        : new Date().toISOString(),
    questions: questions.slice(0, 8),
  };
}

/**
 * @param {unknown} raw
 * @param {string} commentId
 */
function normalizeAdditionalAnswersDoc(raw, commentId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const answersRaw = Array.isArray(o.answers) ? o.answers : [];
  /** @type {Array<{ questionId: string, question: string, answer: string }>} */
  const answers = [];
  for (const a of answersRaw) {
    if (!a || typeof a !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (a);
    const answer = String(row.answer || "").trim();
    if (!answer) continue;
    answers.push({
      questionId: String(row.questionId || "").trim() || `q-${answers.length + 1}`,
      question: String(row.question || "").trim(),
      answer,
    });
  }
  if (!answers.length) return null;
  return {
    commentId: String(o.commentId || commentId || "").trim() || commentId,
    submittedAt:
      typeof o.submittedAt === "string" && o.submittedAt
        ? o.submittedAt
        : new Date().toISOString(),
    answers: answers.slice(0, 12),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeOperationalPlanPresentation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const asStrings = (v) =>
    Array.isArray(v)
      ? v.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
  const understanding =
    o.understanding && typeof o.understanding === "object"
      ? /** @type {Record<string, unknown>} */ (o.understanding)
      : {};
  const executionStrategy =
    o.executionStrategy && typeof o.executionStrategy === "object"
      ? /** @type {Record<string, unknown>} */ (o.executionStrategy)
      : {};
  const complexity =
    o.complexity && typeof o.complexity === "object"
      ? /** @type {Record<string, unknown>} */ (o.complexity)
      : {};
  const executionRecommendation =
    o.executionRecommendation && typeof o.executionRecommendation === "object"
      ? /** @type {Record<string, unknown>} */ (o.executionRecommendation)
      : {};
  const miniTasks =
    o.miniTasks && typeof o.miniTasks === "object"
      ? /** @type {Record<string, unknown>} */ (o.miniTasks)
      : {};
  const level =
    complexity.level === "low" ||
    complexity.level === "medium" ||
    complexity.level === "high"
      ? complexity.level
      : "medium";
  const recLevel =
    executionRecommendation.recommendedLevel === "low" ||
    executionRecommendation.recommendedLevel === "normal" ||
    executionRecommendation.recommendedLevel === "high"
      ? executionRecommendation.recommendedLevel
      : "normal";
  const risksRaw = Array.isArray(o.risks) ? o.risks : [];
  const risks = risksRaw
    .map((r, i) => {
      if (typeof r === "string") {
        const label = r.trim();
        if (!label) return null;
        return {
          id: `risk-${i}`,
          label,
          level: "medium",
          levelLabelPt: "Médio",
        };
      }
      if (!r || typeof r !== "object") return null;
      const row = /** @type {Record<string, unknown>} */ (r);
      const label = String(row.label || "").trim();
      if (!label) return null;
      const rl =
        row.level === "low" || row.level === "high" ? row.level : "medium";
      return {
        id: String(row.id || `risk-${i}`),
        label,
        level: rl,
        levelLabelPt:
          rl === "low" ? "Baixo" : rl === "high" ? "Alto" : "Médio",
      };
    })
    .filter(Boolean);
  const tasksRaw = Array.isArray(miniTasks.tasks) ? miniTasks.tasks : [];
  const tasks = tasksRaw
    .map((t, i) => {
      if (!t || typeof t !== "object") return null;
      const row = /** @type {Record<string, unknown>} */ (t);
      const title = String(row.title || "").trim();
      if (!title) return null;
      return {
        id: String(row.id || `mt-${i + 1}`),
        title,
        order: Number(row.order) > 0 ? Number(row.order) : i + 1,
      };
    })
    .filter(Boolean);
  const presentation = {
    understanding: {
      summary:
        understanding.summary != null
          ? String(understanding.summary).trim() || null
          : null,
      mainObjective:
        understanding.mainObjective != null
          ? String(understanding.mainObjective).trim() || null
          : null,
    },
    whatWillBeDone: asStrings(o.whatWillBeDone),
    whatWillChange: asStrings(o.whatWillChange),
    outOfScope: asStrings(o.outOfScope),
    executionStrategy: {
      macroOrder: asStrings(executionStrategy.macroOrder),
      approach:
        executionStrategy.approach != null
          ? String(executionStrategy.approach).trim() || null
          : null,
      dependencies: asStrings(executionStrategy.dependencies),
    },
    complexity: normalizeComplexityObject({
      level,
      levelLabelPt:
        level === "low" ? "Baixa" : level === "high" ? "Alta" : "Média",
      reason:
        complexity.reason != null
          ? String(complexity.reason).trim() || null
          : null,
      explanation:
        complexity.explanation != null
          ? String(complexity.explanation).trim() || null
          : null,
    }),
    executionRecommendation: {
      recommendedLevel: recLevel,
      levelLabelPt:
        recLevel === "low"
          ? "Baixa"
          : recLevel === "high"
            ? "Alta"
            : "Normal",
      explanation:
        executionRecommendation.explanation != null
          ? String(executionRecommendation.explanation).trim() || null
          : null,
    },
    miniTasks: {
      mode: "direct",
      directLabelPt:
        String(miniTasks.directLabelPt || "").trim() ||
        "Execução direta num único passo",
      tasks,
    },
    risks,
    completionCriteria: asStrings(o.completionCriteria),
    hasContent: Boolean(o.hasContent),
  };
  presentation.miniTasks.mode = tasks.length > 0 ? "divided" : "direct";
  if (!presentation.hasContent) {
    presentation.hasContent = Boolean(
      presentation.understanding.summary ||
        presentation.understanding.mainObjective ||
        presentation.whatWillBeDone.length ||
        presentation.whatWillChange.length ||
        presentation.completionCriteria.length,
    );
  }
  return presentation;
}

/**
 * @param {unknown} raw
 * @param {string} commentId
 */
function normalizeUpdatedPlanDoc(raw, commentId) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const presentation = sanitizeUpdatedPlanPresentation(
    normalizeOperationalPlanPresentation(o.presentation),
  );
  if (!presentation) return null;
  const planVersion = Number(o.planVersion);
  const inputSchema = Number(o.schemaVersion);
  const needsSchemaMigration =
    !Number.isFinite(inputSchema) ||
    inputSchema < OPERATIONAL_PLAN_SCHEMA_VERSION ||
    o.canonicalized !== true;
  return {
    commentId: String(o.commentId || commentId || "").trim() || commentId,
    planVersion: planVersion > 0 ? planVersion : 2,
    schemaVersion: OPERATIONAL_PLAN_SCHEMA_VERSION,
    canonicalized: true,
    generatedAt:
      typeof o.generatedAt === "string" && o.generatedAt
        ? o.generatedAt
        : new Date().toISOString(),
    presentation,
    supersedesPlanVersion:
      Number(o.supersedesPlanVersion) > 0
        ? Number(o.supersedesPlanVersion)
        : 1,
    needsSchemaMigration,
  };
}

module.exports = {
  CLASSIFICATIONS,
  ANALYSIS_FILE,
  COMMENT_FILE,
  ADDITIONAL_QUESTIONS_FILE,
  ADDITIONAL_ANSWERS_FILE,
  UPDATED_PLAN_FILE,
  COMMENTS_ROOT,
  OPERATIONAL_PLAN_SCHEMA_VERSION,
  isClassification,
  normalizeAnalysisDoc,
  normalizeAdditionalQuestionsDoc,
  normalizeAdditionalAnswersDoc,
  normalizeOperationalPlanPresentation,
  normalizeUpdatedPlanDoc,
};
