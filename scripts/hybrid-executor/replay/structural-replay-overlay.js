"use strict";

const crypto = require("crypto");
const fs = require("fs");

const { applyPatchToContent } = require("../../patch-content");
const { assertSafeProjectPath, normalizeRelativePath } = require("../../shared-utils");
const { readProjectUtf8 } = require("../../runtime/virtual-file-state");

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s ?? ""), "utf8").digest("hex");
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

function snapLoad(rel, baselineOverlay, projectRoot, mem) {
  if (mem.has(rel)) return;

  try {
    if (baselineOverlay && Object.prototype.hasOwnProperty.call(baselineOverlay, rel)) {
      mem.set(rel, String(baselineOverlay[rel]));
      return;
    }

    if (!projectRoot) {
      mem.set(rel, "");
      return;
    }

    const safe = assertSafeProjectPath(projectRoot, rel);

    if (!fs.existsSync(safe.absolutePath) || binHead(safe.absolutePath)) {
      mem.set(rel, "");
      return;
    }

    mem.set(rel, readProjectUtf8(projectRoot, rel, null));
  } catch (_) {
    mem.set(rel, "");
  }
}

/**
 * Simula replace_node no conteúdo atual (shadow — só memória).
 * @param {string} content
 * @param {object|null} planEntry
 */
function simulateReplaceNodeInOverlay(content, planEntry) {
  const cur = String(content ?? "");

  if (!planEntry || planEntry.op !== "replace_node") {
    return { ok: true, next: cur, skipped: true, err: "" };
  }

  const ns = planEntry.node_span;
  const search = planEntry.search;
  const replace = planEntry.replace;

  if (
    !ns ||
    typeof ns.start !== "number" ||
    typeof ns.end !== "number" ||
    ns.end <= ns.start
  ) {
    return { ok: false, next: cur, skipped: false, err: "bad_node_span" };
  }

  const inner = cur.slice(ns.start, ns.end);

  try {
    const nextInner = applyPatchToContent(inner, search, replace);
    const next = cur.slice(0, ns.start) + nextInner + cur.slice(ns.end);

    return { ok: true, next, skipped: false, err: "" };
  } catch (eZ) {
    return {
      ok: false,
      next: cur,
      skipped: false,
      err: eZ instanceof Error ? eZ.message : String(eZ),
    };
  }
}

/**
 * Reexecuta a cadeia structural-only em overlay (read-only no disco).
 * @param {object[]} rows — telemetria híbrida (ordenada por patch_index)
 * @param {{ projectRoot?: string, initialOverlay?: object|null }} opts
 */
function runStructuralReplayOverlaySimulation(rows, opts) {
  const projectRoot = opts?.projectRoot ? String(opts.projectRoot) : "";
  const baselineOverlay =
    opts?.initialOverlay && typeof opts.initialOverlay === "object" ? opts.initialOverlay : null;
  const rws = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => (a.patch_index ?? 0) - (b.patch_index ?? 0));
  const mem = new Map();
  /** @type {object[]} */
  const perPatch = [];
  let chainAbort = null;

  for (const row of rws) {
    const rel = normalizeRelativePath(row?.path ?? "");
    const plan = row?.plan_entry ?? null;

    snapLoad(rel, baselineOverlay, projectRoot, mem);

    const before = String(mem.get(rel) ?? "");
    const sim = simulateReplaceNodeInOverlay(before, plan);
    const digestBefore = sha256HexUtf8(before);
    const digestAfter = sha256HexUtf8(sim.next);

    const entry = {
      patch_index: row.patch_index,
      path: rel,
      skipped: !!sim.skipped,
      simulation_ok: sim.ok,
      error: sim.err || null,
      before_length: before.length,
      after_length: sim.next.length,
      before_content_sha256: digestBefore,
      after_content_sha256: digestAfter,
      content_changed: digestBefore !== digestAfter,
    };

    if (!sim.skipped && sim.ok) {
      mem.set(rel, sim.next);
    } else if (!sim.skipped && !sim.ok) {
      chainAbort = { patch_index: row.patch_index, path: rel, error: sim.err };
    }

    perPatch.push(entry);
  }

  const perPathFinalDigest = {};

  for (const [k, v] of mem.entries()) {
    perPathFinalDigest[k] = sha256HexUtf8(v);
  }

  return {
    shadow_only: true,
    chain_abort: chainAbort,
    per_patch: perPatch,
    per_path_final_digest: perPathFinalDigest,
  };
}

module.exports = {
  simulateReplaceNodeInOverlay,
  runStructuralReplayOverlaySimulation,
};
