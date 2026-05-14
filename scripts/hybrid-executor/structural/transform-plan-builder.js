"use strict";

const fs = require("fs");
const path = require("path");

const { readProjectUtf8 } = require("../../runtime/virtual-file-state");
const { assertSafeProjectPath, normalizeRelativePath } = require("../../shared-utils");
const { isLanguageEnabledForStructural } = require("../feature-flags");
const { detectStructuralLanguage } = require("../languages/language-detector");
const { parseJavaScript } = require("../languages/javascript/js-parser");
const { validateJavaScriptAst } = require("../languages/javascript/js-ast-validator");
const { parseTypeScript } = require("../languages/typescript/ts-parser");
const { validateTypeScriptAst } = require("../languages/typescript/ts-ast-validator");
const { findOverlappingCandidates } = require("../planning/node-candidate-matcher");
const { scoreStructuralConfidence } = require("../planning/structural-confidence");

/** MVP Fase 4.9.3 — replace_node só nestes tipos de declaração. */
const SHADOW_REPLACE_NODE_KINDS = new Set([
  "ImportDeclaration",
  "VariableDeclaration",
  "FunctionDeclaration",
]);

function normalizeEolForBounds(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function countSplitsForBounds(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function normalizedIndexToOriginal(original, normalizedIndex) {
  let orig = 0;
  let norm = 0;
  const hay = String(original);

  while (orig < hay.length && norm < normalizedIndex) {
    const c = hay.charCodeAt(orig);
    const c1 = orig + 1 < hay.length ? hay.charCodeAt(orig + 1) : 0;

    if (c === 13 && c1 === 10) {
      orig += 2;
      norm += 1;
      continue;
    }

    if (c === 13) {
      orig += 1;
      norm += 1;
      continue;
    }

    orig += 1;
    norm += 1;
  }

  return Math.min(orig, hay.length);
}

function findPatchSearchBounds(content, search) {
  const hay = String(content ?? "");
  const needle = String(search ?? "");

  if (!needle.length) return null;

  const literalCount = countSplitsForBounds(hay, needle);

  if (literalCount === 1) {
    const foundAt = hay.indexOf(needle);

    return { start: foundAt, end: foundAt + needle.length, mode: "literal" };
  }

  if (literalCount > 1) return null;

  const nh = normalizeEolForBounds(hay);
  const nn = normalizeEolForBounds(needle);
  const normalizedCount = countSplitsForBounds(nh, nn);

  if (normalizedCount !== 1) return null;

  const niStart = nh.indexOf(nn);

  if (niStart < 0) return null;

  const niEnd = niStart + nn.length;
  const startOrig = normalizedIndexToOriginal(hay, niStart);
  const endOrig = normalizedIndexToOriginal(hay, niEnd);

  return { start: startOrig, end: endOrig, mode: "normalized" };
}

/**
 * Contagem de ocorrências do search (literal e EOL-normalizado), alinhada à heurística do executor textual.
 * @returns {{ literal_matches: number, normalized_matches: number, unique_in_file_literal: boolean, unique_in_file_normalized: boolean }}
 */
function computeSearchMultiplicity(haystack, needle) {
  const h = String(haystack ?? "");
  const n = String(needle ?? "");

  if (!n.length) {
    return {
      literal_matches: 0,
      normalized_matches: 0,
      unique_in_file_literal: false,
      unique_in_file_normalized: false,
    };
  }

  const lit = countSplitsForBounds(h, n);
  const nh = normalizeEolForBounds(h);
  const nn = normalizeEolForBounds(n);
  const norm = countSplitsForBounds(nh, nn);

  return {
    literal_matches: lit,
    normalized_matches: norm,
    unique_in_file_literal: lit === 1,
    unique_in_file_normalized: norm === 1,
  };
}

function binHead(abs) {
  let fd;

  try {
    fd = fs.openSync(abs, "r");
    const buf = Buffer.allocUnsafe(240);
    const n = fs.readSync(fd, buf, 0, 240, 0);

    for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
    return false;
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined)
      try {
        fs.closeSync(fd);
      } catch (_) {}
  }
}

function parseR(src, rel, lang) {
  const xt = path.extname(rel).toLowerCase();
  return lang === "javascript"
    ? parseJavaScript(src, { isJsx: xt === ".jsx", ranges: true })
    : parseTypeScript(src, rel, { ranges: true });
}

function okAst(ast, lang) {
  return lang === "typescript" ? validateTypeScriptAst(ast).ok : validateJavaScriptAst(ast).ok;
}

function snapLoad(rel, overlay, root, mem) {
  if (mem.has(rel)) return;

  try {
    if (overlay && Object.prototype.hasOwnProperty.call(overlay, rel)) {
      mem.set(rel, String(overlay[rel]));
      return;
    }

    const safe = assertSafeProjectPath(root, rel);

    if (!fs.existsSync(safe.absolutePath) || binHead(safe.absolutePath)) {
      mem.set(rel, "");
      return;
    }

    mem.set(rel, readProjectUtf8(root, rel, null));
  } catch (_) {
    mem.set(rel, "");
  }
}

/**
 * Gera planos de transform shadow (replace_node) a partir dos patches textuais.
 * @returns {{ duration_ms: number, entries: object[] }}
 */
function buildStructuralTransformPlans(opts) {
  const PR = opts.projectRoot;
  const OV = opts.overlay && typeof opts.overlay === "object" ? opts.overlay : null;
  const allow = new Set((opts.allowedFiles || []).map((x) => normalizeRelativePath(x)));
  const chs = opts.changes || [];
  const snap = new Map();
  const t0 = Date.now();

  /** @type {object[]} */
  const entries = [];

  for (let i = 0; i < chs.length; i++) {
    const ch = chs[i];
    const rp = normalizeRelativePath(ch?.path ?? "");
    const sg = String(ch?.search ?? "");
    const rpl = String(ch?.replace ?? "");

    const base = {
      patch_index: i,
      path: rp,
      op: null,
    };

    if (!rp || ch?.operation !== "patch") {
      entries.push({
        ...base,
        skip_reason: "not_patch_op",
      });
      continue;
    }

    if (!allow.has(rp)) {
      entries.push({
        ...base,
        skip_reason: "not_allowlisted",
      });
      continue;
    }

    const dlang = detectStructuralLanguage(rp);

    if (!dlang || !isLanguageEnabledForStructural(dlang)) {
      entries.push({
        ...base,
        skip_reason: !dlang ? "bad_ext" : "lang_env_filter",
        detected_language: dlang || null,
      });
      continue;
    }

    snapLoad(rp, OV, PR, snap);

    const src0 = String(snap.get(rp) || "");

    if (!src0.length) {
      entries.push({
        ...base,
        skip_reason: "empty_snap",
      });
      continue;
    }

    const bx = findPatchSearchBounds(src0, sg);
    const search_match_stats = computeSearchMultiplicity(src0, sg);

    if (!bx) {
      entries.push({
        ...base,
        skip_reason: "bounds_miss",
        search_match_stats,
      });
      continue;
    }

    const prs = parseR(src0, rp, dlang);

    if (prs.error || !prs.ast || !okAst(prs.ast, dlang)) {
      entries.push({
        ...base,
        skip_reason: prs.error ? "parse_error" : "ast_invalid",
        bounds_mode: bx.mode,
        patch_bounds_utf16: { start: bx.start, end: bx.end },
        search_match_stats,
      });
      continue;
    }

    const ov = findOverlappingCandidates(prs.ast, bx.start, bx.end);

    if (!ov.length) {
      entries.push({
        ...base,
        skip_reason: "no_overlap",
        bounds_mode: bx.mode,
        patch_bounds_utf16: { start: bx.start, end: bx.end },
        search_match_stats,
      });
      continue;
    }

    let minW = 1e12;

    ov.forEach((c) => {
      const n = /** @type {any} **/ (c.node);
      const w = (n.end ?? 0) - (n.start ?? 0);
      if (w < minW) minW = w;
    });

    const ties = ov.filter((c) => {
      const n = /** @type {any} **/ (c.node);
      return (n.end ?? 0) - (n.start ?? 0) === minW;
    }).length;

    const top = ov[0];
    const n0 = /** @type {any} **/ (top.node);
    const picks = ties === 1 && n0.end - n0.start === minW;

    const prowStatus = picks && ties === 1 ? "mapped" : "mapped_ambiguous_minspan";

    const search_inside_node =
      typeof n0.start === "number" &&
      typeof n0.end === "number" &&
      bx.start >= n0.start &&
      bx.end <= n0.end;

    const scv = scoreStructuralConfidence({
      candidate_count: ov.length,
      overlapping_count: ov.length,
      picks_smallest_span: picks,
      search_fully_inside_node: search_inside_node,
      bounds_mode: bx.mode,
      top_kind: top.node_kind,
    });

    const shadow_confidence = {
      mapping_status: prowStatus,
      overlap_mvp_count: ov.length,
      minspan_ties: ties,
      degraded_from_ambiguous_pick: prowStatus !== "mapped",
      degraded_reason: prowStatus !== "mapped" ? "minspan_tie_or_non_unique_pick" : null,
    };

    if (!SHADOW_REPLACE_NODE_KINDS.has(top.node_kind)) {
      entries.push({
        ...base,
        skip_reason: "node_kind_not_mvp_shadow",
        node_kind_shadow: top.node_kind,
        mapping_status: prowStatus,
        bounds_mode: bx.mode,
        overlap_mvp: ov.length,
        minspan_ties: ties,
        patch_bounds_utf16: { start: bx.start, end: bx.end },
        search_geometry: {
          search_fully_inside_chosen_node_span: search_inside_node,
        },
        search_match_stats,
        shadow_confidence,
        confidence_score: scv.score,
        confidence_factors: scv.factors,
      });
      continue;
    }

    entries.push({
      ...base,
      op: "replace_node",
      node_kind: top.node_kind,
      node_path_hint: top.node_path_hint,
      node_span: {
        start: n0.start,
        end: n0.end,
      },
      search: sg,
      replace: rpl,
      bounds_mode: bx.mode,
      mapping_status: prowStatus,
      overlap_mvp: ov.length,
      minspan_ties: ties,
      patch_bounds_utf16: { start: bx.start, end: bx.end },
      search_geometry: {
        search_fully_inside_chosen_node_span: search_inside_node,
      },
      search_match_stats,
      shadow_confidence,
      confidence_score: scv.score,
      confidence_factors: scv.factors,
    });
  }

  return {
    duration_ms: Date.now() - t0,
    entries,
  };
}

module.exports = {
  SHADOW_REPLACE_NODE_KINDS,
  buildStructuralTransformPlans,
  findPatchSearchBounds,
  computeSearchMultiplicity,
};
