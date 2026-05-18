"use strict";

const fs = require("fs");
const path = require("path");

const { QUESTIONS_FILE } = require("./question-generator");

const ANSWERS_FILE = "clarification-answers.json";

/**
 * @param {string} outputDir
 * @returns {{ ok: true, doc: object } | { ok: false, error: { code: string, message: string } }}
 */
function loadClarificationQuestions(outputDir) {
  const fp = path.join(path.resolve(outputDir), QUESTIONS_FILE);
  if (!fs.existsSync(fp)) {
    return {
      ok: false,
      error: {
        code: "CLARIFY_ANSWERS_QUESTIONS_MISSING",
        message: `${QUESTIONS_FILE} em falta; gere perguntas antes de gravar respostas.`,
      },
    };
  }
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.questions)) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_QUESTIONS_INVALID",
          message: `${QUESTIONS_FILE} inválido: falta array 'questions'.`,
        },
      };
    }
    return { ok: true, doc };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: {
        code: "CLARIFY_ANSWERS_QUESTIONS_READ",
        message: msg,
      },
    };
  }
}

/**
 * @param {{
 *   answersPath?: string|null,
 *   answerPairs?: { question_id: string, value: string }[],
 *   cwd?: string,
 * }} input
 * @returns {{ ok: true, payload: { answers: object[] } } | { ok: false, error: { code: string, message: string } }}
 */
function parseAnswersInput(input) {
  const cwd = path.resolve(input.cwd || process.cwd());
  const pairs = Array.isArray(input.answerPairs) ? input.answerPairs.slice() : [];
  const seenPair = new Set();
  for (const p of pairs) {
    const id = p && p.question_id != null ? String(p.question_id).trim() : "";
    if (!id) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_PAIR_EMPTY_ID",
          message: "Entrada --answer com question_id vazio.",
        },
      };
    }
    if (seenPair.has(id)) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_DUPLICATE_ID",
          message: `question_id duplicado nos argumentos: ${id}`,
        },
      };
    }
    seenPair.add(id);
  }

  /** @type {object[]} */
  let fromFile = [];
  const ap = input.answersPath != null ? String(input.answersPath).trim() : "";
  if (ap) {
    const resolved = path.isAbsolute(ap) ? path.normalize(ap) : path.resolve(cwd, ap);
    if (!fs.existsSync(resolved)) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_FILE_NOT_FOUND",
          message: `Ficheiro de respostas não encontrado: ${resolved}`,
        },
      };
    }
    let rawDoc;
    try {
      rawDoc = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    } catch (e) {
      const msg = e && e.message ? String(e.message) : String(e);
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_FILE_JSON",
          message: `JSON inválido no ficheiro de respostas: ${msg}`,
        },
      };
    }
    if (!rawDoc || typeof rawDoc !== "object" || !Array.isArray(rawDoc.answers)) {
      return {
        ok: false,
        error: {
          code: "CLARIFY_ANSWERS_FILE_SHAPE",
          message: "O ficheiro de respostas deve ter um objeto com array 'answers'.",
        },
      };
    }
    const seenFile = new Set();
    for (let i = 0; i < rawDoc.answers.length; i++) {
      const row = rawDoc.answers[i];
      const qid =
        row && row.question_id != null ? String(row.question_id).trim() : "";
      if (!qid) {
        return {
          ok: false,
          error: {
            code: "CLARIFY_ANSWERS_FILE_EMPTY_ID",
            message: `answers[${i}]: question_id obrigatório.`,
          },
        };
      }
      if (seenFile.has(qid)) {
        return {
          ok: false,
          error: {
            code: "CLARIFY_ANSWERS_DUPLICATE_ID",
            message: `question_id duplicado no ficheiro: ${qid}`,
          },
        };
      }
      seenFile.add(qid);
      fromFile.push({
        question_id: qid,
        value: row.value,
        source:
          row.source != null && String(row.source).trim() !== ""
            ? String(row.source).trim()
            : "user",
      });
    }
  }

  const merged = new Map();
  for (const row of fromFile) {
    merged.set(String(row.question_id).trim(), row);
  }
  for (const p of pairs) {
    merged.set(String(p.question_id).trim(), {
      question_id: String(p.question_id).trim(),
      value: p.value,
      source: "user",
    });
  }

  return {
    ok: true,
    payload: { answers: Array.from(merged.values()) },
  };
}

/**
 * @param {string} s
 */
function parseConfirmString(s) {
  const t = String(s || "").trim().toLowerCase();
  if (t === "yes" || t === "sim" || t === "true" || t === "1" || t === "y") {
    return { ok: true, value: true };
  }
  if (t === "no" || t === "não" || t === "nao" || t === "false" || t === "0" || t === "n") {
    return { ok: true, value: false };
  }
  return { ok: false };
}

/**
 * @param {object[]} questions
 * @param {Map<string, unknown>} valueById
 */
function countPendingBlocking(questions, valueById) {
  let n = 0;
  for (const q of questions) {
    if (!q || typeof q !== "object") continue;
    if (q.blocking !== true) continue;
    const id = q.id != null ? String(q.id).trim() : "";
    if (!id) continue;
    if (!valueById.has(id)) {
      n++;
      continue;
    }
    const v = valueById.get(id);
    if (v === undefined || v === null) {
      n++;
      continue;
    }
    if (typeof v === "string" && v.trim() === "") {
      n++;
    }
  }
  return n;
}

