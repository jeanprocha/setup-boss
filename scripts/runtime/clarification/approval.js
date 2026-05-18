"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { QUESTIONS_FILE } = require("./question-generator");
const {
  ANSWERS_FILE,
  loadClarificationQuestions,
  validateClarificationAnswers,
} = require("./answers");

const APPROVAL_STATE_FILE = "approval-state.json";

/**
 * @param {string} filePath
 * @returns {string}
 */
function computeFileSha256(filePath) {
  const buf = fs.readFileSync(path.resolve(filePath));
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * @param {{
 *   decision: "approved"|"rejected",
 *   planRef: string,
 *   planSha256: string,
 *   notes?: string|null,
 *   operatorRecommendedMode?: string|null,
 *   createdAt?: string,
 * }} p
 * @returns {object}
 */
function buildApprovalState(p) {
  const at = p.createdAt != null ? String(p.createdAt) : new Date().toISOString();
  const approved = p.decision === "approved";
  const modeRaw =
    p.operatorRecommendedMode != null
      ? String(p.operatorRecommendedMode).trim().toLowerCase()
      : "";
  const operatorRecommendedMode =
    modeRaw === "basic" || modeRaw === "standard" || modeRaw === "expert"
      ? modeRaw
      : null;
  return {
    schema_version: "1.0.0",
    status: p.decision,
    created_at: at,
    approved_at: approved ? at : null,
    rejected_at: approved ? null : at,
    plan_ref: String(p.planRef || "").trim() || "task-plan-refined.md",
    plan_sha256: String(p.planSha256 || "").trim(),
    notes: p.notes != null ? String(p.notes) : "",
    ...(operatorRecommendedMode
      ? { operator_recommended_mode: operatorRecommendedMode }
      : {}),
  };
}

/**
 * @param {unknown} obj
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateApprovalState(obj) {
  /** @type {string[]} */
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, errors: ["Raiz deve ser um objeto."] };
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (String(o.schema_version || "") !== "1.0.0") {
    errors.push("schema_version deve ser 1.0.0.");
  }
  const st = String(o.status || "");
  if (st !== "approved" && st !== "rejected") {
    errors.push("status deve ser 'approved' ou 'rejected'.");
  }
  if (o.created_at == null || String(o.created_at).trim() === "") {
    errors.push("created_at obrigatório.");
  }
  if (st === "approved" && (o.approved_at == null || String(o.approved_at).trim() === "")) {
    errors.push("approved_at obrigatório quando status é approved.");
  }
  if (st === "rejected" && (o.rejected_at == null || String(o.rejected_at).trim() === "")) {
    errors.push("rejected_at obrigatório quando status é rejected.");
  }
  if (o.plan_ref == null || String(o.plan_ref).trim() === "") {
    errors.push("plan_ref obrigatório.");
  }
  const sha = String(o.plan_sha256 || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(sha)) {
    errors.push("plan_sha256 deve ser hex SHA-256 (64 caracteres).");
  }
  if (o.notes != null && typeof o.notes !== "string") {
    errors.push("notes deve ser string quando presente.");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

/**
 * @param {string} outputDir
 * @returns {{ ok: true, doc: object } | { ok: false }}
 */
function loadApprovalState(outputDir) {
  const fp = path.join(path.resolve(outputDir), APPROVAL_STATE_FILE);
  if (!fs.existsSync(fp)) {
    return { ok: false };
  }
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return { ok: true, doc };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {string} outputDirAbs
 * @returns {{
 *   ok: true,
 *   pendingBlockingCount: number,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 *   pendingBlockingCount?: number,
 * }}
 */
function checkApprovalReadiness(outputDirAbs) {
  const dir = path.resolve(outputDirAbs);
  const questionsPath = path.join(dir, QUESTIONS_FILE);
  let qCount = 0;
  try {
    if (fs.existsSync(questionsPath)) {
      const qj = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));
      qCount = Array.isArray(qj.questions) ? qj.questions.length : 0;
    }
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_APPROVAL_QUESTIONS_READ",
        message: msg,
      },
    };
  }

  if (qCount === 0) {
    return { ok: true, pendingBlockingCount: 0 };
  }

  const answersPath = path.join(dir, ANSWERS_FILE);
  if (!fs.existsSync(answersPath)) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_APPROVAL_ANSWERS_MISSING",
        message: `${ANSWERS_FILE} em falta; com perguntas presentes é necessário gravar respostas antes de aprovar/rejeitar.`,
      },
    };
  }

  const qLoad = loadClarificationQuestions(dir);
  if (!qLoad.ok) {
    return { ok: false, error: qLoad.error };
  }

  let answersDoc;
  try {
    answersDoc = JSON.parse(fs.readFileSync(answersPath, "utf-8"));
  } catch (e) {
    const msg = e && /** @type {Error} */ (e).message ? String(/** @type {Error} */ (e).message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_APPROVAL_ANSWERS_READ",
        message: msg,
      },
    };
  }

  const val = validateClarificationAnswers(
    { questions: qLoad.doc.questions },
    answersDoc && typeof answersDoc === "object" && Array.isArray(answersDoc.answers)
      ? { answers: answersDoc.answers }
      : { answers: [] },
  );
  if (!val.ok) {
    const pending =
      typeof val.pendingBlocking === "number" ? val.pendingBlocking : 0;
    return {
      ok: false,
      error: {
        code:
          pending > 0 ? "CLARIFY_APPROVAL_BLOCKING_PENDING" : "CLARIFY_APPROVAL_ANSWERS_INVALID",
        message: val.errors.join(" "),
      },
      pendingBlockingCount: pending,
    };
  }

  return { ok: true, pendingBlockingCount: 0 };
}

module.exports = {
  APPROVAL_STATE_FILE,
  computeFileSha256,
  buildApprovalState,
  validateApprovalState,
  loadApprovalState,
  checkApprovalReadiness,
};
