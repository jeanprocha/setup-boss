/**
 * @typedef {{
 * patch_index:number,
 * path:string,
 * node_kind:string|null,
 * node_path_hint:string|null,
 * deterministic_selector?: object|null,
 * selector_fingerprint?: string|null,
 * confidence:number,
 * bounds_mode?: string|null,
 * }} HintRowLike
 */

/**
 * Hint shadow-only compatível com Fase 4.9 roadmap (apply desactivado).
 * @param {{
 * patch_index: number,
 * path: string,
 * node_kind: string|null,
 * node_path_hint: string|null,
 * deterministic_selector: object|null,
 * selector_fingerprint: string|null,
 * confidence_score: number,
 * bounds_mode: string|null,
 * }} o
 */
function buildStructuralPatchHint(o) {
  const {
    patch_index,
    path,
    node_kind,
    node_path_hint,
    deterministic_selector,
    selector_fingerprint,
    confidence_score,
    bounds_mode,
  } = o;

  /** @type {Record<string, unknown>} */
  const hint = {
    patch_index,
    path: String(path || ""),
    structural_hint_shadow: true,
    node_kind,
    node_path_hint,
    transform_op_shadow: null,
    notes: ["Fase 4.9.2 shadow — sem apply estrutural; só hint para futuro Hybrid Executor"],
  };

  if (deterministic_selector) hint.deterministic_selector = deterministic_selector;
  if (selector_fingerprint) hint.selector_fingerprint = selector_fingerprint;
  hint.confidence_score = confidence_score;
  if (bounds_mode) hint.bounds_mode_detail = bounds_mode;

  return hint;
}

module.exports = { buildStructuralPatchHint };
