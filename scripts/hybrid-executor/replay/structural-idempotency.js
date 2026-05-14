"use strict";

const { isStructuralIdempotencyEnabled } = require("../feature-flags");

/**
 * Heurística MVP: search ausente mas replace presente — provável re-execução.
 * @param {string} before
 * @param {{ search?: string, replace?: string }} patch
 */
function detectAlreadyAppliedHeuristic(before, patch) {
  const hay = String(before ?? "");
  const search = String(patch?.search ?? "");
  const replace = String(patch?.replace ?? "");

  if (!search.length) return null;
  if (!hay.includes(search) && replace.length && hay.includes(replace)) {
    return {
      kind: "already_applied",
      signal: "search_absent_replace_present",
      confidence: "heuristic",
    };
  }

  return null;
}

/**
 * @param {object} row — inclui structural_replay.patch
 * @param {object|null} planEntry
 */
function analyzeIdempotencyForRow(row, planEntry) {
  if (!isStructuralIdempotencyEnabled()) {
    return { analyzed: false, findings: [] };
  }

  const replay = row?.structural_replay;
  const patch = replay?.patch;

  if (!patch || typeof patch.search !== "string") {
    return { analyzed: true, findings: [] };
  }

  /** @type {object[]} */
  const findings = [];

  if (planEntry?.op === "replace_node" && planEntry.mapping_status === "mapped") {
    const hit = detectAlreadyAppliedHeuristic(replay.capture_before_excerpt ?? "", patch);
    if (hit) findings.push(hit);
  }

  return { analyzed: true, findings };
}

/**
 * Captura excerpt limitado do `before` para idempotência (evita gravar ficheiro inteiro).
 */
function buildBeforeExcerptForIdempotency(before, maxLen = 24000) {
  const s = String(before ?? "");

  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

module.exports = {
  detectAlreadyAppliedHeuristic,
  analyzeIdempotencyForRow,
  buildBeforeExcerptForIdempotency,
};
