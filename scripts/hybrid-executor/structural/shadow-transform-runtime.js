"use strict";

const fs = require("fs");
const path = require("path");

const { applyPatchToContent } = require("../../patch-content");
const { assertSafeProjectPath, normalizeRelativePath } = require("../../shared-utils");
const { readProjectUtf8 } = require("../../runtime/virtual-file-state");
const { isStructuralShadowTransformsShadowActive } = require("../feature-flags");
const { buildStructuralTransformPlans } = require("./transform-plan-builder");
const {
  multiplicityInInnerSpan,
  normalizedEditExtents,
  estimateLineAlterationMetrics,
  computeSearchMultiplicity,
  sha256HexNormalized,
} = require("./shadow-transform-compare");
const { analyzeShadowTransformDiff } = require("./transform-diff-analyzer");

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

function safeWrite(outputDir, name, data, outFs) {
  const fp = path.join(outputDir, name);

  try {
    if (outFs && typeof outFs.writeJson === "function") outFs.writeJson(fp, data);
    else fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

function tryTextual(rel, snap, search, replace) {
  const cur = snap.get(rel);

  if (cur === "" || cur == null) return { ok: false, next: "", err: "empty_snap" };

  try {
    return {
      ok: true,
      next: applyPatchToContent(cur, search, replace),
      err: "",
    };
  } catch (eR) {
    return {
      ok: false,
      next: cur,
      err: eR instanceof Error ? eR.message : String(eR),
    };
  }
}

/**
 * substitute replace_node dentro do span do nó MVP (simulação em memória sobre string fonte atual).
 */
function tryStructuralReplaceNode(rel, snap, planRow) {
  const cur = snap.get(rel);

  if (cur === "" || cur == null) {
    return { ok: false, next: cur || "", err: "empty_snap" };
  }

  if (!planRow || planRow.op !== "replace_node") {
    return { ok: true, next: cur, err: "", skipped: true };
  }

  const ns = planRow.node_span;
  const search = planRow.search;
  const replace = planRow.replace;

  if (
    !ns ||
    typeof ns.start !== "number" ||
    typeof ns.end !== "number" ||
    ns.end <= ns.start
  ) {
    return { ok: false, next: cur, err: "bad_node_span" };
  }

  const inner = cur.slice(ns.start, ns.end);

  try {
    const nextInner = applyPatchToContent(inner, search, replace);
    const next = cur.slice(0, ns.start) + nextInner + cur.slice(ns.end);
    return { ok: true, next, err: "", skipped: false };
  } catch (eZ) {
    return {
      ok: false,
      next: cur,
      err: eZ instanceof Error ? eZ.message : String(eZ),
      skipped: false,
    };
  }
}

/** @typedef {{ textual: Map<string,string>, structural: Map<string,string>, initial: Map<string,string> }} SplitSnapPlus */

/**
 * Mantém dois maps com o mesmo conteúdo inicial para todas as paths referidas nos patches.
 */
function primeSnaps(opts) {
  const PR = opts.projectRoot;
  const OV = opts.overlay && typeof opts.overlay === "object" ? opts.overlay : null;
  const chs = opts.changes || [];
  /** @type {Set<string>} */
  const touched = new Set();

  for (const ch of chs) touched.add(normalizeRelativePath(ch?.path ?? ""));

  const base = new Map();
  /** @type {SplitSnapPlus} */
  const out = { textual: new Map(), structural: new Map(), initial: new Map() };

  for (const raw of touched) {
    if (!raw) continue;
    snapLoad(raw, OV, PR, base);
    const body = String(base.get(raw) ?? "");
    out.textual.set(raw, body);
    out.structural.set(raw, body);
    out.initial.set(raw, body);
  }

  return out;
}

/** @returns {boolean} */
function snapshotEqualNormalized(aSnap, bSnap, rel) {
  const a = normalizeForCmp(aSnap.get(rel));
  const b = normalizeForCmp(bSnap.get(rel));
  return a === b;
}

function normalizeForCmp(s) {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/**
 * Shadow Fase 4.9.3 — compara resultado textual patch chain vs restrição ao span MVP.
 */
function runStructuralShadowTransformsShadow(opts) {
  if (!opts.force && !isStructuralShadowTransformsShadowActive()) {
    return { ran: false, reason: "flags_off" };
  }

  const OD = opts.outputDir;
  const OFS = opts.outputFs || null;
  const t0 = Date.now();
  const startedAt = new Date().toISOString();

  const chs = Array.isArray(opts.changes) ? opts.changes : [];

  /** @type {string} */
  let textualAbort = "";
  /** @type {string} */
  let structuralAbort = "";

  const planBundle = buildStructuralTransformPlans({
    projectRoot: opts.projectRoot,
    overlay: opts.overlay,
    allowedFiles: opts.allowedFiles || [],
    changes: chs,
  });

  const planRows = planBundle.entries || [];

  safeWrite(
    OD,
    "structural-transform-plan.json",
    {
      schema_version: 2,
      phase: "4.9.3.1",
      shadow_only: true,
      generated_at: startedAt,
      duration_ms_plan: planBundle.duration_ms,
      entries: planRows,
      hardening_notes: [
        "Plano gerado sempre sobre snapshots iniciais por patch-entry (cadência legacy 4.9.3 — inalterado).",
        "search_match_stats / shadow_confidence / patch_bounds_utf16 enriquecidos na 4.9.3.1.",
      ],
    },
    OFS,
  );

  const snaps = primeSnaps(opts);

  /** @type {object[]} */
  const perPatch = [];

  for (let i = 0; i < chs.length; i++) {
    const ch = chs[i];
    const rp = normalizeRelativePath(ch?.path ?? "");
    const sg = String(ch?.search ?? "");
    const rpl = String(ch?.replace ?? "");
    const planRow = planRows[i] || { patch_index: i, path: rp, op: null };

    const row = {
      patch_index: i,
      path: rp,
      had_replace_node_plan: planRow.op === "replace_node",
      skipped_structural_no_replace_node: planRow.op !== "replace_node",
      structural_apply_error: null,
      textual_chain_ok: !textualAbort,
      structural_chain_ok: !structuralAbort,
      divergence_after_patch: false,
    };

    if (!rp || ch?.operation !== "patch") {
      perPatch.push({
        ...row,
        skipped_structural_no_replace_node: true,
        had_replace_node_plan: false,
      });
      continue;
    }

    snapLoad(rp, opts.overlay || null, opts.projectRoot, snaps.textual);
    snapLoad(rp, opts.overlay || null, opts.projectRoot, snaps.structural);

    const textualBeforePatch = String(snaps.textual.get(rp) ?? "");

    /** @type {Record<string, unknown>} */
    const diagnosticsShadow = {};

    diagnosticsShadow.runtime_file_search_match_stats =
      textualBeforePatch.length && sg.length
        ? computeSearchMultiplicity(textualBeforePatch, sg)
        : null;

    diagnosticsShadow.plan_shadow_confidence = planRow.shadow_confidence || null;
    diagnosticsShadow.search_geometry = planRow.search_geometry || null;
    diagnosticsShadow.plan_search_match_stats = planRow.search_match_stats || null;
    diagnosticsShadow.patch_bounds_utf16 = planRow.patch_bounds_utf16 || null;
    diagnosticsShadow.patch_bounds_overlap_node_span_chars =
      planRow.op === "replace_node" && planRow.patch_bounds_utf16 && planRow.node_span
        ? {
            bounds_width:
              planRow.patch_bounds_utf16.end - planRow.patch_bounds_utf16.start,
            chosen_node_span_width: planRow.node_span.end - planRow.node_span.start,
          }
        : null;

    if (planRow.op === "replace_node" && planRow.node_span) {
      diagnosticsShadow.inner_span_search_match_stats = multiplicityInInnerSpan(
        textualBeforePatch,
        planRow.node_span,
        sg,
      );
    }

    diagnosticsShadow.search_non_unique_in_file_literal =
      !!(diagnosticsShadow.runtime_file_search_match_stats &&
      /** @type {any} **/ (diagnosticsShadow.runtime_file_search_match_stats).literal_matches > 1);
    diagnosticsShadow.search_non_unique_in_file_normalized =
      !!(diagnosticsShadow.runtime_file_search_match_stats &&
      /** @type {any} **/ (diagnosticsShadow.runtime_file_search_match_stats).normalized_matches > 1);
    diagnosticsShadow.search_non_unique_in_mvp_inner =
      !!(diagnosticsShadow.inner_span_search_match_stats &&
      /** @type {any} **/ (diagnosticsShadow.inner_span_search_match_stats).literal_matches > 1);

    diagnosticsShadow.plan_confidence_degraded =
      !!(planRow.shadow_confidence && planRow.shadow_confidence.degraded_from_ambiguous_pick);
    diagnosticsShadow.patch_bounds_extend_outside_mvp_span =
      planRow.op === "replace_node" &&
      !!(planRow.search_geometry && planRow.search_geometry.search_fully_inside_chosen_node_span === false);

    if (!textualAbort) {
      const tR = tryTextual(rp, snaps.textual, sg, rpl);

      if (tR.ok) {
        snaps.textual.set(rp, tR.next);
        diagnosticsShadow.textual_step_edit_extent = normalizedEditExtents(
          textualBeforePatch,
          tR.next,
        );
        diagnosticsShadow.textual_step_line_alteration = estimateLineAlterationMetrics(
          textualBeforePatch,
          tR.next,
        );
      } else {
        textualAbort = tR.err;
        diagnosticsShadow.textual_step_apply_error_message = textualAbort;
      }
    }

    row.diagnostics_shadow_4931 = diagnosticsShadow;

    if (!structuralAbort) {
      if (planRow.op === "replace_node") {
        const sR = tryStructuralReplaceNode(rp, snaps.structural, planRow);

        if (sR.skipped) {
          /* teor. inalcançável com op replace_node */
        } else if (sR.ok) snaps.structural.set(rp, sR.next);
        else {
          structuralAbort = sR.err;
          row.structural_apply_error = sR.err;
          if (diagnosticsShadow && typeof diagnosticsShadow === "object")
            /** @type {any} **/ (diagnosticsShadow).structural_step_apply_error_message =
              structuralAbort;
        }
      }
    }

    row.textual_chain_ok = !textualAbort;
    row.structural_chain_ok = !structuralAbort;

    row.divergence_after_patch = !snapshotEqualNormalized(
      snaps.textual,
      snaps.structural,
      rp,
    );

    perPatch.push(row);
  }

  /** @type {Set<string>} */
  const touchedPaths = new Set();

  for (const ch of chs) {
    touchedPaths.add(normalizeRelativePath(ch?.path ?? ""));
  }

  /** @type {object[]} */
  const perFile = [];

  for (const rel of touchedPaths) {
    if (!rel) continue;

    snapLoad(rel, opts.overlay || null, opts.projectRoot, snaps.textual);
    snapLoad(rel, opts.overlay || null, opts.projectRoot, snaps.structural);
    snapLoad(rel, opts.overlay || null, opts.projectRoot, snaps.initial);

    const tf = String(snaps.textual.get(rel) ?? "");
    const sf = String(snaps.structural.get(rel) ?? "");
    const init = String(snaps.initial.get(rel) ?? "");
    const equal = normalizeForCmp(tf) === normalizeForCmp(sf);

    perFile.push({
      path: rel,
      textual_final: tf,
      structural_final: sf,
      equal_normalized: equal,
      content_sha256_normalized: {
        textual: sha256HexNormalized(tf),
        structural: sha256HexNormalized(sf),
        initial: sha256HexNormalized(init),
      },
      lineage_vs_initial_line_metrics: {
        textual_delta: estimateLineAlterationMetrics(init, tf),
        structural_delta: estimateLineAlterationMetrics(init, sf),
      },
    });
  }

  const finishedAt = new Date().toISOString();

  /** @typedef {{ textual_abort: string|null, structural_abort: string|null }} AbortPair */
  const abortPack = /** @type {AbortPair} **/ ({
    textual_abort: textualAbort || null,
    structural_abort: structuralAbort || null,
  });

  const resultsPayload = {
    schema_version: 2,
    phase: "4.9.3.1",
    shadow_only: true,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Date.now() - t0,
    textual_abort: abortPack.textual_abort,
    structural_abort: abortPack.structural_abort,
    per_patch: perPatch,
    per_file: perFile,
    transform_plan_duration_ms: planBundle.duration_ms,
    hardening: {
      version: "4.9.3.1",
      notes:
        "Diagnósticos runtime (multiplicidades, extents, geometria search vs MVP) apenas em artefactos shadow.",
    },
  };

  safeWrite(OD, "shadow-transform-results.json", resultsPayload, OFS);

  const diffPayload = analyzeShadowTransformDiff({
    ...resultsPayload,
    per_patch: perPatch,
    per_file: perFile,
  });

  safeWrite(OD, "shadow-transform-diff.json", diffPayload, OFS);

  return { ran: true, durationMs: Date.now() - t0 };
}

function runStructuralShadowTransformsShadowIfEnabled(opts) {
  try {
    return runStructuralShadowTransformsShadow({ ...opts, force: false });
  } catch (eZ) {
    return {
      ran: false,
      reason: "threw",
      error: eZ instanceof Error ? eZ.message : String(eZ),
    };
  }
}

module.exports = {
  runStructuralShadowTransformsShadow,
  runStructuralShadowTransformsShadowIfEnabled,
};
