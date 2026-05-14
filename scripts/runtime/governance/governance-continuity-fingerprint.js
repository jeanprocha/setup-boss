/**
 * Fingerprint determinístico de continuidade governance (replay-safe).
 * Sem timestamps no payload canónico — apenas hashes estáveis e digestos ordenados.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { RECON_FILE } = require("../../execution-plan/reconciliation/reconciliation-engine");
const {
  VALIDATION_RESULTS_FILENAME,
  VALIDATION_RUNTIME_MANIFEST_FILENAME,
} = require("../../validation-runtime/constants");
const {
  RISK_ANALYSIS_FILENAME,
  RISK_RUNTIME_MANIFEST_FILENAME,
} = require("../../risk-runtime/constants");
const { buildSemanticContinuitySlice } = require("./governance-semantic-continuity");

const EXECUTION_PLAN_FILE = "execution-plan.json";

function stableStringify(value) {
  const seen = new WeakSet();
  function walk(x) {
    if (x === null || typeof x !== "object") return x;
    if (seen.has(x)) return "[Circular]";
    seen.add(x);
    if (Array.isArray(x)) return x.map(walk);
    const keys = Object.keys(x).sort();
    const o = {};
    for (const k of keys) {
      o[k] = walk(x[k]);
    }
    return o;
  }
  return JSON.stringify(walk(value));
}

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function sha256FileHex(absPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {object[]} evaluations
 */
function normalizedEvaluationsForContinuity(evaluations) {
  const list = Array.isArray(evaluations) ? evaluations : [];
  const rows = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    rows.push({
      phase: String(e.phase || ""),
      source_runtime: String(e.source_runtime || ""),
      code: String(e.code || ""),
      severity: String(e.severity || ""),
      message: String(e.message || ""),
    });
  }
  rows.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  return rows;
}

/**
 * @param {object[]} blockers
 */
function blockerCodesSorted(blockers) {
  const list = Array.isArray(blockers) ? blockers : [];
  const codes = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const c = b.code != null ? String(b.code) : "";
    if (c) codes.push(c);
  }
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} outputDir
 * @param {object[]} evaluations
 * @param {object[]} blockers
 */
