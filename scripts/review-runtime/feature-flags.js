/**
 * SETUP_BOSS_REVIEW_ENGINE=off|structural|full (Fase 4.4).
 * `off`: apenas review legado (LLM em review.js).
 * `structural`: motor determinístico; sem camada semântica heurística estendida.
 * `full`: structural + semantic layer (heurísticas determinísticas; não bloqueia executor).
 */

function getReviewEngineMode() {
  const raw = process.env.SETUP_BOSS_REVIEW_ENGINE;
  if (!raw || typeof raw !== "string") return "off";
  const x = String(raw).trim().toLowerCase();
  if (x === "structural" || x === "structure") return "structural";
  if (x === "full" || x === "all") return "full";
  return "off";
}

function isDeterministicReviewEnabled() {
  const m = getReviewEngineMode();
  return m === "structural" || m === "full";
}

/**
 * Semantic propagation → review-runtime (Fase 4.8.6). Report-only / shadow.
 * SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION=off | shadow (default off).
 *
 * @returns {'off'|'shadow'}
 */
function getSemanticReviewPropagationModeFromEnv() {
  const raw = process.env.SETUP_BOSS_REVIEW_SEMANTIC_PROPAGATION;
  if (raw === undefined || raw === null || String(raw).trim() === "") return "off";
  const v = String(raw).trim().toLowerCase();
  if (v === "shadow") return "shadow";
  return "off";
}

module.exports = {
  getReviewEngineMode,
  isDeterministicReviewEnabled,
  getSemanticReviewPropagationModeFromEnv,
};
