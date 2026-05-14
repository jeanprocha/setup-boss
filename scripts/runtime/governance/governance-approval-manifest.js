/**
 * Manifesto filesystem — governance-approval.json (HITL v1).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  GOVERNANCE_APPROVAL_MANIFEST_FILENAME,
  GOVERNANCE_APPROVAL_SCHEMA_VERSION,
  GOVERNANCE_APPROVAL_STATUS,
} = require("./governance-runtime-constants");

function approvalManifestPath(outputDir) {
  return path.join(String(outputDir || ""), GOVERNANCE_APPROVAL_MANIFEST_FILENAME);
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {{
 *   run_id: string,
 *   approval_id: string,
 *   governance_phase: string,
 *   blocker_codes: string[],
 *   requested_by_runtime: string,
 *   scope_fingerprint: string,
 * }} parts
 */
function buildGovernanceApprovalManifest(parts) {
  const runId = parts.run_id != null ? String(parts.run_id) : "";
  const approvalId = parts.approval_id != null ? String(parts.approval_id) : "";
  const lineage =
    parts.lineage && typeof parts.lineage === "object"
      ? parts.lineage
      : {
          previous_approval_id: null,
          previous_fingerprint: null,
          previous_semantic_fingerprint: null,
          invalidated_by: null,
          invalidated_at: null,
          continuity_reason: null,
          semantic_invalidated_by: null,
          semantic_continuity_reason: null,
        };
  return {
    schema_version: GOVERNANCE_APPROVAL_SCHEMA_VERSION,
    run_id: runId,
    approval_id: approvalId,
    status: GOVERNANCE_APPROVAL_STATUS.PENDING,
    requested_at: nowIso(),
    resolved_at: null,
    governance_phase: String(parts.governance_phase || ""),
    blocker_codes: Array.isArray(parts.blocker_codes) ? parts.blocker_codes.map(String) : [],
    requested_by_runtime: String(parts.requested_by_runtime || "governance-runtime"),
    scope_fingerprint: String(parts.scope_fingerprint || ""),
    governance_continuity_fingerprint:
      parts.governance_continuity_fingerprint != null
        ? String(parts.governance_continuity_fingerprint)
        : "",
    continuity_inputs: Array.isArray(parts.continuity_inputs) ? parts.continuity_inputs : [],
    semantic_continuity_fingerprint:
      parts.semantic_continuity_fingerprint != null ? String(parts.semantic_continuity_fingerprint) : "",
    semantic_continuity_inputs: Array.isArray(parts.semantic_continuity_inputs)
      ? parts.semantic_continuity_inputs
      : [],
    lineage,
    approvals: [],
    overrides: [],
    extensions: {},
  };
}

function loadGovernanceApprovalManifest(outputDir) {
  const p = approvalManifestPath(outputDir);
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

function saveGovernanceApprovalManifest(outputDir, doc) {
  const dir = String(outputDir || "");
  if (!dir || !doc) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(approvalManifestPath(dir), JSON.stringify(doc, null, 2), "utf8");
}

/**
 * @param {string} outputDir
 * @param {string} runId
 * @param {string} governancePhase
 * @param {string[]} blockerCodes
 */
function computeApprovalScopeFingerprint(outputDir, runId, governancePhase, blockerCodes) {
  const valPath = path.join(String(outputDir || ""), "validation-results.json");
  let fileFp = "";
  try {
    if (fs.existsSync(valPath)) {
      fileFp = crypto.createHash("sha256").update(fs.readFileSync(valPath)).digest("hex");
    }
  } catch (_) {
    fileFp = "";
  }
  const payload = [String(runId), String(governancePhase), fileFp, ...[...blockerCodes].map(String).sort()].join(
    "\u001e",
  );
  const h = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  return `sha256:${h}`;
}

/**
 * @param {string} runId
 * @param {string} governancePhase
 * @param {string} scopeFingerprint
 */
function computeApprovalId(runId, governancePhase, scopeFingerprint) {
  const raw = [String(runId), String(governancePhase), String(scopeFingerprint)].join("\u001e");
  const h = crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 20);
  return `ga-${h}`;
}

module.exports = {
  approvalManifestPath,
  buildGovernanceApprovalManifest,
  loadGovernanceApprovalManifest,
  saveGovernanceApprovalManifest,
  computeApprovalScopeFingerprint,
  computeApprovalId,
  GOVERNANCE_APPROVAL_STATUS,
};
