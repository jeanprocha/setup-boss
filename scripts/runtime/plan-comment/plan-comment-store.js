"use strict";

const fs = require("fs");
const path = require("path");
const {
  ANALYSIS_FILE,
  COMMENT_FILE,
  ADDITIONAL_QUESTIONS_FILE,
  ADDITIONAL_ANSWERS_FILE,
  UPDATED_PLAN_FILE,
  COMMENTS_ROOT,
  normalizeAnalysisDoc,
  normalizeAdditionalQuestionsDoc,
  normalizeAdditionalAnswersDoc,
  normalizeUpdatedPlanDoc,
} = require("./plan-comment-analysis-schema.js");
const { updatedPlanDocIsStale } = require("../../../core/operational-plan-staleness.js");

/**
 * @param {string} outputDir
 */
function commentsRoot(outputDir) {
  return path.join(path.resolve(String(outputDir || "")), COMMENTS_ROOT);
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function commentDir(outputDir, commentId) {
  const id = String(commentId || "").trim();
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error("commentId inválido");
  }
  return path.join(commentsRoot(outputDir), id);
}

/**
 * @param {string} outputDir
 * @param {{ id: string, text: string, createdAt?: string }} comment
 */
function writePlanComment(outputDir, comment) {
  const dir = commentDir(outputDir, comment.id);
  fs.mkdirSync(dir, { recursive: true });
  const doc = {
    id: comment.id,
    text: String(comment.text || "").trim(),
    createdAt: comment.createdAt || new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(dir, COMMENT_FILE),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
  return doc;
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 * @param {object} analysis
 */
/**
 * @param {string} outputDir
 * @param {string} commentId
 * @param {{ questions: Array<{ id?: string, text: string }> }} doc
 */
function writeAdditionalQuestions(outputDir, commentId, doc) {
  const dir = commentDir(outputDir, commentId);
  fs.mkdirSync(dir, { recursive: true });
  const questions = (doc.questions || [])
    .map((q, i) => ({
      id: String(q.id || `q-${commentId}-${i + 1}`).trim(),
      text: String(q.text || "").trim(),
    }))
    .filter((q) => q.text);
  const payload = {
    commentId,
    createdAt: new Date().toISOString(),
    questions,
  };
  const normalized = normalizeAdditionalQuestionsDoc(payload, commentId);
  if (!normalized) throw new Error("Perguntas adicionais inválidas");
  fs.writeFileSync(
    path.join(dir, ADDITIONAL_QUESTIONS_FILE),
    JSON.stringify(normalized, null, 2),
    "utf-8",
  );
  return normalized;
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function readAdditionalQuestions(outputDir, commentId) {
  const fp = path.join(commentDir(outputDir, commentId), ADDITIONAL_QUESTIONS_FILE);
  if (!fs.existsSync(fp)) return null;
  try {
    return normalizeAdditionalQuestionsDoc(
      JSON.parse(fs.readFileSync(fp, "utf-8")),
      commentId,
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 * @param {{ answers: Array<{ questionId: string, question: string, answer: string }> }} doc
 */
function writeAdditionalAnswers(outputDir, commentId, doc) {
  const dir = commentDir(outputDir, commentId);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    commentId,
    submittedAt: new Date().toISOString(),
    answers: (doc.answers || [])
      .map((a) => ({
        questionId: String(a.questionId || "").trim(),
        question: String(a.question || "").trim(),
        answer: String(a.answer || "").trim(),
      }))
      .filter((a) => a.answer),
  };
  const normalized = normalizeAdditionalAnswersDoc(payload, commentId);
  if (!normalized) throw new Error("Respostas adicionais inválidas");
  fs.writeFileSync(
    path.join(dir, ADDITIONAL_ANSWERS_FILE),
    JSON.stringify(normalized, null, 2),
    "utf-8",
  );
  return normalized;
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function readAdditionalAnswers(outputDir, commentId) {
  const fp = path.join(commentDir(outputDir, commentId), ADDITIONAL_ANSWERS_FILE);
  if (!fs.existsSync(fp)) return null;
  try {
    return normalizeAdditionalAnswersDoc(
      JSON.parse(fs.readFileSync(fp, "utf-8")),
      commentId,
    );
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 * @param {object} doc
 */
function writeUpdatedPlan(outputDir, commentId, doc) {
  const dir = commentDir(outputDir, commentId);
  fs.mkdirSync(dir, { recursive: true });
  const normalized = normalizeUpdatedPlanDoc(
    { ...doc, commentId },
    commentId,
  );
  if (!normalized) throw new Error("Plano atualizado inválido");
  const { needsSchemaMigration: _m, ...payload } = normalized;
  fs.writeFileSync(
    path.join(dir, UPDATED_PLAN_FILE),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
  return payload;
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function readUpdatedPlanRaw(outputDir, commentId) {
  const fp = path.join(commentDir(outputDir, commentId), UPDATED_PLAN_FILE);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const normalized = normalizeUpdatedPlanDoc(raw, commentId);
    if (!normalized) return null;
    return { raw, normalized };
  } catch {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function tryRepairStaleUpdatedPlan(outputDir, commentId) {
  const commentPath = path.join(commentDir(outputDir, commentId), COMMENT_FILE);
  const analysisPath = path.join(commentDir(outputDir, commentId), ANALYSIS_FILE);
  if (!fs.existsSync(commentPath) || !fs.existsSync(analysisPath)) return null;

  let comment = null;
  let analysis = null;
  try {
    comment = JSON.parse(fs.readFileSync(commentPath, "utf-8"));
    analysis = normalizeAnalysisDoc(
      JSON.parse(fs.readFileSync(analysisPath, "utf-8")),
      commentId,
    );
  } catch {
    return null;
  }

  if (!comment?.text || !analysis?.requiresNewPlan || analysis.requiresQuestions) {
    return null;
  }

  const { regenerateStaleUpdatedPlanForComment } = require("./generate-updated-plan.js");
  const result = regenerateStaleUpdatedPlanForComment({
    outputDir,
    commentId,
    commentText: String(comment.text),
    analysis,
  });
  return result.ok ? result.updatedPlan : null;
}

/**
 * @param {string} outputDir
 * @param {string} commentId
 */
function readUpdatedPlan(outputDir, commentId) {
  const file = readUpdatedPlanRaw(outputDir, commentId);
  if (!file) return null;

  const { raw, normalized } = file;
  const {
    loadBasePlanPresentation,
  } = require("../../../core/load-base-plan-presentation.js");
  const base = loadBasePlanPresentation(outputDir, commentId);

  const stale = updatedPlanDocIsStale(
    {
      ...normalized,
      schemaVersion: raw.schemaVersion,
      canonicalized: raw.canonicalized,
    },
    base,
  );

  if (stale) {
    const repaired = tryRepairStaleUpdatedPlan(outputDir, commentId);
    if (repaired) return repaired;
  }

  if (normalized.needsSchemaMigration) {
    return writeUpdatedPlan(outputDir, commentId, normalized);
  }

  const { needsSchemaMigration: _m, ...payload } = normalized;
  return payload;
}

function writePlanCommentAnalysis(outputDir, commentId, analysis) {
  const dir = commentDir(outputDir, commentId);
  fs.mkdirSync(dir, { recursive: true });
  const doc = normalizeAnalysisDoc(
    { ...analysis, commentId },
    commentId,
  );
  if (!doc) throw new Error("Análise inválida");
  fs.writeFileSync(
    path.join(dir, ANALYSIS_FILE),
    JSON.stringify(doc, null, 2),
    "utf-8",
  );
  return doc;
}

/**
 * @param {string} outputDir
 */
function listPlanCommentThreads(outputDir) {
  const root = commentsRoot(outputDir);
  if (!fs.existsSync(root)) return [];
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  /** @type {Array<{
   *   comment: object,
   *   analysis: object|null,
   *   additionalQuestions: object|null,
   *   additionalAnswers: object|null,
   *   updatedPlan: object|null,
   * }>} */
  const threads = [];

  for (const id of entries) {
    const dir = path.join(root, id);
    const commentPath = path.join(dir, COMMENT_FILE);
    const analysisPath = path.join(dir, ANALYSIS_FILE);
    let comment = null;
    let analysis = null;
    let additionalQuestions = null;
    let additionalAnswers = null;
    let updatedPlan = null;
    try {
      if (fs.existsSync(commentPath)) {
        comment = JSON.parse(fs.readFileSync(commentPath, "utf-8"));
      }
    } catch {
      comment = null;
    }
    try {
      if (fs.existsSync(analysisPath)) {
        analysis = normalizeAnalysisDoc(
          JSON.parse(fs.readFileSync(analysisPath, "utf-8")),
          id,
        );
      }
    } catch {
      analysis = null;
    }
    try {
      additionalQuestions = readAdditionalQuestions(outputDir, id);
    } catch {
      additionalQuestions = null;
    }
    try {
      additionalAnswers = readAdditionalAnswers(outputDir, id);
    } catch {
      additionalAnswers = null;
    }
    try {
      updatedPlan = readUpdatedPlan(outputDir, id);
    } catch {
      updatedPlan = null;
    }
    if (comment && comment.id) {
      threads.push({
        comment,
        analysis,
        additionalQuestions,
        additionalAnswers,
        updatedPlan,
      });
    }
  }

  threads.sort((a, b) => {
    const ta = String(a.comment.createdAt || "");
    const tb = String(b.comment.createdAt || "");
    return ta.localeCompare(tb);
  });

  return threads;
}

/**
 * @param {string} outputDir
 * @param {string} [excludeCommentId]
 */
function loadPlanExcerpt(outputDir, excludeCommentId) {
  const {
    loadPlanExcerptForComment,
  } = require("../../../core/load-base-plan-presentation.js");
  return loadPlanExcerptForComment(outputDir, excludeCommentId);
}

module.exports = {
  commentsRoot,
  commentDir,
  writePlanComment,
  writePlanCommentAnalysis,
  writeAdditionalQuestions,
  readAdditionalQuestions,
  writeAdditionalAnswers,
  readAdditionalAnswers,
  writeUpdatedPlan,
  readUpdatedPlanRaw,
  readUpdatedPlan,
  listPlanCommentThreads,
  loadPlanExcerpt,
  COMMENTS_ROOT,
};
