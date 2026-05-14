"use strict";

const fs = require("fs");
const path = require("path");

const { applyPatchToContent } = require("../../patch-content");
const { readProjectUtf8 } = require("../../runtime/virtual-file-state");
const { assertSafeProjectPath, normalizeRelativePath } = require("../../shared-utils");
const {
  isStructuralPlanningShadowActive,
  isLanguageEnabledForStructural,
} = require("../feature-flags");
const { detectStructuralLanguage } = require("../languages/language-detector");
const { parseJavaScript } = require("../languages/javascript/js-parser");
const { validateJavaScriptAst } = require("../languages/javascript/js-ast-validator");
const { parseTypeScript } = require("../languages/typescript/ts-parser");
const { validateTypeScriptAst } = require("../languages/typescript/ts-ast-validator");
const { findOverlappingCandidates } = require("./node-candidate-matcher");
const { generateSelectorForAstNode } = require("./node-selector-generator");
const { scoreStructuralConfidence } = require("./structural-confidence");
const { buildStructuralPatchHint } = require("./structural-hint-builder");

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

function safeWrite(outputDir, name, data, outFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outFs && typeof outFs.writeJson === "function") outFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
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

function mkHint(ix, pth, sc, nk, nh, sel, fp, bm) {
  return buildStructuralPatchHint({
    patch_index: ix,
    path: pth,
    node_kind: nk,
    node_path_hint: nh,
    deterministic_selector: sel,
    selector_fingerprint: fp,
    confidence_score: sc,
    bounds_mode: bm,
  });
}

function trySim(rel, snap, search, replace) {
  const cur = snap.get(rel);

  if (cur === "" || cur == null) return { ok: false, next: "", err: "empty_snap" };

  try {
    return { ok: true, next: applyPatchToContent(cur, search, replace), err: "" };
  } catch (eR) {
    return { ok: false, next: cur, err: eR instanceof Error ? eR.message : String(eR) };
  }
}

