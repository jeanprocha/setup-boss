"use strict";

const fs = require("fs");
const path = require("path");

const REVIEW_OUTPUT_FILENAME = "review-output.json";
const REVIEW_MARKDOWN_FILENAME = "review-output.md";
const NORMALIZATION_SOURCE = "execution_bundle_normalization_v1";

const VALID_REVIEW_STATUSES = new Set(["approved", "rejected", "blocked"]);

/**
 * @param {string} fp
 * @returns {Record<string, unknown>|null}
 */
function safeReadJson(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    const j = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
}

/**
 * Artefacto review-output.json já válido — não sobrescrever.
 *
 * @param {unknown} doc
 * @returns {boolean}
 */
function isPreservedReviewOutput(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return false;
  const d = /** @type {Record<string, unknown>} */ (doc);
  const st = d.status != null ? String(d.status).trim().toLowerCase() : "";
  if (!VALID_REVIEW_STATUSES.has(st)) return false;
  if (st === "approved") {
    return typeof d.requires_correction === "boolean";
  }
  return true;
}

/**
 * @param {Record<string, unknown>} bundleData
 * @returns {boolean}
 */
function hasClearApprovedEvidence(bundleData) {
  const subtasks = Array.isArray(bundleData.subtasks) ? bundleData.subtasks : [];
  if (subtasks.length === 0) return false;

  let approvedCount = 0;
  for (const row of subtasks) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const st = /** @type {Record<string, unknown>} */ (row);
    const review =
      st.review && typeof st.review === "object" && !Array.isArray(st.review)
        ? /** @type {Record<string, unknown>} */ (st.review)
        : {};
    const rs = review.status != null ? String(review.status).trim().toLowerCase() : "none";
    if (rs === "rejected" || rs === "pending") return false;
    if (rs === "approved") approvedCount += 1;
    const uiState = st.state != null ? String(st.state).trim().toLowerCase() : "";
    if ((uiState === "completed" || uiState === "recovered") && rs === "none") {
      return false;
    }
  }

  if (approvedCount === 0) return false;

  const sum =
    bundleData.summary && typeof bundleData.summary === "object" && !Array.isArray(bundleData.summary)
      ? /** @type {Record<string, unknown>} */ (bundleData.summary)
      : {};
  const agg =
    sum.review && typeof sum.review === "object" && !Array.isArray(sum.review)
      ? /** @type {Record<string, unknown>} */ (sum.review)
      : {};
  return String(agg.status || "").trim().toLowerCase() === "approved";
}

/**
 * @param {Record<string, unknown>} bundleData
 * @param {string} runId
 */
function buildNormalizedReviewOutput(bundleData, runId) {
  const sum =
    bundleData.summary && typeof bundleData.summary === "object" && !Array.isArray(bundleData.summary)
      ? /** @type {Record<string, unknown>} */ (bundleData.summary)
      : {};
  const agg =
    sum.review && typeof sum.review === "object" && !Array.isArray(sum.review)
      ? /** @type {Record<string, unknown>} */ (sum.review)
      : {};

  const subtasks = Array.isArray(bundleData.subtasks) ? bundleData.subtasks : [];
  const approvedIds = subtasks
    .filter((row) => {
      if (!row || typeof row !== "object") return false;
      const review = /** @type {Record<string, unknown>} */ (row).review;
      return (
        review &&
        typeof review === "object" &&
        String(/** @type {Record<string, unknown>} */ (review).status || "").toLowerCase() ===
          "approved"
      );
    })
    .map((row) => String(/** @type {Record<string, unknown>} */ (row).id || "").trim())
    .filter(Boolean);

  const decidedAt =
    agg.decidedAt != null && String(agg.decidedAt).trim()
      ? String(agg.decidedAt).trim()
      : new Date().toISOString();

  const summaryText =
    approvedIds.length === 1
      ? `Review aprovado (execution-runtime) — subtask ${approvedIds[0]}.`
      : `Review aprovado (execution-runtime) — subtasks: ${approvedIds.join(", ")}.`;

  return {
    status: "approved",
    acceptance_level: "development",
    blocking_issues: [],
    warnings: [
      "Review normalizado a partir do bundle agregado do daemon (fluxo execute-only).",
    ],
    requires_correction: false,
    summary: summaryText,
    markdown_report: `**Approved (normalized from execution bundle)**\n\nRun: ${runId}\n\n${summaryText}`,
    normalization: {
      source: NORMALIZATION_SOURCE,
      normalized_at: new Date().toISOString(),
      run_id: runId,
      subtasks_approved: approvedIds,
      aggregate_decided_at: decidedAt,
    },
  };
}

