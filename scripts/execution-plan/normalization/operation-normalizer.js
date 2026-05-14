/**
 * Normalização canónica de operações do Execution Plan (Fase 4.1.1).
 * Garante ordenação determinística, campos consistentes e hashing estável.
 */

const crypto = require("crypto");

/**
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
 * @param {unknown} p
 * @returns {string|null}
 */
function normalizePath(p) {
  if (p == null) return null;
  const s = String(p).trim().replace(/\\/g, "/");
  return s === "" ? null : s;
}

/**
 * @param {unknown} op
 * @returns {object|null}
 */
function normalizeOperation(op) {
  if (!op || typeof op !== "object") return null;
  const deps = Array.isArray(op.dependencies)
    ? [...op.dependencies].map(String).sort()
    : [];
  return {
    operation_id: op.operation_id != null ? String(op.operation_id) : op.operation_id,
    type: op.type != null ? String(op.type) : op.type,
    mode: op.mode != null ? String(op.mode) : op.mode,
    target: op.target,
    file: op.file != null ? String(op.file).replace(/\\/g, "/") : op.file,
    search: op.search != null ? String(op.search) : op.search,
    replace: op.replace != null ? String(op.replace) : op.replace,
    reasoning: op.reasoning != null ? normalizeIntentKey(String(op.reasoning)) : op.reasoning,
    dependencies: deps,
    risk_level: op.risk_level != null ? String(op.risk_level) : op.risk_level,
    metadata: op.metadata && typeof op.metadata === "object" ? op.metadata : {},
  };
}

/**
 * @param {unknown[]} ops
 * @returns {object[]}
 */
function normalizeOperations(ops) {
  const list = Array.isArray(ops) ? ops.map(normalizeOperation).filter(Boolean) : [];
  list.sort((a, b) => String(a.operation_id).localeCompare(String(b.operation_id)));
  return list;
}

function stableStringifyOp(op) {
  if (op === null || op === undefined) return JSON.stringify(op);
  const t = typeof op;
  if (t === "number" || t === "boolean") return JSON.stringify(op);
  if (t === "string") return JSON.stringify(op);
  if (Array.isArray(op)) {
    return `[${op.map((x) => stableStringifyOp(x)).join(",")}]`;
  }
  if (t !== "object") return JSON.stringify(String(op));
  const keys = Object.keys(op).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringifyOp(op[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Hash estável por operação normalizada (auditoria / dedupe).
 * @param {unknown} op
 */
function hashNormalizedOperation(op) {
  const n = normalizeOperation(op);
  if (!n) return null;
  return crypto.createHash("sha256").update(stableStringifyOp(n), "utf8").digest("hex");
}

module.exports = {
  normalizeIntentKey,
  normalizePath,
  normalizeOperation,
  normalizeOperations,
  hashNormalizedOperation,
  stableStringifyOp,
};
