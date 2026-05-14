/**
 * Diagnostics agregados do Transaction Runtime (Fase 4.6).
 */

const fs = require("fs");
const path = require("path");

const { CONTRACT_FILENAME, TELEMETRY_FILENAME } = require("../constants");
const { validateReplayContinuity } = require("../replay-continuity-engine");

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} outputDir
 * @returns {object|null}
 */
function compactTransactionEnvelope(outputDir) {
  const dir = String(outputDir || "");
  if (!dir) return null;

  const p = path.join(dir, CONTRACT_FILENAME);
  if (!fs.existsSync(p)) return null;

  const doc = loadJson(p);
  if (!doc || typeof doc !== "object") return null;

  return {
    transaction_id: doc.transaction_id || null,
    plan_id: doc.plan_id || null,
    run_id: doc.run_id || null,
    generated_at: doc.generated_at || null,
    summary: doc.summary || null,
    checkpoint_count:
      doc.summary &&
      typeof doc.summary.checkpoint_count === "number" &&
      doc.summary.checkpoint_count > 0
        ? doc.summary.checkpoint_count
        : Array.isArray(doc.checkpoints)
          ? doc.checkpoints.length
          : 0,
    last_hooks: Array.isArray(doc.checkpoints)
      ? doc.checkpoints
          .slice(-6)
          .map((c) => (c && c.hook ? c.hook : null))
          .filter(Boolean)
      : [],
  };
}

function collectTransactionDiagnostics(outputDir, opts = {}) {
  const dir = String(outputDir || "");

  const envelop = compactTransactionEnvelope(dir);

  const out = {
    contract_present:
      Boolean(envelop) || fs.existsSync(path.join(dir, CONTRACT_FILENAME)),
    telemetry_log_present: fs.existsSync(path.join(dir, TELEMETRY_FILENAME)),
    latest_snapshot_present: fs.existsSync(path.join(dir, "execution-snapshot.json")),
    envelope: envelop,
    continuity:
      opts.skip_continuity === true ? null : validateReplayContinuity(dir),
  };

  if (opts.include_contract_body === true && dir && out.contract_present) {
    out.contract = loadJson(path.join(dir, CONTRACT_FILENAME));
  }

  return out;
}

module.exports = {
  collectTransactionDiagnostics,
  compactTransactionEnvelope,
};