function buildGovernanceContinuityPack(outputDir, evaluations, blockers) {
  const dir = String(outputDir || "");
  /** @type {{ kind: string, ref: string, value: string }[]} */
  const continuity_inputs = [];

  const planPath = path.join(dir, EXECUTION_PLAN_FILE);
  if (fs.existsSync(planPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: EXECUTION_PLAN_FILE,
      value: sha256FileHex(planPath),
    });
    const plan = readJsonIfExists(planPath);
    const pfp =
      plan &&
      plan.fingerprints &&
      typeof plan.fingerprints === "object" &&
      plan.fingerprints.plan_content_sha256 != null
        ? String(plan.fingerprints.plan_content_sha256)
        : "";
    continuity_inputs.push({
      kind: "plan_content_sha256",
      ref: `${EXECUTION_PLAN_FILE}:fingerprints.plan_content_sha256`,
      value: pfp || "__missing__",
    });
  }

  const valPath = path.join(dir, VALIDATION_RESULTS_FILENAME);
  if (fs.existsSync(valPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: VALIDATION_RESULTS_FILENAME,
      value: sha256FileHex(valPath),
    });
    const vr = readJsonIfExists(valPath);
    const md = vr && vr.metadata && typeof vr.metadata === "object" ? vr.metadata : {};
    const gfp =
      md.graph_fingerprint_sha256 != null ? String(md.graph_fingerprint_sha256) : "";
    const replayRows = [];
    const validators = vr && Array.isArray(vr.validators) ? vr.validators : [];
    for (const row of validators) {
      const fp =
        row && row.replay_fingerprint_sha256 != null
          ? String(row.replay_fingerprint_sha256)
          : "";
      replayRows.push(fp || "__empty__");
    }
    replayRows.sort((a, b) => a.localeCompare(b));
    continuity_inputs.push({
      kind: "validation_graph_fingerprint_sha256",
      ref: `${VALIDATION_RESULTS_FILENAME}:metadata.graph_fingerprint_sha256`,
      value: gfp || "__missing__",
    });
    continuity_inputs.push({
      kind: "validation_replay_fingerprints_digest",
      ref: `${VALIDATION_RESULTS_FILENAME}:validators.replay_fingerprint_sha256`,
      value: sha256HexUtf8(stableStringify(replayRows)),
    });
  }

  const vrmPath = path.join(dir, VALIDATION_RUNTIME_MANIFEST_FILENAME);
  if (fs.existsSync(vrmPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: VALIDATION_RUNTIME_MANIFEST_FILENAME,
      value: sha256FileHex(vrmPath),
    });
  }

  const riskPath = path.join(dir, RISK_ANALYSIS_FILENAME);
  if (fs.existsSync(riskPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: RISK_ANALYSIS_FILENAME,
      value: sha256FileHex(riskPath),
    });
    const risk = readJsonIfExists(riskPath);
    const rid = risk && risk.risk_analysis_id != null ? String(risk.risk_analysis_id) : "";
    continuity_inputs.push({
      kind: "risk_analysis_id",
      ref: `${RISK_ANALYSIS_FILENAME}:risk_analysis_id`,
      value: rid || "__missing__",
    });
  }

  const riskManPath = path.join(dir, RISK_RUNTIME_MANIFEST_FILENAME);
  if (fs.existsSync(riskManPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: RISK_RUNTIME_MANIFEST_FILENAME,
      value: sha256FileHex(riskManPath),
    });
  }

  const reconPath = path.join(dir, RECON_FILE);
  if (fs.existsSync(reconPath)) {
    continuity_inputs.push({
      kind: "artifact_sha256",
      ref: RECON_FILE,
      value: sha256FileHex(reconPath),
    });
    const recon = readJsonIfExists(reconPath);
    continuity_inputs.push({
      kind: "reconciliation_digest",
      ref: `${RECON_FILE}:stable_summary`,
      value: sha256HexUtf8(
        stableStringify({
          status: recon && recon.status != null ? String(recon.status) : "",
          unexpected_changes_count:
            recon && recon.unexpected_changes != null && Array.isArray(recon.unexpected_changes)
              ? recon.unexpected_changes.length
              : recon && recon.unexpected_changes_count != null
                ? Number(recon.unexpected_changes_count)
                : 0,
          unmatched_operations_count:
            recon && recon.unmatched_operations != null && Array.isArray(recon.unmatched_operations)
              ? recon.unmatched_operations.length
              : recon && recon.unmatched_operations_count != null
                ? Number(recon.unmatched_operations_count)
                : 0,
        }),
      ),
    });
  }

  const normEvals = normalizedEvaluationsForContinuity(evaluations);
  continuity_inputs.push({
    kind: "governance_evaluations_digest",
    ref: "governance-runtime.json:evaluations",
    value: sha256HexUtf8(stableStringify(normEvals)),
  });

  const bcodes = blockerCodesSorted(blockers);
  continuity_inputs.push({
    kind: "governance_blocker_codes_digest",
    ref: "governance-runtime.json:blockers",
    value: sha256HexUtf8(stableStringify(bcodes)),
  });

  continuity_inputs.sort((a, b) => {
    const ka = `${a.kind}\u0001${a.ref}`;
    const kb = `${b.kind}\u0001${b.ref}`;
    return ka.localeCompare(kb);
  });

  const governance_continuity_fingerprint = sha256HexUtf8(stableStringify(continuity_inputs));

  const semanticSlice = buildSemanticContinuitySlice(dir);

  return {
    governance_continuity_fingerprint,
    continuity_inputs,
    semantic_continuity_fingerprint: semanticSlice.semantic_continuity_fingerprint,
    semantic_continuity_inputs: semanticSlice.semantic_continuity_inputs,
  };
}

/**
 * @param {object} manifest
 * @param {{ governance_continuity_fingerprint: string, continuity_inputs: object[] }} pack
 */
function persistRuntimeContinuityFields(manifest, pack) {
  if (!manifest || !pack) return;
  manifest.governance_continuity_fingerprint = pack.governance_continuity_fingerprint;
  manifest.continuity_inputs = pack.continuity_inputs;
  manifest.semantic_continuity_fingerprint =
    pack.semantic_continuity_fingerprint != null ? String(pack.semantic_continuity_fingerprint) : "";
  manifest.semantic_continuity_inputs = Array.isArray(pack.semantic_continuity_inputs)
    ? pack.semantic_continuity_inputs
    : [];
}

module.exports = {
  stableStringify,
  buildGovernanceContinuityPack,
  persistRuntimeContinuityFields,
};
