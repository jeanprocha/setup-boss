"use strict";

const {
  compareShadowTransformStrings,
  lineCounts,
  sha256HexNormalized,
  estimateLineAlterationMetrics,
  normalizedEditExtents,
} = require("./shadow-transform-compare");

/**
 * Extrai mensagens curtas por código (PT) para operadores lerem artefactos.
 * @type {Record<string,string>}
 */
const DIVERGENCE_REASON_LABEL_PT = {
  SEARCH_NON_UNIQUE_IN_FILE_LITERAL:
    "O search tem mais do que uma ocorrência literal no ficheiro (estado antes do patch) — esperado textual inseguro ou abort.",
  SEARCH_NON_UNIQUE_IN_FILE_NORMALIZED:
    "O search repete-se após normalização de fins de linha — risco igual ao textual.",
  SEARCH_NON_UNIQUE_IN_MVP_INNER:
    "Multiplicidade do search dentro do span UTF-16 do nó MVP — o caminho estrutural por replace_node pode divergir ou falhar.",
  PATCH_BOUNDS_NOT_FULLY_INSIDE_MVP_NODE:
    "A região do match do patch (bounds) não está totalmente contida no span do nó MVP escolhido — replace textual pode afetar fora da fronteira MVP.",
  PLAN_CONFIDENCE_DEGRADED:
    "Mapeamento textual→AST com menor confiança (empate min-span / pick ambíguo).",
  AFTER_PATCH_TEXTUAL_VS_STRUCTURAL_SNAPSHOT_DIFFERS:
    "Após esta etapa, o snapshot textual (ficheiro completo) diverge do snapshot simulado do ramo MVP replace_node (EOL normalizado); combinar com codes mais específicos.",
  STRUCTURAL_REPLACE_NODE_REJECTED:
    "apply textual-only dentro do span MVP falhou (lançamento capturado).",
  TEXTUAL_PATCH_REJECTED:
    "O patch textual sobre o ficheiro completo falhou na simulação — cadeia textual parada.",
  NO_REPLACE_NODE_PLAN_STRUCTURAL_IDLE:
    "Sem replace_node MVP para este patch; o texto estrutural simulado pode ficar atrás da cadeia textual.",
};

/**
 * @param {object|null|undefined} p
 * @returns {{ codes: string[], reasons: string[] }}
 */
function deriveDivergenceCodesForPatch(p) {
  const codes = [];
  const d = p && p.diagnostics_shadow_4931;

  if (d && d.search_non_unique_in_file_literal) codes.push("SEARCH_NON_UNIQUE_IN_FILE_LITERAL");
  if (d && d.search_non_unique_in_file_normalized) codes.push("SEARCH_NON_UNIQUE_IN_FILE_NORMALIZED");
  if (d && d.search_non_unique_in_mvp_inner) codes.push("SEARCH_NON_UNIQUE_IN_MVP_INNER");
  if (d && d.patch_bounds_extend_outside_mvp_span) codes.push("PATCH_BOUNDS_NOT_FULLY_INSIDE_MVP_NODE");
  if (d && d.plan_confidence_degraded) codes.push("PLAN_CONFIDENCE_DEGRADED");
  if (p && p.structural_apply_error) codes.push("STRUCTURAL_REPLACE_NODE_REJECTED");
  if (d && d.textual_step_apply_error_message) codes.push("TEXTUAL_PATCH_REJECTED");
  if (p && p.divergence_after_patch && !p.had_replace_node_plan)
    codes.push("NO_REPLACE_NODE_PLAN_STRUCTURAL_IDLE");
  if (p && p.divergence_after_patch) codes.push("AFTER_PATCH_TEXTUAL_VS_STRUCTURAL_SNAPSHOT_DIFFERS");

  const dedup = [...new Set(codes)];
  const reasons = dedup.map((c) => DIVERGENCE_REASON_LABEL_PT[c] || c);

  return { codes: dedup, reasons };
}

/**
 * Agrega divergências patch-a-patch e por ficheiro (artefacto shadow).
 * @param {{
 *   per_patch: object[],
 *   per_file: object[],
 *   textual_abort: string|null,
 *   structural_abort: string|null,
 * }} bundle
 */
