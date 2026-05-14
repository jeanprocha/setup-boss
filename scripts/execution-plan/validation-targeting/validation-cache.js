/**
 * Fase 4.10.4 — Validation cache runtime (local, síncrono, artefactos do run).
 * Chave determinística — sem timestamps no fingerprint de lookup; stdout/stderr fora do fingerprint.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { stableStringify, sha256HexUtf8 } = require("../fingerprint/plan-fingerprint");
const { VALIDATION_CACHE_FILENAME } = require("./constants");

const VALIDATION_CACHE_SCHEMA_CONTRACT = "validation-cache/1";

function validationCachePath(outputDir) {
  return path.join(String(outputDir || ""), VALIDATION_CACHE_FILENAME);
}

function isValidationCacheEnabled() {
  const v = process.env.SETUP_BOSS_VALIDATION_CACHE;
  if (v === undefined || v === "") return true;
  const t = String(v).trim().toLowerCase();
  return t !== "0" && t !== "off" && t !== "false" && t !== "no";
}

function loadValidationCache(outputDir) {
  const dir = String(outputDir || "");
  const p = validationCachePath(dir);
  try {
    if (!dir || !fs.existsSync(p)) {
      return emptyValidationCacheDocument();
    }
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") return emptyValidationCacheDocument();
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    return normalizeLoadedCache(raw, entries);
  } catch (_) {
    return emptyValidationCacheDocument();
  }
}

function emptyValidationCacheDocument() {
  return {
    version: 1,
    schema_contract: VALIDATION_CACHE_SCHEMA_CONTRACT,
    entries: [],
    fingerprints: {
      cache_entries_identity_sha256: sha256HexUtf8(
        stableStringify({ schema_contract: VALIDATION_CACHE_SCHEMA_CONTRACT, version: 1, rows: [] }),
      ),
    },
    metadata: {},
  };
}

function normalizeLoadedCache(raw, entries) {
  const sorted = [...entries]
    .filter((e) => e && typeof e === "object")
    .sort((a, b) => String(a.cache_key || "").localeCompare(String(b.cache_key || "")));
  const fp = computeCacheEntriesIdentityFingerprint(sorted);
  return {
    version: 1,
    schema_contract: VALIDATION_CACHE_SCHEMA_CONTRACT,
    entries: sorted,
    fingerprints: {
      cache_entries_identity_sha256: fp,
    },
    metadata: raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {},
  };
}

/**
 * Fingerprint do resultado cacheável — sem stdout/stderr; sem timestamps.
 */
function computeResultFingerprintSha256(status, exitCode) {
  return sha256HexUtf8(
    stableStringify({
      schema: "validation-cache-result/1",
      status: String(status || ""),
      exit_code: exitCode === undefined || exitCode === null ? null : Number(exitCode),
    }),
  );
}

/**
 * Chave determinística — validation-plan + comando + validator + target (replay-safe).
 */
function computeValidationCacheKey(parts) {
  const validation_plan_identity_sha256 = String(parts.validation_plan_identity_sha256 || "");
  const command_id = String(parts.command_id || "");
  const validator_id = String(parts.validator_id || "");
  const target_id = String(parts.target_id || "");
  return sha256HexUtf8(
    stableStringify({
      schema: "validation-cache-key/1",
      validation_plan_identity_sha256,
      command_id,
      validator_id,
      target_id,
    }),
  );
}

function computeCacheEntriesIdentityFingerprint(sortedEntries) {
  const rows = [...sortedEntries].map((e) => ({
    cache_key: String(e.cache_key || ""),
    command_id: String(e.command_id || ""),
    validator_id: String(e.validator_id || ""),
    target_id: String(e.target_id || ""),
    validation_plan_identity_sha256: String(e.validation_plan_identity_sha256 || ""),
    result_fingerprint_sha256: String(e.result_fingerprint_sha256 || ""),
    status: String(e.status || ""),
    exit_code: e.exit_code === undefined || e.exit_code === null ? null : Number(e.exit_code),
    result_ref: String(e.result_ref || ""),
  }));
  return sha256HexUtf8(
    stableStringify({
      schema_contract: VALIDATION_CACHE_SCHEMA_CONTRACT,
      version: 1,
      rows,
    }),
  );
}

/**
 * Apenas reuse de passed — falhas não são servidas do cache.
 *
 * @param {{
 *   entries?: object[],
 *   validation_plan_identity_sha256: string,
 *   command_id: string,
 *   validator_id: string,
 *   target_id: string,
 * }} params — entries opcional (documento já carregado).
 * @param {string} [outputDir] — usado se entries omitido
 * @returns {object|null}
 */
