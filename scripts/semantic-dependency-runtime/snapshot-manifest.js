"use strict";

const fs = require("fs");
const path = require("path");
const {
  GRAPH_SNAPSHOT_SCHEMA_VERSION,
  GRAPH_SNAPSHOT_MANIFEST_FILENAME,
} = require("./constants");
const { digestGenerationPolicy } = require("./fingerprint/graph-fingerprint");

/**
 * @param {{
 *   snapshotId: string,
 *   graphId: string,
 *   graphFingerprintSha256: string,
 *   generationPolicy: object,
 *   inputsDigest: string,
 *   schemaVersion?: string,
 *   createdAt?: string,
 * }} opts
 */
function buildSnapshotManifestDocument(opts) {
  const schema_version =
    opts.schemaVersion != null && String(opts.schemaVersion).trim() !== ""
      ? String(opts.schemaVersion)
      : GRAPH_SNAPSHOT_SCHEMA_VERSION;
  const snapshot_id = String(opts.snapshotId || "").trim();
  const graph_id = String(opts.graphId || "").trim();
  const graph_fingerprint_sha256 = String(opts.graphFingerprintSha256 || "").trim();
  const generation_policy = opts.generationPolicy && typeof opts.generationPolicy === "object"
    ? opts.generationPolicy
    : { version: "semantic-dep-policy/0" };
  const generation_policy_sha256 = digestGenerationPolicy(generation_policy);
  const inputs_digest = String(opts.inputsDigest || "").trim();
  const created_at = opts.createdAt != null ? String(opts.createdAt) : new Date().toISOString();

  return {
    schema_version,
    snapshot_id,
    graph_id,
    graph_fingerprint_sha256,
    generation_policy_sha256,
    inputs_digest,
    created_at,
  };
}

function saveSnapshotManifest(outputDir, doc) {
  const full = path.join(String(outputDir || ""), GRAPH_SNAPSHOT_MANIFEST_FILENAME);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(doc, null, 2), "utf8");
}

function loadSnapshotManifest(outputDir) {
  const full = path.join(String(outputDir || ""), GRAPH_SNAPSHOT_MANIFEST_FILENAME);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

module.exports = {
  buildSnapshotManifestDocument,
  saveSnapshotManifest,
  loadSnapshotManifest,
};
