"use strict";

/**
 * Contrato UI ↔ daemon para estado da corrida após intake.
 * Evita `waiting_approval` quando a clarificação ainda não tem SPEC/refinement.
 */

/**
 * @param {string} initialState
 * @param {string|null|undefined} phase2Status
 * @param {number} questionsCount
 * @returns {"failed"|"running"|"waiting_clarification_questions"|"waiting_clarification_answers"}
 */
function deriveUiStateAfterIntake(initialState, phase2Status, questionsCount) {
  if (initialState === "failed") return "failed";
  if (initialState === "clarification_ready") return "running";
  if (initialState === "clarification_required") {
    const qc = Number(questionsCount) || 0;
    const st = String(phase2Status || "").trim();
    if (
      qc === 0 &&
      (st === "clarification_initialized" || st === "questions_generated")
    ) {
      return "waiting_clarification_questions";
    }
    if (qc > 0) return "waiting_clarification_answers";
    return "waiting_clarification_questions";
  }
  return "running";
}

/**
 * Classificação diagnóstica para testes e documentação (não substitui bundles runtime).
 * @param {{
 *   classification?: string|null,
 *   phase2Status?: string|null,
 *   questionsCount?: number|null,
 *   refinementAvailable?: boolean,
 *   executorRunning?: boolean,
 *   awaitingSpecApproval?: boolean,
 * }} input
 * @returns {"executing"|"approval"|"answering"|"empty_or_waiting_questions"|"other"}
 */
function classifyOperationalClarificationBucket(input) {
  if (input.executorRunning) return "executing";

  const refinementAvailable = Boolean(input.refinementAvailable);
  const phase2Status = String(input.phase2Status || "").trim().toLowerCase();
  const qc = Number(input.questionsCount) || 0;

  if (
    refinementAvailable &&
    (phase2Status === "plan_refined" ||
      phase2Status === "answers_recorded" ||
      input.awaitingSpecApproval)
  ) {
    return "approval";
  }

  const classification = String(input.classification || "").trim();
  if (classification === "needs_context" && qc > 0) return "answering";

  if (
    classification === "needs_context" &&
    qc === 0 &&
    (phase2Status === "clarification_initialized" ||
      phase2Status === "questions_generated")
  ) {
    return "empty_or_waiting_questions";
  }

  return "other";
}

module.exports = {
  deriveUiStateAfterIntake,
  classifyOperationalClarificationBucket,
};
