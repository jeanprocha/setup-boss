/**
 * Confidence 0–100 para mapeamento search textual → candidato MVP (somente relatório shadow).
 */

const MVP_KINDS_PRIORITY = /** @type {Record<string, number>} */ ({
  ImportDeclaration: 92,
  ExportNamedDeclaration: 90,
  VariableDeclaration: 88,
  FunctionDeclaration: 86,
  ClassDeclaration: 84,
});

function clampScore(n) {
  return Math.min(100, Math.max(0, Math.round(Number(n))));
}

/**
 * @param {{
 * candidate_count: number,
 * overlapping_count: number,
 * picks_smallest_span: boolean,
 * search_fully_inside_node: boolean,
 * bounds_mode: string|null,
 * top_kind: string|null,
 * }} input
 */
function scoreStructuralConfidence(input) {
  const {
    candidate_count = 0,
    overlapping_count = 0,
    picks_smallest_span = false,
    search_fully_inside_node = false,
    bounds_mode = null,
    top_kind,
  } = input;

  const factors = {
    candidate_count,
    overlapping_count,
    picks_smallest_span,
    search_fully_inside_node,
    bounds_mode,
    top_kind,
  };

  if (candidate_count === 0) {
    return { score: 0, factors: { ...factors, reason: "no_mvp_overlap" } };
  }

  const base = typeof top_kind === "string" ? MVP_KINDS_PRIORITY[top_kind] ?? 60 : 60;

  let score = Math.round(base * 0.7);

  if (overlapping_count === 1) score += 18;
  else if (overlapping_count <= 3) score += 8;
  else score -= 10;

  if (candidate_count >= 8) score -= 12;

  if (picks_smallest_span) score += 6;

  if (search_fully_inside_node) score += 8;

  if (bounds_mode === "literal") score += 4;
  else if (bounds_mode === "normalized") score += 2;

  factors.kind_base_rank = base;
  return { score: clampScore(score), factors };
}

module.exports = {
  scoreStructuralConfidence,
};
