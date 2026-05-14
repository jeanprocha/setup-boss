/**
 * Fase 4.11.6 — Diff determinístico entre deterministic-review.json de duas runs.
 * Sem timestamps; ordenação estável; findings comparados por finding_id (code/type espelhados no compact).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { REVIEW_DIFF_FILENAME } = require("./constants");

const DETERMINISTIC_REVIEW_DIFF_CONTRACT = "deterministic-review-diff/1";

/**
 * @param {object|null} f
 * @returns {{ finding_id: string, code: string, type: string, severity: string }}
 */
function compactFinding(f) {
  if (!f || typeof f !== "object") {
    return { finding_id: "", code: "", type: "", severity: "" };
  }
  return {
    finding_id: f.finding_id != null ? String(f.finding_id) : "",
    code: f.code != null ? String(f.code) : "",
    type: f.type != null ? String(f.type) : "",
    severity: f.severity != null ? String(f.severity) : "",
  };
}

function sortCompactFindings(rows) {
  return [...rows].sort((a, b) => {
    const c = a.finding_id.localeCompare(b.finding_id);
    if (c !== 0) return c;
    const c2 = a.code.localeCompare(b.code);
    if (c2 !== 0) return c2;
    return a.type.localeCompare(b.type);
  });
}

function uniqueSortedCodes(rows) {
  const s = new Set();
  for (const r of rows) {
    if (r && r.code) s.add(String(r.code));
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function fingerprintOf(doc) {
  const fp =
    doc &&
    doc.fingerprints &&
    doc.fingerprints.deterministic_review_content_sha256 != null
      ? String(doc.fingerprints.deterministic_review_content_sha256)
      : null;
  return fp && fp.length ? fp : null;
}

function riskSlice(doc) {
  const rs = doc && doc.risk_summary && typeof doc.risk_summary === "object" ? doc.risk_summary : {};
  const score = rs.risk_score != null ? Number(rs.risk_score) : 0;
  return {
    overall_risk_level: rs.overall_risk_level != null ? String(rs.overall_risk_level) : "low",
    risk_score: Number.isFinite(score) ? score : 0,
  };
}

function gateSlice(doc) {
  const g = doc && doc.gate && typeof doc.gate === "object" ? doc.gate : {};
  return {
    mode: g.mode != null ? String(g.mode) : "off",
    threshold: g.threshold != null ? String(g.threshold) : "high",
    decision: g.decision != null ? String(g.decision) : "pass",
    risk_level: g.risk_level != null ? String(g.risk_level) : null,
  };
}

function pairField(beforeVal, afterVal) {
  return {
    before: beforeVal,
    after: afterVal,
  };
}

/**
 * @param {object|null} beforeDoc
 * @param {object|null} afterDoc
 * @param {object} [opts]
 * @param {number} [opts.max_findings_per_bucket]
 * @param {string|null} [opts.before_run_id]
 * @param {string|null} [opts.after_run_id]
 * @param {string|null} [opts.before_output_dir]
 * @param {string|null} [opts.after_output_dir]
 */
function compareDeterministicReviews(beforeDoc, afterDoc, opts = {}) {
  const maxCap =
    opts.max_findings_per_bucket != null && Number(opts.max_findings_per_bucket) > 0
      ? Math.floor(Number(opts.max_findings_per_bucket))
      : 48;

  const beforeFindings = beforeDoc && Array.isArray(beforeDoc.findings) ? beforeDoc.findings : [];
  const afterFindings = afterDoc && Array.isArray(afterDoc.findings) ? afterDoc.findings : [];

  let withoutIdBefore = 0;
  let withoutIdAfter = 0;
  const beforeMap = new Map();
  for (const f of beforeFindings) {
    const id = f && f.finding_id != null ? String(f.finding_id) : "";
    if (!id) {
      withoutIdBefore += 1;
      continue;
    }
    beforeMap.set(id, compactFinding(f));
  }
  const afterMap = new Map();
  for (const f of afterFindings) {
    const id = f && f.finding_id != null ? String(f.finding_id) : "";
    if (!id) {
      withoutIdAfter += 1;
      continue;
    }
    afterMap.set(id, compactFinding(f));
  }

  /** @type {object[]} */
  const persistentRaw = [];
  for (const id of [...beforeMap.keys()].sort((a, b) => a.localeCompare(b))) {
    if (afterMap.has(id)) persistentRaw.push(beforeMap.get(id));
  }

  /** @type {object[]} */
  const newRaw = [];
  for (const id of [...afterMap.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!beforeMap.has(id)) newRaw.push(afterMap.get(id));
  }

  /** @type {object[]} */
  const resolvedRaw = [];
  for (const id of [...beforeMap.keys()].sort((a, b) => a.localeCompare(b))) {
    if (!afterMap.has(id)) resolvedRaw.push(beforeMap.get(id));
  }

  function capBucket(rows) {
    const sorted = sortCompactFindings(rows);
    if (sorted.length <= maxCap) {
      return { items: sorted, truncated: false, omitted: 0 };
    }
    return { items: sorted.slice(0, maxCap), truncated: true, omitted: sorted.length - maxCap };
  }

  const capNew = capBucket(newRaw);
  const capResolved = capBucket(resolvedRaw);
  const capPers = capBucket(persistentRaw);

  const fpBefore = fingerprintOf(beforeDoc);
  const fpAfter = fingerprintOf(afterDoc);
  const fingerprint_changed =
    fpBefore !== null && fpAfter !== null ? fpBefore !== fpAfter : false;
  const fingerprint_comparison_possible = fpBefore !== null && fpAfter !== null;

  const rBefore = riskSlice(beforeDoc);
  const rAfter = riskSlice(afterDoc);
  const risk_score_delta = rAfter.risk_score - rBefore.risk_score;

  const gBefore = gateSlice(beforeDoc);
  const gAfter = gateSlice(afterDoc);

  const mdBefore = beforeDoc && beforeDoc.metadata && typeof beforeDoc.metadata === "object" ? beforeDoc.metadata : {};
  const mdAfter = afterDoc && afterDoc.metadata && typeof afterDoc.metadata === "object" ? afterDoc.metadata : {};

  const artifact_presence = {
    before: Boolean(beforeDoc && typeof beforeDoc === "object"),
    after: Boolean(afterDoc && typeof afterDoc === "object"),
  };

  return {
    schema_contract: DETERMINISTIC_REVIEW_DIFF_CONTRACT,
    artifact_presence,
    comparison: {
      primary_key: "finding_id",
      fields_echoed: ["code", "type", "severity"],
    },
    runs: {
      before: {
        run_id: opts.before_run_id != null ? String(opts.before_run_id) : mdBefore.run_id != null ? String(mdBefore.run_id) : null,
        plan_id: mdBefore.plan_id != null ? String(mdBefore.plan_id) : null,
        output_dir: opts.before_output_dir != null ? String(opts.before_output_dir) : null,
      },
      after: {
        run_id: opts.after_run_id != null ? String(opts.after_run_id) : mdAfter.run_id != null ? String(mdAfter.run_id) : null,
        plan_id: mdAfter.plan_id != null ? String(mdAfter.plan_id) : null,
        output_dir: opts.after_output_dir != null ? String(opts.after_output_dir) : null,
      },
    },
    fingerprints: {
      before: fpBefore,
      after: fpAfter,
      changed: fingerprint_changed,
      comparable: fingerprint_comparison_possible,
    },
    summary: {
      fingerprint_changed,
      fingerprint_comparison_possible,
      risk_score_delta,
      new_findings_count: newRaw.length,
      resolved_findings_count: resolvedRaw.length,
      persistent_findings_count: persistentRaw.length,
      findings_without_finding_id_before: withoutIdBefore,
      findings_without_finding_id_after: withoutIdAfter,
      findings_truncated: {
        new_findings: capNew.truncated,
        resolved_findings: capResolved.truncated,
        persistent_findings: capPers.truncated,
      },
      findings_omitted: {
        new_findings: capNew.omitted,
        resolved_findings: capResolved.omitted,
        persistent_findings: capPers.omitted,
      },
    },
    risk_changes: {
      overall_risk_level: pairField(rBefore.overall_risk_level, rAfter.overall_risk_level),
      risk_score: {
        before: rBefore.risk_score,
        after: rAfter.risk_score,
        delta: risk_score_delta,
      },
    },
    gate_changes: {
      mode: pairField(gBefore.mode, gAfter.mode),
      threshold: pairField(gBefore.threshold, gAfter.threshold),
      decision: pairField(gBefore.decision, gAfter.decision),
      risk_level: pairField(gBefore.risk_level, gAfter.risk_level),
    },
    findings: {
      new_findings: capNew.items,
      resolved_findings: capResolved.items,
      persistent_findings: capPers.items,
      codes_new: uniqueSortedCodes(newRaw),
      codes_resolved: uniqueSortedCodes(resolvedRaw),
    },
  };
}

/**
 * Grava review-diff.json em outputDir (run destino “after”).
 * @param {string} outputDir
 * @param {object} diffDoc
 * @param {object|null} outputFs
 */
function saveReviewDiffArtifact(outputDir, diffDoc, outputFs = null) {
  const dir = String(outputDir || "");
  if (!dir || !diffDoc || typeof diffDoc !== "object") return null;
  const p = path.join(dir, REVIEW_DIFF_FILENAME);
  const json = `${JSON.stringify(diffDoc, null, 2)}\n`;
  if (outputFs && typeof outputFs.writeUtf8 === "function") {
    outputFs.writeUtf8(p, json);
  } else {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, json, "utf8");
  }
  return p;
}

module.exports = {
  DETERMINISTIC_REVIEW_DIFF_CONTRACT,
  compareDeterministicReviews,
  saveReviewDiffArtifact,
  compactFinding,
};
