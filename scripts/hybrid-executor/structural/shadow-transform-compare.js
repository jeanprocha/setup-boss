"use strict";

const crypto = require("crypto");

const {
  computeSearchMultiplicity,
} = require("./transform-plan-builder");

/**
 * Compara saídas textual vs “estrutural” (shadow); só normalização de EOL.
 * @returns {{
 *   equal_normalized: boolean,
 *   textual_len: number,
 *   structural_len: number,
 *   delta_chars_abs: number,
 * }}
 */
function compareShadowTransformStrings(textual, structural) {
  const nt = normalizeForCompare(textual);
  const ns = normalizeForCompare(structural);

  return {
    equal_normalized: nt === ns,
    textual_len: nt.length,
    structural_len: ns.length,
    delta_chars_abs: Math.abs(nt.length - ns.length),
  };
}

function normalizeForCompare(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function sha256HexNormalized(s) {
  const nt = normalizeForCompare(s);

  return crypto.createHash("sha256").update(nt, "utf8").digest("hex");
}

/**
 * Contagem simples por linhas (normalizadas para \n).
 * @returns {{ lines_textual: number, lines_structural: number }}
 */
function lineCounts(textual, structural) {
  const nt = normalizeForCompare(textual);
  const ns = normalizeForCompare(structural);
  return {
    lines_textual: nt.length ? nt.split("\n").length : 0,
    lines_structural: ns.length ? ns.split("\n").length : 0,
  };
}

/**
 * Estimativa grosseira de linhas tocadas ao comparar dois textos linha-a-linha.
 */
function estimateLineAlterationMetrics(before, after) {
  const b = normalizeForCompare(before).split("\n");
  const a = normalizeForCompare(after).split("\n");
  let differing_shared = 0;
  const upto = Math.min(a.length, b.length);

  for (let i = 0; i < upto; i++) {
    if (a[i] !== b[i]) differing_shared += 1;
  }

  const line_count_delta = a.length - b.length;

  return {
    line_count_before: b.length,
    line_count_after: a.length,
    line_count_delta,
    lines_differing_at_shared_indices: differing_shared,
    lines_changed_estimate: differing_shared + Math.abs(Math.max(0, line_count_delta)),
  };
}

/**
 * Extensão aproximada da primeira zona de edição entre duas strings (texto já no snapshot corrente).
 */
function normalizedEditExtents(before, after) {
  const b = normalizeForCompare(before);
  const a = normalizeForCompare(after);

  if (b === a)
    return {
      unchanged: true,
      edit_start_normalized: null,
      before_edit_end_exclusive: null,
      after_edit_end_exclusive: null,
      span_chars_before: 0,
      span_chars_after: 0,
    };

  let lo = 0;
  const n = Math.min(a.length, b.length);

  while (lo < n && a.charCodeAt(lo) === b.charCodeAt(lo)) lo++;

  let hi = 0;
  while (
    hi < n - lo &&
    a.charCodeAt(a.length - 1 - hi) === b.charCodeAt(b.length - 1 - hi)
  )
    hi++;

  const bi = b.length - hi;
  const ai = a.length - hi;

  return {
    unchanged: false,
    edit_start_normalized: lo,
    before_edit_end_exclusive: bi,
    after_edit_end_exclusive: ai,
    span_chars_before: Math.max(0, bi - lo),
    span_chars_after: Math.max(0, ai - lo),
  };
}

/**
 * Multiplicity do search no slice UTF-16 [span.start, span.end) do estado corrente.
 */
function multiplicityInInnerSpan(fullSource, span, search) {
  if (
    span == null ||
    typeof span.start !== "number" ||
    typeof span.end !== "number" ||
    span.end <= span.start
  )
    return null;

  const inner = String(fullSource ?? "").slice(span.start, span.end);
  const m = computeSearchMultiplicity(inner, search);

  return {
    inner_slice_utf16_chars: inner.length,
    ...m,
  };
}

module.exports = {
  compareShadowTransformStrings,
  normalizeForCompare,
  lineCounts,
  sha256HexNormalized,
  estimateLineAlterationMetrics,
  normalizedEditExtents,
  multiplicityInInnerSpan,
  computeSearchMultiplicity,
};
