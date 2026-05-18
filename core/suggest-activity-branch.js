"use strict";

const DEFAULT_PREFIX = "setup-boss";
const MAX_BRANCH_LENGTH = 70;
const MAX_SLUG_LENGTH = 50;

/**
 * @param {string} s
 * @returns {string}
 */
function removeAccents(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * @param {string} title
 * @returns {string}
 */
function slugifyActivityTitle(title) {
  let s = removeAccents(String(title || "").toLowerCase());
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
  }
  return s || "atividade";
}

/**
 * @param {Date|string|number|undefined} date
 * @returns {string}
 */
function formatBranchDatePrefix(date) {
  const d =
    date instanceof Date
      ? date
      : date != null && String(date).trim()
        ? new Date(date)
        : new Date();
  if (!Number.isFinite(d.getTime())) {
    return formatBranchDatePrefix(new Date());
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Normaliza segmento de branch (sem espaços nem caracteres problemáticos para ref).
 *
 * @param {string} segment
 * @returns {string}
 */
function sanitizeBranchSegment(segment) {
  return removeAccents(String(segment || "").toLowerCase())
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {string} branchName
 * @returns {string}
 */
function clampBranchLength(branchName) {
  let b = String(branchName || "");
  if (b.length <= MAX_BRANCH_LENGTH) return b;
  b = b.slice(0, MAX_BRANCH_LENGTH).replace(/-+$/, "");
  return b || "setup-boss/atividade";
}

/**
 * Sugere nome de branch de atividade: `setup-boss/<yyyyMMdd>-<slug>`.
 *
 * @param {string} title
 * @param {{
 *   date?: Date|string|number,
 *   prefix?: string,
 *   existingBranches?: string[],
 * }} [opts]
 * @returns {string}
 */
function suggestActivityBranchName(title, opts = {}) {
  const prefixRaw = opts.prefix != null ? String(opts.prefix).trim() : DEFAULT_PREFIX;
  const prefix =
    sanitizeBranchSegment(prefixRaw).replace(/\//g, "") || DEFAULT_PREFIX;
  const datePart = formatBranchDatePrefix(opts.date);
  const slug = slugifyActivityTitle(title);
  let base = `${prefix}/${datePart}-${slug}`;
  base = clampBranchLength(sanitizeBranchSegment(base));

  const existing = new Set(
    (opts.existingBranches || []).map((b) => String(b).trim().toLowerCase()).filter(Boolean),
  );
  let candidate = base;
  let n = 2;
  while (existing.has(candidate.toLowerCase())) {
    candidate = clampBranchLength(`${base}-${n}`);
    n += 1;
  }
  return candidate;
}

module.exports = {
  DEFAULT_PREFIX,
  MAX_BRANCH_LENGTH,
  MAX_SLUG_LENGTH,
  removeAccents,
  slugifyActivityTitle,
  formatBranchDatePrefix,
  sanitizeBranchSegment,
  clampBranchLength,
  suggestActivityBranchName,
};
