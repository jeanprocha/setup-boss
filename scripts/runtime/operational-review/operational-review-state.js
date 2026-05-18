"use strict";

const fs = require("fs");
const path = require("path");

const OPERATIONAL_REVIEW_STATE_FILE = "operational-review-state.json";

const VALID_STATUSES = new Set([
  "pending",
  "confirmed",
  "adjustment_requested",
]);

/**
 * @param {{
 *   status: "pending"|"confirmed"|"adjustment_requested",
 *   operatorNotes?: string|null,
 *   createdAt?: string|null,
 *   confirmedAt?: string|null,
 *   adjustmentRequestedAt?: string|null,
 * }} p
 */
function buildOperationalReviewState(p) {
  const now = new Date().toISOString();
  const status = VALID_STATUSES.has(p.status) ? p.status : "pending";
  return {
    schema_version: "1.0.0",
    status,
    operator_notes:
      p.operatorNotes != null ? String(p.operatorNotes).trim() : "",
    created_at: p.createdAt != null ? String(p.createdAt) : now,
    confirmed_at:
      status === "confirmed"
        ? p.confirmedAt != null
          ? String(p.confirmedAt)
          : now
        : null,
    adjustment_requested_at:
      status === "adjustment_requested"
        ? p.adjustmentRequestedAt != null
          ? String(p.adjustmentRequestedAt)
          : now
        : null,
  };
}

/**
 * @param {unknown} obj
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
function validateOperationalReviewState(obj) {
  /** @type {string[]} */
  const errors = [];
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return { ok: false, errors: ["Raiz deve ser um objeto."] };
  }
  const o = /** @type {Record<string, unknown>} */ (obj);
  if (String(o.schema_version || "") !== "1.0.0") {
    errors.push("schema_version deve ser 1.0.0.");
  }
  const st = String(o.status || "");
  if (!VALID_STATUSES.has(st)) {
    errors.push("status inválido.");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true };
}

/**
 * @param {string} outputDir
 * @returns {{ ok: true, doc: object } | { ok: false }}
 */
function loadOperationalReviewState(outputDir) {
  const fp = path.join(path.resolve(outputDir), OPERATIONAL_REVIEW_STATE_FILE);
  if (!fs.existsSync(fp)) return { ok: false };
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const v = validateOperationalReviewState(doc);
    if (!v.ok) return { ok: false };
    return { ok: true, doc };
  } catch {
    return { ok: false };
  }
}

/**
 * @param {string} outputDir
 * @param {object} doc
 */
function writeOperationalReviewState(outputDir, doc) {
  const fp = path.join(path.resolve(outputDir), OPERATIONAL_REVIEW_STATE_FILE);
  fs.writeFileSync(fp, JSON.stringify(doc, null, 2), "utf-8");
  return doc;
}

/**
 * @param {string} outputDir
 * @returns {{ ok: true, doc: object }}
 */
function ensureOperationalReviewState(outputDir) {
  const loaded = loadOperationalReviewState(outputDir);
  if (loaded.ok) return loaded;
  const doc = buildOperationalReviewState({ status: "pending" });
  writeOperationalReviewState(outputDir, doc);
  return { ok: true, doc };
}

module.exports = {
  OPERATIONAL_REVIEW_STATE_FILE,
  buildOperationalReviewState,
  validateOperationalReviewState,
  loadOperationalReviewState,
  writeOperationalReviewState,
  ensureOperationalReviewState,
};