function analyzeShadowTransformDiff(bundle) {
  const perPatch = Array.isArray(bundle.per_patch) ? bundle.per_patch : [];
  const perFile = Array.isArray(bundle.per_file) ? bundle.per_file : [];

  let patches_divergent_after_apply = 0;
  let patches_structural_apply_failed = 0;
  let patches_structural_skipped_no_op = 0;
  let patches_with_replace_node_plan = 0;
  let patches_with_plan_confidence_degraded = 0;
  let patches_search_non_unique_file = 0;
  let patches_bounds_outside_mvp = 0;

  const globalCodeHits = new Map();

  for (const p of perPatch) {
    if (p && p.had_replace_node_plan) patches_with_replace_node_plan += 1;
    if (p && p.structural_apply_error) patches_structural_apply_failed += 1;
    if (p && p.skipped_structural_no_replace_node) patches_structural_skipped_no_op += 1;
    if (p && p.divergence_after_patch) patches_divergent_after_apply += 1;

    const d = p && p.diagnostics_shadow_4931;
    if (d && d.plan_confidence_degraded) patches_with_plan_confidence_degraded += 1;
    if (d && (d.search_non_unique_in_file_literal || d.search_non_unique_in_file_normalized))
      patches_search_non_unique_file += 1;
    if (d && d.patch_bounds_extend_outside_mvp_span) patches_bounds_outside_mvp += 1;

    const { codes } = deriveDivergenceCodesForPatch(p);
    for (const c of codes) globalCodeHits.set(c, (globalCodeHits.get(c) || 0) + 1);
  }

  const files_divergent = perFile.filter((f) => f && f.equal_normalized === false).length;

  /** @type {object[]} */
  const fileRows = perFile.map((f) => {
    if (!f || !f.path) return f;

    const cmp = compareShadowTransformStrings(f.textual_final ?? "", f.structural_final ?? "");
    const lc = lineCounts(f.textual_final ?? "", f.structural_final ?? "");
    const normEdit = normalizedEditExtents(f.textual_final ?? "", f.structural_final ?? "");

    const patchCodesForPath = perPatch
      .filter((p) => p && p.path === f.path)
      .flatMap((p) => deriveDivergenceCodesForPatch(p).codes);

    return {
      path: f.path,
      equal_normalized: f.equal_normalized,
      compare: cmp,
      lines_totals: lc,
      normalized_full_file_edit_extent: normEdit,
      content_sha256_normalized: f.content_sha256_normalized || {
        textual: sha256HexNormalized(f.textual_final ?? ""),
        structural: sha256HexNormalized(f.structural_final ?? ""),
      },
      lineage_vs_initial_line_metrics: f.lineage_vs_initial_line_metrics || {
        textual_delta: estimateLineAlterationMetrics("", f.textual_final ?? ""),
        structural_delta: estimateLineAlterationMetrics("", f.structural_final ?? ""),
      },
      contributing_divergence_codes: [...new Set(patchCodesForPath)],
    };
  });

  return {
    schema_version: 2,
    phase: "4.9.3.1",
    shadow_only: true,
    generated_at: new Date().toISOString(),
    summary: {
      patch_count: perPatch.length,
      file_count: perFile.length,
      files_divergent,
      patches_with_replace_node_plan,
      patches_structural_apply_failed,
      patches_structural_skipped_no_op,
      patches_divergent_after_apply,
      patches_with_plan_confidence_degraded,
      patches_search_non_unique_file,
      patches_bounds_outside_mvp,
      textual_abort: bundle.textual_abort || null,
      structural_abort: bundle.structural_abort || null,
      divergence_code_histogram: Object.fromEntries(globalCodeHits),
    },
    reason_lookup_pt: DIVERGENCE_REASON_LABEL_PT,
    files: fileRows,
    patches: perPatch.map((p) => {
      if (!p) return p;
      const div = deriveDivergenceCodesForPatch(p);
      return {
        patch_index: p.patch_index,
        path: p.path,
        had_replace_node_plan: p.had_replace_node_plan,
        structural_apply_error: p.structural_apply_error || null,
        skipped_structural_no_replace_node: !!p.skipped_structural_no_replace_node,
        divergence_after_patch: !!p.divergence_after_patch,
        textual_chain_ok: p.textual_chain_ok,
        structural_chain_ok: p.structural_chain_ok,
        divergence_codes: div.codes,
        divergence_reasons_pt: div.reasons,
        diagnostics_shadow_4931: p.diagnostics_shadow_4931 || null,
      };
    }),
  };
}

module.exports = { analyzeShadowTransformDiff, deriveDivergenceCodesForPatch };
