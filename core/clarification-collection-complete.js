"use strict";

/** Fases em que a coleta (perguntas/respostas) já terminou — alinhado ao frontend. */
const COLLECTION_COMPLETE_PHASES = new Set([
  "refining",
  "refinement_ready",
  "awaiting_approval",
  "approved",
  "rejected",
  "ready_for_execution",
  "strategy_pending",
]);

/**
 * @param {string|null|undefined} runtimePhase
 * @param {{ refinementAvailable?: boolean, pendingBlockingCount?: number, questionsCount?: number, answersCount?: number }} [opts]
 */
function isClarificationCollectionCompletePhase(runtimePhase, opts = {}) {
  if (opts.refinementAvailable) return true;
  if (runtimePhase && COLLECTION_COMPLETE_PHASES.has(runtimePhase)) return true;
  const qc = Number(opts.questionsCount) || 0;
  const ac = Number(opts.answersCount) || 0;
  const pending = Number(opts.pendingBlockingCount) || 0;
  if (qc > 0 && pending === 0 && ac >= qc) return true;
  return false;
}

module.exports = {
  isClarificationCollectionCompletePhase,
  COLLECTION_COMPLETE_PHASES,
};
