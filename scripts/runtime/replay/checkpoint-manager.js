/**
 * Persistência de checkpoints para execução contínua / resume / replay diagnostics.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SCHEMA_VERSION = 1;
const FILENAME = "runtime-checkpoints.json";

function sha256File(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch (_) {
    return null;
  }
}

function artifactHashesForCheckpoint(outputDir, names) {
  const out = {};
  for (const n of names) {
    const p = path.join(outputDir, n);
    if (fs.existsSync(p)) out[n] = sha256File(p);
  }
  return out;
}

function readCheckpoints(outputDir) {
  const p = path.join(outputDir, FILENAME);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) {
    return null;
  }
}

function writeCheckpoints(outputDir, doc) {
  const p = path.join(outputDir, FILENAME);
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf-8");
}

/**
 * @param {object} opts
 * @param {string} opts.outputDir
 * @param {string} opts.runId
 * @param {string} opts.phaseCompleted - ex. AFTER_PREFLIGHT, AFTER_ARCHITECT, AFTER_EXECUTOR, AFTER_REVIEW, AFTER_CORRECTION
 * @param {string[]} [opts.artifactNames]
 * @param {object} [opts.replayability]
 * @param {object} [opts.extra]
 */
function appendCheckpoint(opts) {
  const {
    outputDir,
    runId,
    phaseCompleted,
    artifactNames = [],
    replayability = {},
    extra = {},
  } = opts;

  if (!outputDir || !runId || !phaseCompleted) return;

  let doc = readCheckpoints(outputDir);
  if (!doc || typeof doc !== "object") {
    doc = {
      schema_version: SCHEMA_VERSION,
      run_id: runId,
      checkpoints: [],
    };
  }

  doc.schema_version = SCHEMA_VERSION;
  doc.run_id = runId;

  const hashes = artifactHashesForCheckpoint(outputDir, artifactNames);

  doc.checkpoints.push({
    phase_completed: phaseCompleted,
    completed_at: new Date().toISOString(),
    artifact_hashes: hashes,
    replayability: {
      scan_skipped: replayability.scan_skipped ?? null,
      notes: replayability.notes || "",
    },
    extra,
  });

  writeCheckpoints(outputDir, doc);
}

function lastCheckpoint(outputDir) {
  const doc = readCheckpoints(outputDir);
  if (!doc || !Array.isArray(doc.checkpoints) || !doc.checkpoints.length) {
    return null;
  }
  return doc.checkpoints[doc.checkpoints.length - 1];
}

module.exports = {
  FILENAME,
  SCHEMA_VERSION,
  readCheckpoints,
  appendCheckpoint,
  lastCheckpoint,
  artifactHashesForCheckpoint,
};
