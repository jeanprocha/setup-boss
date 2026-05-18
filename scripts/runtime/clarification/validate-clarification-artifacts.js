"use strict";

const fs = require("fs");
const path = require("path");

const { validateApprovalState, APPROVAL_STATE_FILE } = require("./approval");
const { validateTaskPlanRefinedMarkdown, PLAN_REFINED_FILE } = require("./plan-refiner");
const { QUESTIONS_FILE } = require("./question-generator");
const { ANSWERS_FILE } = require("./answers");
const {
  PHASE2_QUESTIONS_STATUS,
  PHASE2_ANSWERS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
  SESSION_FILE,
} = require("./clarification-runtime");
const { validateStrategyArtifacts } = require("../strategy-runtime/validate-strategy-artifacts");

/** @type {ReadonlySet<string>} */
const NEED_QUESTIONS = new Set([
  PHASE2_QUESTIONS_STATUS,
  PHASE2_ANSWERS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
]);

/** @type {ReadonlySet<string>} */
const NEED_ANSWERS = new Set([
  PHASE2_ANSWERS_STATUS,
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
]);

/** @type {ReadonlySet<string>} */
const NEED_PLAN_REFINED = new Set([
  PHASE2_PLAN_REFINED_STATUS,
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
]);

/** @type {ReadonlySet<string>} */
const NEED_APPROVAL_STATE = new Set([
  PHASE2_READY_FOR_EXECUTION,
  PHASE2_APPROVAL_REJECTED,
]);

/**
 * Remove comentário HTML inicial opcional (`<!-- plan-refine-meta ... -->`)
 * antes de validar o markdown com `validateTaskPlanRefinedMarkdown`.
 * @param {string} raw
 */
function stripPlanRefineMetaPreamble(raw) {
  const lines = String(raw ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "") {
      i++;
      continue;
    }
    if (t.startsWith("<!--") && t.endsWith("-->")) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n");
}

/**
 * Validação leve dos artefactos de clarificação (Fase 2) face a `run-context.json`.
 * @param {string} outputDir
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateClarificationArtifacts(outputDir) {
  /** @type {string[]} */
  const errors = [];
  const out = path.resolve(outputDir);
  const rcPath = path.join(out, "run-context.json");
  if (!fs.existsSync(rcPath)) {
    return { ok: false, errors: ["run-context.json em falta."] };
  }
  let rc;
  try {
    rc = JSON.parse(fs.readFileSync(rcPath, "utf-8"));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return { ok: false, errors: [`run-context.json inválido: ${msg}`] };
  }
  const phase2 = rc && typeof rc === "object" ? rc.phase2 : null;
  if (!phase2 || typeof phase2 !== "object") {
    errors.push("run-context.phase2 em falta.");
    return { ok: false, errors };
  }
  const st = phase2.status != null ? String(phase2.status).trim() : "";

  const sessionPath = path.join(out, SESSION_FILE);
  if (!fs.existsSync(sessionPath)) {
    errors.push(`${SESSION_FILE} em falta.`);
  } else {
    try {
      const sess = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      if (!sess || typeof sess !== "object") {
        errors.push(`${SESSION_FILE}: raiz inválida.`);
      } else if (sess.status != null && String(sess.status) !== st) {
        errors.push(
          `${SESSION_FILE}: status '${String(sess.status)}' ≠ run-context.phase2.status '${st}'.`,
        );
      }
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      errors.push(`${SESSION_FILE} ilegível: ${msg}`);
    }
  }

  if (NEED_QUESTIONS.has(st)) {
    const qp = path.join(out, QUESTIONS_FILE);
    if (!fs.existsSync(qp)) {
      errors.push(`${QUESTIONS_FILE} em falta (phase2.status=${st}).`);
    } else {
      try {
        const qj = JSON.parse(fs.readFileSync(qp, "utf-8"));
        if (!qj || typeof qj !== "object" || !Array.isArray(qj.questions)) {
          errors.push(`${QUESTIONS_FILE}: falta array 'questions'.`);
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        errors.push(`${QUESTIONS_FILE} JSON inválido: ${msg}`);
      }
    }
  }

  if (NEED_ANSWERS.has(st)) {
    const ap = path.join(out, ANSWERS_FILE);
    if (!fs.existsSync(ap)) {
      errors.push(`${ANSWERS_FILE} em falta (phase2.status=${st}).`);
    } else {
      try {
        const aj = JSON.parse(fs.readFileSync(ap, "utf-8"));
        if (!aj || typeof aj !== "object" || !Array.isArray(aj.answers)) {
          errors.push(`${ANSWERS_FILE}: falta array 'answers'.`);
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        errors.push(`${ANSWERS_FILE} JSON inválido: ${msg}`);
      }
    }
  }

  if (NEED_PLAN_REFINED.has(st)) {
    const pp = path.join(out, PLAN_REFINED_FILE);
    if (!fs.existsSync(pp)) {
      errors.push(`${PLAN_REFINED_FILE} em falta (phase2.status=${st}).`);
    } else {
      const body = stripPlanRefineMetaPreamble(fs.readFileSync(pp, "utf-8"));
      const v = validateTaskPlanRefinedMarkdown(body);
      if (!v.ok) {
        errors.push(`${PLAN_REFINED_FILE}: ${v.errors.join(" ")}`);
      }
    }
  }

  if (NEED_APPROVAL_STATE.has(st)) {
    const appr = path.join(out, APPROVAL_STATE_FILE);
    if (!fs.existsSync(appr)) {
      errors.push(`${APPROVAL_STATE_FILE} em falta (phase2.status=${st}).`);
    } else {
      try {
        const doc = JSON.parse(fs.readFileSync(appr, "utf-8"));
        const va = validateApprovalState(doc);
        if (!va.ok) {
          errors.push(`${APPROVAL_STATE_FILE}: ${va.errors.join(" ")}`);
        }
        if (st === PHASE2_READY_FOR_EXECUTION && String(doc.status) !== "approved") {
          errors.push(`${APPROVAL_STATE_FILE}: esperado status 'approved' para ready_for_execution.`);
        }
        if (st === PHASE2_APPROVAL_REJECTED && String(doc.status) !== "rejected") {
          errors.push(`${APPROVAL_STATE_FILE}: esperado status 'rejected' para approval_rejected.`);
        }
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        errors.push(`${APPROVAL_STATE_FILE} ilegível: ${msg}`);
      }
    }
  }

  if (st === PHASE2_READY_FOR_EXECUTION) {
    const p3 = rc.phase3;
    if (!p3 || typeof p3 !== "object" || String(p3.status || "") !== "strategy_runtime_initialized") {
      errors.push(
        "run-context.phase3.status em falta ou diferente de 'strategy_runtime_initialized' (MVP Fase 3 — strategy runtime).",
      );
    }
    const vs = validateStrategyArtifacts(out);
    if (!vs.ok) {
      for (const e of vs.errors) {
        errors.push(e);
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

module.exports = { validateClarificationArtifacts };
