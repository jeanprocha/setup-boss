/**
 * Cache local por run — fingerprints de conteúdo, sem cache distribuído (Fase 4.2).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VALIDATION_RUNTIME_CACHE_DIRNAME } = require("../constants");

function cacheRootForOutputDir(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_RUNTIME_CACHE_DIRNAME);
}

/**
 * @param {string} projectRoot
 * @param {string[]} relPathsSorted
 */
function computeInputFingerprint(projectRoot, relPathsSorted) {
  const root = String(projectRoot || "");
  const parts = [];
  for (const rel of relPathsSorted) {
    const p = path.join(root, rel);
    let digest = "missing";
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        digest = crypto.createHash("sha256").update(buf).digest("hex");
      }
    } catch (_) {
      digest = "read_error";
    }
    parts.push(`${rel}:${digest}`);
  }
  return crypto.createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * @param {{ validator_type: string, stage: string, paths: string[], input_fp: string }} parts
 */
function computeCacheKey(parts) {
  const payload = [
    String(parts.validator_type || ""),
    String(parts.stage || ""),
    [...(parts.paths || [])].sort((a, b) => a.localeCompare(b)).join("\u001f"),
    String(parts.input_fp || ""),
  ].join("\u001e");
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function ensureCacheDir(outputDir) {
  const dir = cacheRootForOutputDir(outputDir);
  if (!dir) return null;
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} keySha256Hex
 * @returns {object|null}
 */
function readCacheEntry(outputDir, keySha256Hex) {
  const root = cacheRootForOutputDir(outputDir);
  const p = path.join(root, `${keySha256Hex}.json`);
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @param {string} keySha256Hex
 * @param {object} payload deve incluir replay_fingerprint_sha256 + normalized validator snapshot
 */
function writeCacheEntry(outputDir, keySha256Hex, payload) {
  const root = ensureCacheDir(outputDir);
  if (!root) return false;
  const p = path.join(root, `${keySha256Hex}.json`);
  try {
    fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  cacheRootForOutputDir,
  computeInputFingerprint,
  computeCacheKey,
  readCacheEntry,
  writeCacheEntry,
  ensureCacheDir,
};