/**
 * @param {{ questions: object[] }} questionsPayload
 * @param {{ answers: object[] }} answersPayload
 * @returns {{ ok: true, normalized: object[] } | { ok: false, errors: string[], pendingBlocking: number }}
 */
function validateClarificationAnswers(questionsPayload, answersPayload) {
  const questions = Array.isArray(questionsPayload.questions)
    ? questionsPayload.questions
    : [];
  const qById = new Map();
  for (const q of questions) {
    if (!q || typeof q !== "object") continue;
    const id = q.id != null ? String(q.id).trim() : "";
    if (id) qById.set(id, q);
  }

  const answers = Array.isArray(answersPayload.answers)
    ? answersPayload.answers
    : [];
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();

  /** @type {Map<string, unknown>} */
  const validValueById = new Map();

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const prefix = `answers[${i}]`;
    if (!a || typeof a !== "object") {
      errors.push(`${prefix}: entrada inválida.`);
      continue;
    }
    const qid = a.question_id != null ? String(a.question_id).trim() : "";
    if (!qid) {
      errors.push(`${prefix}: question_id obrigatório.`);
      continue;
    }
    if (seen.has(qid)) {
      errors.push(`${prefix}: question_id duplicado '${qid}'.`);
      continue;
    }
    seen.add(qid);

    if (!qById.has(qid)) {
      errors.push(`${prefix}: question_id desconhecido '${qid}'.`);
      continue;
    }

    const q = qById.get(qid);
    const typ = q.type != null ? String(q.type) : "";
    let normalizedVal = null;
    let typeOk = false;

    if (typ === "free_text") {
      if (typeof a.value !== "string" || a.value.trim() === "") {
        errors.push(`${prefix}: free_text exige string não vazia.`);
      } else {
        normalizedVal = a.value.trim();
        typeOk = true;
      }
    } else if (typ === "single_choice") {
      const opts = Array.isArray(q.options) ? q.options : [];
      const norm = opts.map((o) => String(o).trim());
      const valStr =
        a.value === undefined || a.value === null
          ? ""
          : String(a.value).trim();
      if (!norm.some((o) => o === valStr)) {
        errors.push(
          `${prefix}: valor deve ser uma das opções: ${norm.join(", ")}.`,
        );
      } else {
        normalizedVal = valStr;
        typeOk = true;
      }
    } else if (typ === "confirm") {
      if (typeof a.value === "boolean") {
        normalizedVal = a.value;
        typeOk = true;
      } else if (typeof a.value === "string") {
        const pr = parseConfirmString(a.value);
        if (!pr.ok) {
          errors.push(
            `${prefix}: confirm espera boolean ou yes/no/sim/não/true/false.`,
          );
        } else {
          normalizedVal = pr.value;
          typeOk = true;
        }
      } else {
        errors.push(
          `${prefix}: confirm espera boolean ou yes/no/sim/não/true/false.`,
        );
      }
    } else {
      errors.push(`${prefix}: tipo de pergunta desconhecido: ${typ}.`);
    }

    if (typeOk) {
      validValueById.set(qid, normalizedVal);
    }
  }

  for (const q of questions) {
    if (!q || q.blocking !== true) continue;
    const id = q.id != null ? String(q.id).trim() : "";
    if (!id) continue;
    if (!validValueById.has(id)) {
      errors.push(`Pergunta blocking '${id}' sem resposta válida.`);
    }
  }

  const pendingBlocking = countPendingBlocking(questions, validValueById);

  if (errors.length > 0) {
    return { ok: false, errors, pendingBlocking };
  }

  /** @type {object[]} */
  const normalized = [];
  for (const a of answers) {
    const qid = String(a.question_id).trim();
    const v = validValueById.get(qid);
    normalized.push({
      question_id: qid,
      value: v,
      source:
        a.source != null && String(a.source).trim() !== ""
          ? String(a.source).trim()
          : "user",
    });
  }

  return { ok: true, normalized };
}

/**
 * @param {{
 *   round: number,
 *   normalizedAnswers: object[],
 * }} p
 * @returns {object}
 */
function buildClarificationAnswersArtifact(p) {
  return {
    schema_version: "1.0.0",
    answered_at: new Date().toISOString(),
    round: Number(p.round) || 1,
    answers: p.normalizedAnswers.slice(),
  };
}

/**
 * @param {string} outputDir
 * @returns {{ ok: true, doc: object, count: number } | { ok: false }}
 */
function loadExistingAnswersDoc(outputDir) {
  const fp = path.join(path.resolve(outputDir), ANSWERS_FILE);
  if (!fs.existsSync(fp)) {
    return { ok: false };
  }
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const n = Array.isArray(doc.answers) ? doc.answers.length : 0;
    return { ok: true, doc, count: n };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  ANSWERS_FILE,
  loadClarificationQuestions,
  parseAnswersInput,
  validateClarificationAnswers,
  buildClarificationAnswersArtifact,
  countPendingBlocking,
  loadExistingAnswersDoc,
};