function runStructuralPlanningShadow(opts) {
  if (!opts.force && !isStructuralPlanningShadowActive()) return { ran: false, reason: "flags_off" };

  const OD = opts.outputDir;
  const PR = opts.projectRoot;
  const OV = opts.overlay && typeof opts.overlay === "object" ? opts.overlay : null;
  const OFS = opts.outputFs || null;
  const allow = new Set((opts.allowedFiles || []).map((x) => normalizeRelativePath(x)));
  const chs = opts.changes || [];
  const t0 = Date.now();
  const plan = [];
  const hints = [];
  const scores = [];
  const snap = new Map();
  let abort = "";

  for (let i = 0; i < chs.length; i++) {
    const ch = chs[i];
    const rp = normalizeRelativePath(ch?.path ?? "");
    const sg = String(ch?.search ?? "");
    const rpl = String(ch?.replace ?? "");
    let conf = { patch_index: i, path: rp, score: 0, factors: {} };
    let prow = {
      patch_index: i,
      path: rp,
      operation: ch?.operation,
      status: "",
      detail: "",
    };

    if (abort) {
      prow.status = "skipped_after_sim_abort";
      prow.detail = abort;
      conf.score = 0;
      conf.factors = { reason: "skipped_chain", abort };
      plan.push(prow);
      scores.push(conf);
      hints.push(mkHint(i, rp, 0, null, null, null, null, null));
      continue;
    }

    if (!rp || ch?.operation !== "patch") {
      prow.status = "skip_bad_op";
      conf.factors = { reason: "not_patch_op" };

      hints.push(mkHint(i, rp, 0, null, null, null, null, null));
      plan.push(prow);
      scores.push(conf);
      continue;
    }

    if (!allow.has(rp)) {
      prow.status = "skip_not_allowlisted";
      conf.factors = { reason: "not_allowlisted" };

      hints.push(mkHint(i, rp, 0, null, null, null, null, null));
      plan.push(prow);
      scores.push(conf);

      continue;
    }

    const dlang = detectStructuralLanguage(rp);

    if (!dlang || !isLanguageEnabledForStructural(dlang)) {
      prow.status = "skip_lang";
      conf.factors = dlang ? { reason: "lang_env_filter" } : { reason: "bad_ext" };

      hints.push(mkHint(i, rp, 0, null, null, null, null, null));
      plan.push(prow);
      scores.push(conf);

      continue;
    }

    snapLoad(rp, OV, PR, snap);

    const src0 = String(snap.get(rp) || "");

    if (!src0.length) {
      prow.status = "skip_empty_snap";
      conf.factors = { reason: "empty_snap" };

      hints.push(mkHint(i, rp, 0, null, null, null, null, null));
      plan.push(prow);
      scores.push(conf);

      continue;
    }

    const bx = findPatchSearchBounds(src0, sg);

    if (!bx) {
      prow.status = "bounds_miss";
      const z = scoreStructuralConfidence({
        candidate_count: 0,
        overlapping_count: 0,
        picks_smallest_span: false,
        search_fully_inside_node: false,
        bounds_mode: null,
        top_kind: null,
      });

      conf.score = Math.min(z.score, 5);
      conf.factors = { ...z.factors, reason: "bounds_miss_shadow" };

      hints.push(mkHint(i, rp, conf.score, null, null, null, null, null));
      plan.push(prow);
      scores.push(conf);

      const simA = trySim(rp, snap, sg, rpl);

      if (simA.ok) snap.set(rp, simA.next);
      else abort = simA.err;

      continue;
    }

    prow.bounds_mode = bx.mode;

    const prs = parseR(src0, rp, dlang);

    if (prs.error || !prs.ast || !okAst(prs.ast, dlang)) {
      prow.status = prs.error ? "parse_fail" : "ast_bad";

      hints.push(mkHint(i, rp, 10, null, null, null, null, bx.mode));
      plan.push(prow);
      scores.push(conf);
      conf.score = 10;
      conf.factors = { reason: prs.error ? "parse_error" : "ast_invalid" };

      const simB = trySim(rp, snap, sg, rpl);

      if (simB.ok) snap.set(rp, simB.next);
      else abort = simB.err;

      continue;
    }

    const ov = findOverlappingCandidates(prs.ast, bx.start, bx.end);

    prow.overlap_mvp = ov.length;

    if (!ov.length) {
      prow.status = "no_overlap";

      const z2 = scoreStructuralConfidence({
        candidate_count: 0,
        overlapping_count: 0,
        picks_smallest_span: false,
        search_fully_inside_node: false,
        bounds_mode: bx.mode,
        top_kind: null,
      });

      conf.score = z2.score;
      conf.factors = { ...z2.factors, reason: "no_mvp_overlap" };

      hints.push(mkHint(i, rp, conf.score, null, null, null, null, bx.mode));
      plan.push(prow);
      scores.push(conf);

      const simC = trySim(rp, snap, sg, rpl);

      if (simC.ok) snap.set(rp, simC.next);
      else abort = simC.err;

      continue;
    }

    let minW = 1e12;
    const spans = ov.map((c) => {
      const n = /** @type {any} **/ (c.node);
      const w = (n.end ?? 0) - (n.start ?? 0);

      if (w < minW) minW = w;
      return w;
    });

    const ties = spans.filter((w) => w === minW).length;
    const top = ov[0];
    const n0 = /** @type {any} **/ (top.node);
    const picks = ties === 1 && n0.end - n0.start === minW;
    const inside =
      typeof n0.start === "number" &&
      typeof n0.end === "number" &&
      bx.start >= n0.start &&
      bx.end <= n0.end;

    const scv = scoreStructuralConfidence({
      candidate_count: ov.length,
      overlapping_count: ov.length,
      picks_smallest_span: picks,
      search_fully_inside_node: inside,
      bounds_mode: bx.mode,
      top_kind: top.node_kind,
    });

    const selb = generateSelectorForAstNode(top.node_kind, top.node);

    prow.status = picks && ties === 1 ? "mapped" : "mapped_ambiguous_minspan";
    prow.chosen_kind = top.node_kind;
    prow.chosen_path = top.node_path_hint;
    prow.minspan_ties = ties;

    if (selb) prow.selector_fp = selb.selector_fingerprint;

    conf.score = scv.score;
    conf.factors = { ...(scv.factors || {}), minspan_ties: ties };

    hints.push(
      mkHint(
        i,
        rp,
        scv.score,
        top.node_kind,
        top.node_path_hint,
        selb ? selb.deterministic_selector : null,
        selb ? selb.selector_fingerprint : null,
        bx.mode,
      ),
    );

    plan.push(prow);
    scores.push(conf);

    const simD = trySim(rp, snap, sg, rpl);

    if (simD.ok) snap.set(rp, simD.next);
    else abort = simD.err;
  }

  const dt = Date.now() - t0;

  safeWrite(OD, "structural-planning.json", {
    schema_version: 1,
    phase: "4.9.2",
    shadow_only: true,
    duration_ms: dt,
    simulator_abort: abort || null,
    entries: plan,
  }, OFS);

  safeWrite(OD, "structural-hints.json", { schema_version: 1, phase: "4.9.2", hints }, OFS);

  safeWrite(OD, "structural-confidence-report.json", { schema_version: 1, phase: "4.9.2", confidence_entries: scores }, OFS);

  return { ran: true, duration_ms: dt };
}

function runStructuralPlanningShadowIfEnabled(o) {
  try {
    return runStructuralPlanningShadow({ ...o, force: false });
  } catch (eG) {
    return { ran: false, reason: "threw", error: eG instanceof Error ? eG.message : String(eG) };
  }
}

module.exports = { runStructuralPlanningShadow, runStructuralPlanningShadowIfEnabled };
