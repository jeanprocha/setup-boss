/**
 * Persistência replay-safe da memória de correção por run-dir.
 */

const fs = require("fs");
const path = require("path");
const {
  SCHEMA_VERSION_MEMORY,
  CORRECTION_MEMORY_FILENAME,
} = require("../constants");

function emptyMemory(planId = "", runId = "") {
  return {
    schema_version: SCHEMA_VERSION_MEMORY,
    plan_id: planId,
    run_id: runId,
    updated_at: new Date().toISOString(),
    last_failure_signature_sha256: null,
    identical_trigger_streak: 0,
    failure_signatures: {},
    retries: [],
    outcomes: [],
  };
}

function resolveMemoryPath(outputDir) {
  return path.join(String(outputDir || ""), CORRECTION_MEMORY_FILENAME);
}

function readJsonMaybe(p, fallback) {
  try {
    if (!p || !fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return fallback;
  }
}

function loadCorrectionMemory(outputDir) {
  const p = resolveMemoryPath(outputDir);
  const fb = emptyMemory("", path.basename(path.resolve(outputDir)));
  const data = readJsonMaybe(p, null);
  if (!data || typeof data !== "object") return fb;
  return normalizeMemoryShape(data);
}

function normalizeMemoryShape(data) {
  const out = { ...emptyMemory(), ...data };
  out.failure_signatures =
    typeof out.failure_signatures === "object" && out.failure_signatures
      ? { ...out.failure_signatures }
      : {};
  out.retries = Array.isArray(out.retries) ? out.retries.slice(-2000) : [];
  out.outcomes = Array.isArray(out.outcomes) ? out.outcomes.slice(-2000) : [];
  out.identical_trigger_streak = Number.isFinite(Number(out.identical_trigger_streak))
    ? Number(out.identical_trigger_streak)
    : 0;
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function persistCorrectionMemory(outputDir, memory) {
  const p = resolveMemoryPath(outputDir);
  ensureDir(path.dirname(p));
  const next = normalizeMemoryShape({ ...memory, updated_at: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function bumpSignatureStats(memory, signatureSha256) {
  const now = new Date().toISOString();
  const prev = memory.failure_signatures[signatureSha256] || {
    occurrences: 0,
    correction_outcomes: [],
  };
  const nextEntry = {
    ...prev,
    occurrences: Number(prev.occurrences || 0) + 1,
    last_at: now,
  };
  return {
    stats: nextEntry,
    merged: {
      ...memory,
      failure_signatures: {
        ...memory.failure_signatures,
        [signatureSha256]: nextEntry,
      },
    },
  };
}

module.exports = {
  loadCorrectionMemory,
  persistCorrectionMemory,
  emptyMemory,
  bumpSignatureStats,
};
