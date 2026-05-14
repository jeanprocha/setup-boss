/**
 * Fingerprints determinísticos do Execution Plan (replay, dedupe, auditoria).
 */

const crypto = require("crypto");
const { normalizeOperations } = require("../normalization/operation-normalizer");

/**
 * Serialização JSON estável (chaves ordenadas, arrays preservados na ordem).
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  if (t !== "object") return JSON.stringify(String(value));
  const keys = Object.keys(value).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${parts.join(",")}}`;
}

function sha256HexUtf8(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

/**
 * Normaliza texto para dedupe semântico leve (intent).
 * @param {string} text
 */
function normalizeIntentKey(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Payload canónico para fingerprint — exclui campos voláteis / só observabilidade.
 * @param {object} planSlice — documento parcial ou completo
 */
function buildFingerprintPayload(planSlice) {
  const ancestry = planSlice.revision_lineage || null;
  const ops = Array.isArray(planSlice.operations) ? planSlice.operations : [];
  const normOps = normalizeOperations(ops);

  const files = Array.isArray(planSlice.allowed_files)
    ? [...planSlice.allowed_files].map((f) => String(f).replace(/\\/g, "/")).sort()
    : [];

  const intent = planSlice.intent && typeof planSlice.intent === "object"
    ? {
        summary_key: normalizeIntentKey(planSlice.intent.summary || ""),
        task_path: planSlice.intent.task_path || "",
      }
    : {};

  const strategy =
    planSlice.execution_strategy && typeof planSlice.execution_strategy === "object"
      ? planSlice.execution_strategy
      : {};

  return {
    schema_version: planSlice.schema_version,
    intent,
    operations: normOps,
    allowed_files: files,
    execution_strategy: strategy,
    revision_ancestry: ancestry,
  };
}

/**
 * @param {object} planSlice
 * @returns {{ fingerprint_sha256: string, canonical_json: string }}
 */
function computePlanFingerprint(planSlice) {
  const payload = buildFingerprintPayload(planSlice);
  const canonicalJson = stableStringify(payload);
  return {
    fingerprint_sha256: sha256HexUtf8(canonicalJson),
    canonical_json: canonicalJson,
  };
}

module.exports = {
  stableStringify,
  sha256HexUtf8,
  normalizeIntentKey,
  buildFingerprintPayload,
  computePlanFingerprint,
};