function lookupCacheForValidationCommand(outputDir, params) {
  const p = params || {};
  let entries = Array.isArray(p.entries) ? p.entries : null;
  if (!entries && outputDir) {
    entries = loadValidationCache(outputDir).entries;
  }
  if (!entries) return null;

  const validation_plan_identity_sha256 = String(p.validation_plan_identity_sha256 || "");
  const command_id = String(p.command_id || "");
  const validator_id = String(p.validator_id || "");
  const target_id = String(p.target_id || "");

  const cache_key = computeValidationCacheKey({
    validation_plan_identity_sha256,
    command_id,
    validator_id,
    target_id,
  });

  const candidate = entries.find((e) => e && e.cache_key === cache_key);
  if (!candidate) return null;

  if (String(candidate.validation_plan_identity_sha256 || "") !== validation_plan_identity_sha256)
    return null;
  if (String(candidate.command_id || "") !== command_id) return null;
  if (String(candidate.validator_id || "") !== validator_id) return null;
  if (String(candidate.target_id || "") !== target_id) return null;
  if (String(candidate.status || "") !== "passed") return null;

  const expectedFp = computeResultFingerprintSha256("passed", candidate.exit_code);
  if (String(candidate.result_fingerprint_sha256 || "") !== expectedFp) return null;

  return candidate;
}

/**
 * Persiste entrada apenas para status passed (política Fase 4.10.4).
 *
 * @returns {object} documento cache completo após merge
 */
function persistValidationCacheEntry(outputDir, entryInput) {
  const dir = String(outputDir || "");
  if (!dir || !entryInput || typeof entryInput !== "object") {
    return emptyValidationCacheDocument();
  }

  const doc = loadValidationCache(dir);
  if (String(entryInput.status || "") !== "passed") return doc;

  const entry = { ...entryInput };
  entry.cache_key = String(entry.cache_key || "");
  entry.result_fingerprint_sha256 = computeResultFingerprintSha256(
    "passed",
    entry.exit_code === undefined || entry.exit_code === null ? null : Number(entry.exit_code),
  );

  const map = new Map(doc.entries.map((e) => [String(e.cache_key || ""), e]));
  map.set(entry.cache_key, entry);

  const merged = {
    ...doc,
    version: 1,
    schema_contract: VALIDATION_CACHE_SCHEMA_CONTRACT,
    entries: [...map.values()].sort((a, b) =>
      String(a.cache_key || "").localeCompare(String(b.cache_key || "")),
    ),
  };
  merged.fingerprints = {
    cache_entries_identity_sha256: computeCacheEntriesIdentityFingerprint(merged.entries),
  };

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(validationCachePath(dir), JSON.stringify(merged, null, 2), "utf8");

  return merged;
}

function buildPassedCacheEntry(fields) {
  const validation_plan_identity_sha256 = String(fields.validation_plan_identity_sha256 || "");
  const command_id = String(fields.command_id || "");
  const validator_id = String(fields.validator_id || "");
  const target_id = String(fields.target_id || "");
  const exit_code =
    fields.exit_code === undefined || fields.exit_code === null ? null : Number(fields.exit_code);

  const cache_key = computeValidationCacheKey({
    validation_plan_identity_sha256,
    command_id,
    validator_id,
    target_id,
  });

  const result_fingerprint_sha256 = computeResultFingerprintSha256("passed", exit_code);

  return {
    cache_key,
    command_id,
    validator_id,
    target_id,
    validation_plan_identity_sha256,
    result_fingerprint_sha256,
    status: "passed",
    exit_code,
    created_at: new Date().toISOString(),
    result_ref: "inline",
    stdout: fields.stdout != null ? String(fields.stdout) : "",
    stderr: fields.stderr != null ? String(fields.stderr) : "",
    duration_ms:
      fields.duration_ms !== undefined && fields.duration_ms !== null
        ? Number(fields.duration_ms)
        : 0,
  };
}

module.exports = {
  VALIDATION_CACHE_SCHEMA_CONTRACT,
  validationCachePath,
  isValidationCacheEnabled,
  loadValidationCache,
  computeValidationCacheKey,
  computeResultFingerprintSha256,
  lookupCacheForValidationCommand,
  persistValidationCacheEntry,
  buildPassedCacheEntry,
  computeCacheEntriesIdentityFingerprint,
};
