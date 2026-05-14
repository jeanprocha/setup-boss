/**
 * transaction-runtime-manifest.json — índice de referências transaccionais.
 */

const fs = require("fs");
const path = require("path");

const {
  CONTRACT_FILENAME,
  TRANSACTION_MANIFEST_FILENAME,
  TELEMETRY_FILENAME,
  SNAPSHOT_REL_DIR,
  LATEST_SNAPSHOT_FILENAME,
} = require("../constants");

function listSnapshotFiles(outputDir) {
  const d = path.join(outputDir, SNAPSHOT_REL_DIR);
  if (!fs.existsSync(d)) return [];
  try {
    return fs
      .readdirSync(d)
      .filter((n) => n.endsWith(".json"))
      .map((n) => path.join(SNAPSHOT_REL_DIR, n).replace(/\\/g, "/"))
      .sort();
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} outputDir
 * @param {object} envelope
 * @param {object} envelope.transaction — documento contract (ou subset)
 */
function writeTransactionRuntimeManifest(outputDir, envelope = {}) {
  const dir = String(outputDir || "");
  if (!dir) return;
  const tx = envelope.transaction && typeof envelope.transaction === "object" ? envelope.transaction : {};

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    run_id: tx.run_id || "",
    plan_id: tx.plan_id || "",
    transaction_id: tx.transaction_id || "",
    refs: {
      contract: ContractPathIfExists(dir),
      telemetry: fs.existsSync(path.join(dir, TELEMETRY_FILENAME)) ? TELEMETRY_FILENAME : null,
      latest_snapshot: fs.existsSync(path.join(dir, LATEST_SNAPSHOT_FILENAME))
        ? LATEST_SNAPSHOT_FILENAME
        : null,
      snapshot_dir: SNAPSHOT_REL_DIR,
      snapshot_files: listSnapshotFiles(dir),
      plan_artifacts: fs.existsSync(path.join(dir, "plan-artifacts.json"))
        ? "plan-artifacts.json"
        : null,
      runtime_checkpoints: fs.existsSync(path.join(dir, "runtime-checkpoints.json"))
        ? "runtime-checkpoints.json"
        : null,
    },
    continuity_ref: "embedded_in_contract",
    recovery_ref: "embedded_in_contract",
    rollback_ref: "embedded_in_contract",
    extensions: {},
  };

  const p = path.join(dir, TRANSACTION_MANIFEST_FILENAME);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2), "utf8");
}

function ContractPathIfExists(dir) {
  return fs.existsSync(path.join(dir, CONTRACT_FILENAME)) ? CONTRACT_FILENAME : null;
}

module.exports = {
  writeTransactionRuntimeManifest,
  listSnapshotFiles,
};
