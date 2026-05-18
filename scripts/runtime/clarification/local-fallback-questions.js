"use strict";

const fs = require("fs");
const path = require("path");
const {
  QUESTIONS_FILE,
  validateClarificationQuestions,
} = require("./question-generator");

const SESSION_FILE = "clarification-session.json";
const PHASE2_QUESTIONS_STATUS = "questions_generated";

const LOCAL_FALLBACK_REASON = "skip_llm_needs_context_without_questions";

const PROMPTS_PT = [
  "Qual é o objetivo final desta atividade?",
  "Qual parte deve ser feita primeiro?",
  "Quais arquivos, telas ou módulos provavelmente estão envolvidos?",
  "O que está fora do escopo por enquanto?",
  "Qual critério mínimo define que esta etapa foi concluída com sucesso?",
];

function buildQuestions() {
  return PROMPTS_PT.map((prompt, i) => ({
    id: `local_fallback_q${i + 1}`,
    prompt,
    type: "free_text",
    blocking: true,
  }));
}

function buildLocalFallbackQuestionsDocument() {
  const generatedAt = new Date().toISOString();
  return {
    schema_version: "1.0.0",
    generated_at: generatedAt,
    round: 1,
    source: "local_fallback",
    reason: LOCAL_FALLBACK_REASON,
    heuristic: true,
    questions: buildQuestions(),
    recommendations: [],
  };
}

/**
 * Persiste clarification-questions.json determinístico e alinha session + run-context (fase questions_generated).
 *
 * @param {{ outputDirAbs: string, runId: string }} p
 * @returns {{ ok: true, questionsCount: number, questionsPath: string, artifacts: string[] } | { ok: false, error: { code: string, message: string } }}
 */
function persistLocalFallbackClarificationQuestions(p) {
  const outputDirAbs = path.resolve(p.outputDirAbs);
  const runId = String(p.runId || "").trim();
  const doc = buildLocalFallbackQuestionsDocument();

  const validated = validateClarificationQuestions(doc);
  if (!validated.ok) {
    const msg =
      validated.errors && validated.errors.length
        ? validated.errors.join("; ")
        : "validação falhou";
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_VALIDATION", message: msg },
    };
  }

  const qPath = path.join(outputDirAbs, QUESTIONS_FILE);
  try {
    fs.writeFileSync(qPath, JSON.stringify(doc, null, 2), "utf-8");
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_WRITE", message: msg },
    };
  }

  const sessionPath = path.join(outputDirAbs, SESSION_FILE);
  let session;
  try {
    session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_SESSION_READ", message: msg },
    };
  }

  const roundEntry = {
    round: 1,
    status: "questions_generated",
    questions_artifact: QUESTIONS_FILE,
  };
  const rounds = Array.isArray(session.rounds) ? session.rounds.slice() : [];
  const existingIdx = rounds.findIndex((r) => r && Number(r.round) === 1);
  if (existingIdx >= 0) {
    rounds[existingIdx] = { ...rounds[existingIdx], ...roundEntry };
  } else {
    rounds.push(roundEntry);
  }

  const nextSession = {
    ...session,
    status: PHASE2_QUESTIONS_STATUS,
    current_round: 1,
    rounds,
  };
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(nextSession, null, 2), "utf-8");
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_SESSION_WRITE", message: msg },
    };
  }

  let runContext;
  try {
    runContext = JSON.parse(
      fs.readFileSync(path.join(outputDirAbs, "run-context.json"), "utf-8"),
    );
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_RUN_CONTEXT_READ", message: msg },
    };
  }

  const phase2Prev = runContext.phase2 || {};
  const prevArtifacts = Array.isArray(phase2Prev.artifacts)
    ? phase2Prev.artifacts.slice()
    : [];
  if (!prevArtifacts.includes(QUESTIONS_FILE)) {
    prevArtifacts.push(QUESTIONS_FILE);
  }

  const nextPhase2 = {
    ...phase2Prev,
    schema_version: phase2Prev.schema_version || "1.0.0",
    status: PHASE2_QUESTIONS_STATUS,
    current_round: 1,
    started_at:
      phase2Prev.started_at != null
        ? String(phase2Prev.started_at)
        : new Date().toISOString(),
    artifacts: prevArtifacts,
  };

  const nextRc = { ...runContext, phase2: nextPhase2 };
  try {
    fs.writeFileSync(
      path.join(outputDirAbs, "run-context.json"),
      JSON.stringify(nextRc, null, 2),
      "utf-8",
    );
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    return {
      ok: false,
      error: { code: "CLARIFY_LOCAL_FALLBACK_RUN_CONTEXT_WRITE", message: msg },
    };
  }

  return {
    ok: true,
    questionsCount: doc.questions.length,
    questionsPath: qPath,
    artifacts: [QUESTIONS_FILE, SESSION_FILE, "run-context.json"],
  };
}

module.exports = {
  LOCAL_FALLBACK_REASON,
  buildLocalFallbackQuestionsDocument,
  persistLocalFallbackClarificationQuestions,
};
