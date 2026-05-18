"use strict";

const os = require("os");
const path = require("path");

/** Basenames conhecidos de fixtures E2E. */
const FIXTURE_BASENAMES = new Set([
  "demo",
  "demo-project",
  "demo-block",
  "demo-no-plan",
]);

/** Basename/displayName que começam por demo (ex.: demo-no-plan). */
const DEMO_NAME_RE = /^demo(?:-|$)/i;

/** Prefixos visíveis na UI / ids de harness (case-insensitive). */
const FIXTURE_LABEL_PREFIX_RE =
  /^(?:DEMO-|demo-|SB-EXEC-|SB-CLAR-|SB-INTAKE-|sb-exec-|sb-clar-|sb-intake-)/i;

/** Segmentos de pasta temp usados por testes do daemon. */
const TEMP_HARNESS_SEGMENT_RE =
  /^(?:dbg-[\w-]+|sb-(?:exec-trigger|intake-api-ok|smoke|clar(?:-[\w-]+)?)[\w-]*)$/i;

/**
 * @param {string} raw
 * @returns {string}
 */
function canonicalProjectRoot(raw) {
  if (raw == null || typeof raw !== "string" || !String(raw).trim()) return "";
  return path.normalize(path.resolve(String(raw).trim()));
}

/**
 * @param {string} canon
 * @returns {boolean}
 */
function isUnderOsTempDir(canon) {
  const root = canonicalProjectRoot(canon);
  if (!root) return false;
  const tmp = canonicalProjectRoot(os.tmpdir());
  if (!tmp) return false;
  const rel = path.relative(tmp, root);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * @param {string} canon
 * @returns {boolean}
 */
function pathLooksLikeTempHarness(canon) {
  const root = canonicalProjectRoot(canon);
  if (!root || !isUnderOsTempDir(root)) return false;
  const base = String(path.basename(root)).trim();
  const parent = String(path.basename(path.dirname(root))).trim();
  if (TEMP_HARNESS_SEGMENT_RE.test(base)) return true;
  if (TEMP_HARNESS_SEGMENT_RE.test(parent)) return true;
  return false;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function looksLikeFixtureLabel(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  const lower = n.toLowerCase();
  if (FIXTURE_BASENAMES.has(lower)) return true;
  if (DEMO_NAME_RE.test(n)) return true;
  if (FIXTURE_LABEL_PREFIX_RE.test(n)) return true;
  return false;
}

/**
 * @param {Record<string, unknown>|null|undefined} m
 * @returns {boolean}
 */
function metadataIndicatesFixture(m) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return false;
  if (m.isDemo === true || m.demo === true) return true;
  const kind = String(m.kind || "").trim().toLowerCase();
  if (kind === "demo" || kind === "fixture" || kind === "test") return true;
  const src = m.source;
  if (src && typeof src === "object" && !Array.isArray(src)) {
    const mode = /** @type {{ mode?: string }} */ (src).mode;
    if (mode === "test-fixture") return true;
  }
  return false;
}

/**
 * @param {string} canon
 * @param {string} managedRootCanon
 * @returns {boolean}
 */
function isUnderManagedProjectsRoot(canon, managedRootCanon) {
  const root = canonicalProjectRoot(canon);
  const managed = canonicalProjectRoot(managedRootCanon);
  if (!root || !managed) return false;
  const rel = path.relative(managed, root);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Projecto operacional para Mission Control (sidebar, GET /projects).
 * Rejeita demos, harnesses em temp e entradas sem root.
 *
 * @param {object|null|undefined} row
 * @param {{ demoProjectsEnabled?: boolean, managedRootCanon?: string|null, requireManagedRoot?: boolean }} [opts]
 * @returns {boolean}
 */
function isOperationalProjectRow(row, opts = {}) {
  if (!row || typeof row !== "object") return false;
  if (opts.demoProjectsEnabled === true) return true;

  if (metadataIndicatesFixture(row.metadata)) return false;

  const root = row.projectRoot != null ? canonicalProjectRoot(String(row.projectRoot)) : "";
  if (!root) return false;

  if (pathLooksLikeTempHarness(root)) return false;

  const base = String(path.basename(root)).trim();
  const disp =
    row.displayName != null ? String(row.displayName).trim() : "";
  const pid = row.projectId != null ? String(row.projectId).trim() : "";

  if (looksLikeFixtureLabel(base)) return false;
  if (looksLikeFixtureLabel(disp)) return false;
  if (pid && looksLikeFixtureLabel(pid)) return false;

  if (isUnderOsTempDir(root) && looksLikeFixtureLabel(base)) return false;

  if (opts.requireManagedRoot && opts.managedRootCanon) {
    if (!isUnderManagedProjectsRoot(root, opts.managedRootCanon)) return false;
  }

  return true;
}

/** @deprecated use isOperationalProjectRow */
function isDemoProjectRow(row, opts) {
  return !isOperationalProjectRow(row, opts);
}

/**
 * @template T
 * @param {T[]} rows
 * @param {Parameters<typeof isOperationalProjectRow>[1]} [opts]
 * @returns {T[]}
 */
function filterOperationalProjects(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => isOperationalProjectRow(r, opts));
}

module.exports = {
  FIXTURE_BASENAMES,
  DEMO_NAME_RE,
  FIXTURE_LABEL_PREFIX_RE,
  canonicalProjectRoot,
  isUnderOsTempDir,
  pathLooksLikeTempHarness,
  looksLikeFixtureLabel,
  metadataIndicatesFixture,
  isUnderManagedProjectsRoot,
  isOperationalProjectRow,
  isDemoProjectRow,
  filterOperationalProjects,
};