/**
 * @param {string} outputDir
 * @param {string} md
 */
function writeReviewMarkdownStub(outputDir, md) {
  const mPath = path.join(outputDir, REVIEW_MARKDOWN_FILENAME);
  if (fs.existsSync(mPath)) return;
  fs.writeFileSync(mPath, md, "utf-8");
}

/**
 * Normaliza review aprovado do bundle execute-only para `review-output.json`.
 *
 * @param {string} outputDir
 * @param {string} runId
 * @param {{ bundle?: { ok: boolean, data?: Record<string, unknown>|null } }} [opts]
 */
function normalizeReviewOutputFromExecutionBundle(outputDir, runId, opts = {}) {
  const out = path.resolve(String(outputDir || ""));
  const rid = String(runId || "").trim();
  if (!out || !rid) {
    return { action: "skipped", reason: "missing_params", reviewOutput: null };
  }

  const reviewPath = path.join(out, REVIEW_OUTPUT_FILENAME);
  const existing = safeReadJson(reviewPath);
  if (isPreservedReviewOutput(existing)) {
    return {
      action: "preserved",
      reason: "existing_valid",
      reviewOutput: existing,
    };
  }

  /** @type {{ ok: boolean, data?: Record<string, unknown>|null, error?: unknown }} */
  let bundleResult = opts.bundle || null;
  if (!bundleResult) {
    const { collectExecutionForRun } = require("../scripts/daemon/lib/run-execution");
    bundleResult = collectExecutionForRun(rid);
  }

  if (!bundleResult || bundleResult.ok !== true || !bundleResult.data) {
    return {
      action: "skipped",
      reason: "bundle_unavailable",
      reviewOutput: existing,
    };
  }

  const bundleData = /** @type {Record<string, unknown>} */ (bundleResult.data);
  const sum =
    bundleData.summary && typeof bundleData.summary === "object" && !Array.isArray(bundleData.summary)
      ? /** @type {Record<string, unknown>} */ (bundleData.summary)
      : {};
  const agg =
    sum.review && typeof sum.review === "object" && !Array.isArray(sum.review)
      ? /** @type {Record<string, unknown>} */ (sum.review)
      : {};
  const aggStatus = String(agg.status || "none").trim().toLowerCase();

  if (aggStatus === "rejected" || aggStatus === "blocked") {
    return {
      action: "skipped",
      reason: "bundle_review_terminal",
      aggregateStatus: aggStatus,
      reviewOutput: existing,
    };
  }

  if (aggStatus !== "approved") {
    return {
      action: "skipped",
      reason: "bundle_not_approved",
      aggregateStatus: aggStatus,
      reviewOutput: existing,
    };
  }

  if (!hasClearApprovedEvidence(bundleData)) {
    return {
      action: "skipped",
      reason: "insufficient_evidence",
      aggregateStatus: aggStatus,
      reviewOutput: existing,
    };
  }

  const doc = buildNormalizedReviewOutput(bundleData, rid);
  fs.writeFileSync(reviewPath, JSON.stringify(doc, null, 2), "utf-8");
  writeReviewMarkdownStub(outputDir, String(doc.markdown_report || ""));

  return {
    action: "written",
    reason: "normalized_from_bundle",
    reviewOutput: doc,
  };
}

module.exports = {
  REVIEW_OUTPUT_FILENAME,
  NORMALIZATION_SOURCE,
  isPreservedReviewOutput,
  hasClearApprovedEvidence,
  buildNormalizedReviewOutput,
  normalizeReviewOutputFromExecutionBundle,
};
