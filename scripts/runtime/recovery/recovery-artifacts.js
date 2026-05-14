/**
 * Artefactos recovery-log.json e retry-history.json (append-only por sessão).
 */

const fs = require("fs");
const path = require("path");

const SCHEMA = 1;
const LOG_NAME = "recovery-log.json";
const HISTORY_NAME = "retry-history.json";

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function writeJsonAtomic(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

function loadOrCreateHistory(outputDir) {
  const p = path.join(outputDir, HISTORY_NAME);
  let doc = readJsonSafe(p);
  if (!doc || typeof doc !== "object") {
    doc = { schema_version: SCHEMA, entries: [] };
  }
  doc.schema_version = SCHEMA;
  if (!Array.isArray(doc.entries)) doc.entries = [];
  return { path: p, doc };
}

function loadOrCreateLog(outputDir, runId) {
  const p = path.join(outputDir, LOG_NAME);
  let doc = readJsonSafe(p);
  if (!doc || typeof doc !== "object") {
    doc = {
      schema_version: SCHEMA,
      run_id: runId,
      final_outcome: "NONE",
      sessions: [],
    };
  }
  doc.schema_version = SCHEMA;
  doc.run_id = runId;
  if (!Array.isArray(doc.sessions)) doc.sessions = [];
  return { path: p, doc };
}

function appendHistoryEntry(outputDir, entry) {
  const { path: p, doc } = loadOrCreateHistory(outputDir);
  doc.entries.push({
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJsonAtomic(p, doc);
}

function finalizeLogSession(outputDir, runId, session) {
  const { path: p, doc } = loadOrCreateLog(outputDir, runId);
  doc.sessions.push({
    finished_at: new Date().toISOString(),
    ...session,
  });
  doc.final_outcome = session.final_outcome || doc.final_outcome;
  writeJsonAtomic(p, doc);
}

function summarizeRecoveryFromArtifacts(outputDir) {
  const hist = readJsonSafe(path.join(outputDir, HISTORY_NAME));
  const log = readJsonSafe(path.join(outputDir, LOG_NAME));

  const entries = hist && Array.isArray(hist.entries) ? hist.entries : [];
  let executorMicro = 0;
  let provider = 0;
  let contextExpansions = 0;
  let recovered = 0;

  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    if (e.kind === "executor_micro") executorMicro += 1;
    if (e.kind === "provider") provider += 1;
    if (e.context_expansion && typeof e.context_expansion === "object") {
      contextExpansions += 1;
    }
    if (e.success === true) recovered += 1;
  }

  const final =
    log && typeof log.final_outcome === "string" ? log.final_outcome : "NONE";

  return {
    executor_micro_retries: executorMicro,
    provider_retries: provider,
    context_expansions: contextExpansions,
    recovery_events: entries.length,
    final_outcome: final,
  };
}

module.exports = {
  SCHEMA,
  LOG_NAME,
  HISTORY_NAME,
  appendHistoryEntry,
  finalizeLogSession,
  summarizeRecoveryFromArtifacts,
};
